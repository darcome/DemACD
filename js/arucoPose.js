/**
 * Agility Course Designer - ArUco 3D Pose Estimator
 * Real-time 6-DoF camera/field pose estimation using planar homography decomposition.
 * Supports single-marker placement, multi-marker refinement, Lock Anchor, and device gyroscope fusion.
 */

class ArUcoPoseEstimator {
  constructor(options = {}) {
    this.markerSizeMeters = options.markerSizeMeters || 0.25; // Default 25cm
    this.fovDegrees = options.fovDegrees || 60.0;             // Standard webcam horizontal FOV
    this.gracePeriodMs = options.gracePeriodMs || 1500;       // Hold pose for 1.5s on occlusion
    this.smoothAlpha = options.smoothAlpha || 0.35;           // EMA smoothing factor (0 = infinite lag, 1 = raw)

    // Current tracking state
    this.currentPose = null;       // { position: {x,y,z}, rotationQuaternion: {x,y,z,w}, rawMatrix, timestamp }
    this.smoothedPose = null;      // Smoothed version of currentPose
    this.lastSeenTime = 0;
    this.activeMarkerCount = 0;
    this.primaryMarkerKey = null;

    // Lock Anchor Mode (allows walking around field with fixed 3D anchor)
    this.isAnchorLocked = false;
    this.lockedPose = null;

    // Device Gyroscope / Orientation Sensor Fusion
    this.hasGyro = false;
    this.gyroBaseOrientation = null;
    this.currentDeviceOrientation = null;
    this._initDeviceSensors();
  }

  setMarkerSize(meters) {
    if (meters > 0) {
      this.markerSizeMeters = parseFloat(meters);
    }
  }

  setAnchorLocked(locked) {
    this.isAnchorLocked = !!locked;
    if (this.isAnchorLocked && this.smoothedPose) {
      this.lockedPose = {
        position: { ...this.smoothedPose.position },
        rotationQuaternion: { ...this.smoothedPose.rotationQuaternion }
      };
      if (this.currentDeviceOrientation) {
        this.gyroBaseOrientation = { ...this.currentDeviceOrientation };
      }
    } else if (!this.isAnchorLocked) {
      this.lockedPose = null;
    }
  }

  toggleAnchorLock() {
    this.setAnchorLocked(!this.isAnchorLocked);
    return this.isAnchorLocked;
  }

  reset() {
    this.currentPose = null;
    this.smoothedPose = null;
    this.lastSeenTime = 0;
    this.activeMarkerCount = 0;
    this.primaryMarkerKey = null;
    this.isAnchorLocked = false;
    this.lockedPose = null;
  }

  // --- DEVICE GYROSCOPE & SENSOR FUSION ---
  _initDeviceSensors() {
    if (typeof window === 'undefined') return;

    const handleOrientation = (e) => {
      if (e.alpha === null || e.beta === null || e.gamma === null) return;
      this.hasGyro = true;
      this.currentDeviceOrientation = {
        alpha: e.alpha, // compass rotation [0, 360)
        beta: e.beta,   // front-to-back tilt [-180, 180)
        gamma: e.gamma  // left-to-right tilt [-90, 90)
      };
    };

    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', handleOrientation, true);
    }
  }

  async requestGyroPermission() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const response = await DeviceOrientationEvent.requestPermission();
        return response === 'granted';
      } catch (err) {
        console.warn('DeviceOrientation permission error:', err);
        return false;
      }
    }
    return true;
  }

  // --- CAMERA INTRINSICS ---
  getCameraIntrinsics(width, height) {
    const fovRad = (this.fovDegrees * Math.PI) / 180;
    const fx = (width / 2) / Math.tan(fovRad / 2);
    const fy = fx; // Square pixels
    const cx = width / 2;
    const cy = height / 2;
    return { fx, fy, cx, cy };
  }

  // --- 8 PREDEFINED MARKER FIELD POSITIONS ---
  /**
   * Returns 3D coordinates in meters [X, 0, Z] in field space for each of the 8 perimeter markers.
   * Field coordinate system: Center is (0,0,0), X is width (-W/2 to +W/2), Z is length (+L/2 to -L/2).
   */
  getMarkerFieldCoordinates(field) {
    const W = field ? (field.widthMeters || 40) : 40;
    const L = field ? (field.lengthMeters || 20) : 20;
    const halfW = W / 2;
    const halfL = L / 2;

    return {
      top_left:     { x: -halfW, y: 0, z: halfL },
      top_mid:      { x: 0,      y: 0, z: halfL },
      top_right:    { x: halfW,  y: 0, z: halfL },
      right_mid:    { x: halfW,  y: 0, z: 0 },
      bottom_right: { x: halfW,  y: 0, z: -halfL },
      bottom_mid:   { x: 0,      y: 0, z: -halfL },
      bottom_left:  { x: -halfW, y: 0, z: -halfL },
      left_mid:     { x: -halfW, y: 0, z: 0 }
    };
  }

  /**
   * Main pose estimation entry point called per video frame.
   * @param {Array} detectedMarkers - Array of { id, corners: [{x,y}...4], center: {x,y} }
   * @param {Object} idToKeyMap - Map of marker ID to field definition key (e.g. { 0: 'top_left' })
   * @param {Object} field - Agility Field model
   * @param {number} imgWidth - Camera canvas pixel width
   * @param {number} imgHeight - Camera canvas pixel height
   */
  estimatePose(detectedMarkers, idToKeyMap, field, imgWidth, imgHeight) {
    const now = Date.now();

    // 1. If Lock Anchor is active, retain frozen anchor position
    if (this.isAnchorLocked && this.lockedPose) {
      return {
        pose: this.lockedPose,
        status: 'locked',
        markerCount: detectedMarkers ? detectedMarkers.length : 0,
        isLocked: true
      };
    }

    const fieldCoords = this.getMarkerFieldCoordinates(field);
    const K = this.getCameraIntrinsics(imgWidth, imgHeight);

    // Identify detected markers that match known field positions
    const validMarkers = [];
    if (detectedMarkers && detectedMarkers.length > 0) {
      for (const m of detectedMarkers) {
        const key = idToKeyMap[m.id];
        if (key && fieldCoords[key] && m.corners && m.corners.length === 4) {
          validMarkers.push({
            id: m.id,
            key: key,
            fieldPos: fieldCoords[key],
            corners: m.corners,
            center: m.center
          });
        }
      }
    }

    this.activeMarkerCount = validMarkers.length;

    // --- CASE 1: AT LEAST ONE MARKER DETECTED ---
    if (validMarkers.length > 0) {
      this.lastSeenTime = now;
      let rawPose = null;

      if (validMarkers.length === 1) {
        // Single-Marker Pose Estimation
        this.primaryMarkerKey = validMarkers[0].key;
        rawPose = this._estimateFromSingleMarker(validMarkers[0], K);
      } else {
        // Multi-Marker Refinement Pose Estimation
        this.primaryMarkerKey = validMarkers.map(m => m.key).join('+');
        rawPose = this._estimateFromMultipleMarkers(validMarkers, K);
      }

      if (rawPose) {
        // Smooth pose with exponential moving average and quaternion SLERP
        this.smoothedPose = this._smoothPose(rawPose, this.smoothedPose, this.smoothAlpha);
        this.currentPose = rawPose;

        return {
          pose: this.smoothedPose,
          status: validMarkers.length === 1 ? 'single' : 'multi',
          markerCount: validMarkers.length,
          primaryKey: this.primaryMarkerKey,
          isLocked: false
        };
      }
    }

    // --- CASE 2: NO MARKERS IN CURRENT FRAME ---
    // Check if within grace period (prevent flickering on brief occlusion)
    if (this.smoothedPose && (now - this.lastSeenTime <= this.gracePeriodMs)) {
      return {
        pose: this.smoothedPose,
        status: 'holding',
        markerCount: 0,
        elapsedHolding: now - this.lastSeenTime,
        isLocked: false
      };
    }

    // Tracking lost
    return {
      pose: null,
      status: 'lost',
      markerCount: 0,
      isLocked: false
    };
  }

  // --- SINGLE-MARKER POSE CALCULATION ---
  _estimateFromSingleMarker(marker, K) {
    const s = this.markerSizeMeters;
    const s2 = s / 2;

    // Local marker 4 corners on ground plane Y=0:
    // Clockwise: 0: Top-Left, 1: Top-Right, 2: Bottom-Right, 3: Bottom-Left
    // Local X right, Local Z forward (North)
    const localCorners = [
      { x: -s2, z:  s2 }, // c0: top-left
      { x:  s2, z:  s2 }, // c1: top-right
      { x:  s2, z: -s2 }, // c2: bottom-right
      { x: -s2, z: -s2 }  // c3: bottom-left
    ];

    // Compute 3x3 homography H mapping from local (X, Z, 1) to image (u, v, 1)
    const H = this._computeHomography(localCorners, marker.corners);
    if (!H) return null;

    // Decompose H into camera-space rotation matrix R and translation vector T
    const decomp = this._decomposeHomography(H, K);
    if (!decomp) return null;

    const { R, T } = decomp;

    // Offset from marker position to full field origin (0,0,0):
    // P_field = [X_f, 0, Z_f].
    // P_cam = R * (P_field - FieldPos_marker) + T_marker
    //       = R * P_field + (T_marker - R * FieldPos_marker)
    const F = marker.fieldPos; // { x, y: 0, z }
    const RFx = R[0][0] * F.x + R[0][1] * F.y + R[0][2] * F.z;
    const RFy = R[1][0] * F.x + R[1][1] * F.y + R[1][2] * F.z;
    const RFz = R[2][0] * F.x + R[2][1] * F.y + R[2][2] * F.z;

    const T_field_cv = {
      x: T.x - RFx,
      y: T.y - RFy,
      z: T.z - RFz
    };

    // Convert OpenCV camera coordinate frame to Babylon.js coordinate frame:
    // OpenCV: +X right, +Y down, +Z forward
    // Babylon: +X right, +Y up, +Z forward (left-handed)
    return this._convertCvToBabylon(R, T_field_cv);
  }

  // --- MULTI-MARKER POSE CALCULATION ---
  _estimateFromMultipleMarkers(markers, K) {
    const s = this.markerSizeMeters;
    const s2 = s / 2;

    const groundPoints = [];
    const imagePoints = [];

    // Collect all corners across all visible markers in global field space
    for (const m of markers) {
      const F = m.fieldPos;
      const cornerFieldPositions = [
        { x: F.x - s2, z: F.z + s2 }, // c0
        { x: F.x + s2, z: F.z + s2 }, // c1
        { x: F.x + s2, z: F.z - s2 }, // c2
        { x: F.x - s2, z: F.z - s2 }  // c3
      ];

      for (let i = 0; i < 4; i++) {
        groundPoints.push(cornerFieldPositions[i]);
        imagePoints.push(m.corners[i]);
      }
    }

    // Compute global field ground-plane homography H using all 4N correspondences
    const H = this._computeHomographyMulti(groundPoints, imagePoints);
    if (!H) {
      // Fallback to single marker if multi-point solve fails
      return this._estimateFromSingleMarker(markers[0], K);
    }

    const decomp = this._decomposeHomography(H, K);
    if (!decomp) {
      return this._estimateFromSingleMarker(markers[0], K);
    }

    // With groundPoints already in field space, decomp gives field pose directly!
    return this._convertCvToBabylon(decomp.R, decomp.T);
  }

  // --- HOMOGRAPHY SOLVER (4 POINTS) ---
  _computeHomography(srcPts, dstPts) {
    // 8x8 system: A * h = B, where h = [h11, h12, h13, h21, h22, h23, h31, h32]^T and h33 = 1
    const A = [];
    const B = [];

    for (let i = 0; i < 4; i++) {
      const X = srcPts[i].x;
      const Z = srcPts[i].z;
      const u = dstPts[i].x;
      const v = dstPts[i].y;

      A.push([X, Z, 1, 0, 0, 0, -u * X, -u * Z]);
      B.push(u);

      A.push([0, 0, 0, X, Z, 1, -v * X, -v * Z]);
      B.push(v);
    }

    const h = this._solveLinearSystem(A, B);
    if (!h) return null;

    return [
      [h[0], h[1], h[2]],
      [h[3], h[4], h[5]],
      [h[6], h[7], 1.0]
    ];
  }

  // --- MULTI-POINT HOMOGRAPHY (NORMAL EQUATIONS) ---
  _computeHomographyMulti(srcPts, dstPts) {
    const N = srcPts.length;
    const AtA = Array.from({ length: 8 }, () => new Float64Array(8));
    const AtB = new Float64Array(8);

    for (let i = 0; i < N; i++) {
      const X = srcPts[i].x;
      const Z = srcPts[i].z;
      const u = dstPts[i].x;
      const v = dstPts[i].y;

      // Row 1
      const r1 = [X, Z, 1, 0, 0, 0, -u * X, -u * Z];
      const b1 = u;
      for (let j = 0; j < 8; j++) {
        AtB[j] += r1[j] * b1;
        for (let k = 0; k < 8; k++) {
          AtA[j][k] += r1[j] * r1[k];
        }
      }

      // Row 2
      const r2 = [0, 0, 0, X, Z, 1, -v * X, -v * Z];
      const b2 = v;
      for (let j = 0; j < 8; j++) {
        AtB[j] += r2[j] * b2;
        for (let k = 0; k < 8; k++) {
          AtA[j][k] += r2[j] * r2[k];
        }
      }
    }

    const AtA_mat = Array.from({ length: 8 }, (_, r) => Array.from(AtA[r]));
    const AtB_arr = Array.from(AtB);

    const h = this._solveLinearSystem(AtA_mat, AtB_arr);
    if (!h) return null;

    return [
      [h[0], h[1], h[2]],
      [h[3], h[4], h[5]],
      [h[6], h[7], 1.0]
    ];
  }

  // --- HOMOGRAPHY DECOMPOSITION (ZHANG / FAUGERAS) ---
  _decomposeHomography(H, K) {
    const fx = K.fx;
    const fy = K.fy;
    const cx = K.cx;
    const cy = K.cy;

    // Normalized homography: H_tilde = K^-1 * H
    // K^-1 * [h1, h2, h3]
    const H_tilde = [
      [ (H[0][0] - cx * H[2][0]) / fx, (H[0][1] - cx * H[2][1]) / fx, (H[0][2] - cx * H[2][2]) / fx ],
      [ (H[1][0] - cy * H[2][0]) / fy, (H[1][1] - cy * H[2][1]) / fy, (H[1][2] - cy * H[2][2]) / fy ],
      [ H[2][0],                       H[2][1],                       H[2][2] ]
    ];

    const h1 = [H_tilde[0][0], H_tilde[1][0], H_tilde[2][0]];
    const h2 = [H_tilde[0][1], H_tilde[1][1], H_tilde[2][1]];
    const h3 = [H_tilde[0][2], H_tilde[1][2], H_tilde[2][2]];

    const norm1 = Math.sqrt(h1[0] * h1[0] + h1[1] * h1[1] + h1[2] * h1[2]);
    const norm2 = Math.sqrt(h2[0] * h2[0] + h2[1] * h2[1] + h2[2] * h2[2]);
    if (norm1 < 1e-7 || norm2 < 1e-7) return null;

    let lambda = 2.0 / (norm1 + norm2);
    // In camera coordinates, translation Z must be positive (in front of camera)
    if (h3[2] < 0) {
      lambda = -lambda;
    }

    // Local X axis (East) in camera space
    let r1 = [lambda * h1[0], lambda * h1[1], lambda * h1[2]];
    // Local Z axis (North) in camera space
    let r3 = [lambda * h2[0], lambda * h2[1], lambda * h2[2]];
    // Translation
    const T = {
      x: lambda * h3[0],
      y: lambda * h3[1],
      z: lambda * h3[2]
    };

    // r2 = r3 x r1 (Normal to ground, -Y in OpenCV convention)
    let r2 = [
      r3[1] * r1[2] - r3[2] * r1[1],
      r3[2] * r1[0] - r3[0] * r1[2],
      r3[0] * r1[1] - r3[1] * r1[0]
    ];

    // Orthonormalize rotation matrix using Gram-Schmidt:
    const len1 = Math.sqrt(r1[0] * r1[0] + r1[1] * r1[1] + r1[2] * r1[2]);
    r1 = [r1[0] / len1, r1[1] / len1, r1[2] / len1];

    const dot12 = r2[0] * r1[0] + r2[1] * r1[1] + r2[2] * r1[2];
    r2 = [r2[0] - dot12 * r1[0], r2[1] - dot12 * r1[1], r2[2] - dot12 * r1[2]];
    const len2 = Math.sqrt(r2[0] * r2[0] + r2[1] * r2[1] + r2[2] * r2[2]);
    r2 = [r2[0] / len2, r2[1] / len2, r2[2] / len2];

    // Ensure right-handed rotation: r3 = r1 x r2
    r3 = [
      r1[1] * r2[2] - r1[2] * r2[1],
      r1[2] * r2[0] - r1[0] * r2[2],
      r1[0] * r2[1] - r1[1] * r2[0]
    ];

    // 3x3 Rotation matrix R (columns are r1, r2, r3)
    const R = [
      [r1[0], r2[0], r3[0]],
      [r1[1], r2[1], r3[1]],
      [r1[2], r2[2], r3[2]]
    ];

    return { R, T };
  }

  // --- OPENCV TO BABYLON.JS COORDINATE TRANSFORMATION ---
  _convertCvToBabylon(R_cv, T_cv) {
    // OpenCV: +X right, +Y down, +Z forward
    // Babylon: +X right, +Y up, +Z forward
    // Invert Y in translation
    const posBabylon = {
      x: T_cv.x,
      y: -T_cv.y,
      z: T_cv.z
    };

    // For rotation, invert Y row and Y column: R_bab = S * R_cv * S with S = diag(1, -1, 1)
    const R_bab = [
      [ R_cv[0][0], -R_cv[0][1],  R_cv[0][2] ],
      [-R_cv[1][0],  R_cv[1][1], -R_cv[1][2] ],
      [ R_cv[2][0], -R_cv[2][1],  R_cv[2][2] ]
    ];

    const q = this._quaternionFromMatrix(R_bab);

    return {
      position: posBabylon,
      rotationQuaternion: q,
      rawMatrix: R_bab,
      timestamp: Date.now()
    };
  }

  // --- ROTATION MATRIX TO QUATERNION ---
  _quaternionFromMatrix(m) {
    const m00 = m[0][0], m01 = m[0][1], m02 = m[0][2];
    const m10 = m[1][0], m11 = m[1][1], m12 = m[1][2];
    const m20 = m[2][0], m21 = m[2][1], m22 = m[2][2];
    const tr = m00 + m11 + m22;

    let x, y, z, w;
    if (tr > 0) {
      const S = Math.sqrt(tr + 1.0) * 2;
      w = 0.25 * S;
      x = (m21 - m12) / S;
      y = (m02 - m20) / S;
      z = (m10 - m01) / S;
    } else if ((m00 > m11) && (m00 > m22)) {
      const S = Math.sqrt(1.0 + m00 - m11 - m22) * 2;
      w = (m21 - m12) / S;
      x = 0.25 * S;
      y = (m01 + m10) / S;
      z = (m02 + m20) / S;
    } else if (m11 > m22) {
      const S = Math.sqrt(1.0 + m11 - m00 - m22) * 2;
      w = (m02 - m20) / S;
      x = (m01 + m10) / S;
      y = 0.25 * S;
      z = (m12 + m21) / S;
    } else {
      const S = Math.sqrt(1.0 + m22 - m00 - m11) * 2;
      w = (m10 - m01) / S;
      x = (m02 + m20) / S;
      y = (m12 + m21) / S;
      z = 0.25 * S;
    }

    const len = Math.sqrt(x * x + y * y + z * z + w * w);
    return { x: x / len, y: y / len, z: z / len, w: w / len };
  }

  // --- TEMPORAL SMOOTHING (EMA & QUATERNION SLERP) ---
  _smoothPose(newPose, prevPose, alpha) {
    if (!prevPose) return newPose;

    // Linear interpolation for translation
    const pos = {
      x: prevPose.position.x * (1 - alpha) + newPose.position.x * alpha,
      y: prevPose.position.y * (1 - alpha) + newPose.position.y * alpha,
      z: prevPose.position.z * (1 - alpha) + newPose.position.z * alpha
    };

    // Spherical Linear Interpolation (SLERP) for rotation
    const rot = this._quaternionSlerp(prevPose.rotationQuaternion, newPose.rotationQuaternion, alpha);

    return {
      position: pos,
      rotationQuaternion: rot,
      timestamp: Date.now()
    };
  }

  _quaternionSlerp(qa, qb, t) {
    let cosHalfTheta = qa.w * qb.w + qa.x * qb.x + qa.y * qb.y + qa.z * qb.z;

    let bx = qb.x, by = qb.y, bz = qb.z, bw = qb.w;
    if (cosHalfTheta < 0) {
      bw = -bw; bx = -bx; by = -by; bz = -bz;
      cosHalfTheta = -cosHalfTheta;
    }

    if (Math.abs(cosHalfTheta) >= 1.0) {
      return { x: qa.x, y: qa.y, z: qa.z, w: qa.w };
    }

    const halfTheta = Math.acos(cosHalfTheta);
    const sinHalfTheta = Math.sqrt(1.0 - cosHalfTheta * cosHalfTheta);

    if (Math.abs(sinHalfTheta) < 0.001) {
      return {
        x: qa.x * (1 - t) + bx * t,
        y: qa.y * (1 - t) + by * t,
        z: qa.z * (1 - t) + bz * t,
        w: qa.w * (1 - t) + bw * t
      };
    }

    const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
    const ratioB = Math.sin(t * halfTheta) / sinHalfTheta;

    return {
      x: qa.x * ratioA + bx * ratioB,
      y: qa.y * ratioA + by * ratioB,
      z: qa.z * ratioA + bz * ratioB,
      w: qa.w * ratioA + bw * ratioB
    };
  }

  // --- GAUSSIAN ELIMINATION LINEAR EQUATION SOLVER ---
  _solveLinearSystem(A, B) {
    const n = B.length;
    const M = A.map((row, i) => [...row, B[i]]);

    for (let i = 0; i < n; i++) {
      // Partial pivoting
      let maxRow = i;
      let maxVal = Math.abs(M[i][i]);
      for (let r = i + 1; r < n; r++) {
        if (Math.abs(M[r][i]) > maxVal) {
          maxVal = Math.abs(M[r][i]);
          maxRow = r;
        }
      }

      if (maxVal < 1e-12) return null; // Singular matrix

      if (maxRow !== i) {
        const tmp = M[i];
        M[i] = M[maxRow];
        M[maxRow] = tmp;
      }

      const pivot = M[i][i];
      for (let c = i; c <= n; c++) {
        M[i][c] /= pivot;
      }

      for (let r = 0; r < n; r++) {
        if (r !== i) {
          const factor = M[r][i];
          if (Math.abs(factor) > 1e-12) {
            for (let c = i; c <= n; c++) {
              M[r][c] -= factor * M[i][c];
            }
          }
        }
      }
    }

    return M.map(row => row[n]);
  }
}

// Global instantiation and export
if (typeof window !== 'undefined') {
  window.ArUcoPoseEstimator = ArUcoPoseEstimator;
  window.arucoPoseEstimator = new ArUcoPoseEstimator();
}
