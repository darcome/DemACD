/**
 * Agility Course Designer - ArUco 3D Pose Estimator
 * Real-time 6-DoF camera/field pose estimation using OpenCV PnP (SOLVEPNP_IPPE_SQUARE / SQPNP / ITERATIVE)
 * with Hartley-Normalized DLT + Polar Rotation Orthonormalization fallback and 1-Euro adaptive jitter filter.
 * Supports single-marker placement, multi-marker refinement, Lock Anchor, and device gyroscope fusion.
 */

class OneEuroScalarFilter {
  constructor(minCutoff = 1.0, beta = 0.05, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }

  reset() {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }

  _alpha(cutoff, dt) {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  filter(x, tMs) {
    if (this.tPrev === null || this.xPrev === null) {
      this.xPrev = x;
      this.dxPrev = 0;
      this.tPrev = tMs;
      return x;
    }

    const dt = Math.max(0.001, Math.min(0.5, (tMs - this.tPrev) / 1000.0));
    this.tPrev = tMs;

    const dx = (x - this.xPrev) / dt;
    const edx = this.dxPrev + this._alpha(this.dCutoff, dt) * (dx - this.dxPrev);
    this.dxPrev = edx;

    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    const a = this._alpha(cutoff, dt);
    const xHat = this.xPrev + a * (x - this.xPrev);
    this.xPrev = xHat;
    return xHat;
  }
}

class ArUcoPoseEstimator {
  constructor(options = {}) {
    this.markerSizeMeters = options.markerSizeMeters || 0.25; // Default 25cm
    this.fovDegrees = options.fovDegrees || 60.0;             // Standard webcam horizontal FOV
    this.gracePeriodMs = options.gracePeriodMs || 1500;       // Hold pose for 1.5s on occlusion
    this.smoothAlpha = options.smoothAlpha || 0.35;           // Base smoothing factor

    // 1-Euro Filters for 3D position (eliminates static jitter while keeping fast camera pans responsive)
    this.posFilters = {
      x: new OneEuroScalarFilter(0.8, 0.04, 1.0),
      y: new OneEuroScalarFilter(0.8, 0.04, 1.0),
      z: new OneEuroScalarFilter(0.8, 0.04, 1.0)
    };

    // Current tracking state
    this.currentPose = null;       // { position: {x,y,z}, rotationQuaternion: {x,y,z,w}, rawMatrix, timestamp }
    this.smoothedPose = null;      // Smoothed version of currentPose
    this.lastSeenTime = 0;
    this.activeMarkerCount = 0;
    this.primaryMarkerKey = null;
    this.outlierCount = 0;

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
    this.outlierCount = 0;
    this.isAnchorLocked = false;
    this.lockedPose = null;
    this.posFilters.x.reset();
    this.posFilters.y.reset();
    this.posFilters.z.reset();
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
          // Calculate apparent pixel perimeter to weight larger/closer markers higher
          let perimeter = 0;
          for (let i = 0; i < 4; i++) {
            const p1 = m.corners[i];
            const p2 = m.corners[(i + 1) % 4];
            perimeter += Math.hypot(p2.x - p1.x, p2.y - p1.y);
          }
          // Reject degenerate/tiny false detections (< 24px total perimeter)
          if (perimeter >= 24) {
            validMarkers.push({
              id: m.id,
              key: key,
              fieldPos: fieldCoords[key],
              corners: m.corners,
              center: m.center,
              perimeter: perimeter
            });
          }
        }
      }
    }

    // Sort by apparent size descending so closest/clearest marker is primary
    validMarkers.sort((a, b) => b.perimeter - a.perimeter);
    this.activeMarkerCount = validMarkers.length;

    // --- CASE 1: AT LEAST ONE MARKER DETECTED ---
    if (validMarkers.length > 0) {
      let rawPose = null;

      if (validMarkers.length === 1) {
        this.primaryMarkerKey = validMarkers[0].key;
        rawPose = this._estimateFromSingleMarker(validMarkers[0], K);
      } else {
        this.primaryMarkerKey = validMarkers.map(m => m.key).join('+');
        rawPose = this._estimateFromMultipleMarkers(validMarkers, K);
      }

      if (rawPose && this._isValidPose(rawPose)) {
        // Outlier rejection: prevent single-frame PnP/homography flips from snapping the 3D scene
        if (this.smoothedPose && (now - this.lastSeenTime < 500)) {
          const posJump = Math.hypot(
            rawPose.position.x - this.smoothedPose.position.x,
            rawPose.position.y - this.smoothedPose.position.y,
            rawPose.position.z - this.smoothedPose.position.z
          );
          const rotDot = Math.abs(
            rawPose.rotationQuaternion.x * this.smoothedPose.rotationQuaternion.x +
            rawPose.rotationQuaternion.y * this.smoothedPose.rotationQuaternion.y +
            rawPose.rotationQuaternion.z * this.smoothedPose.rotationQuaternion.z +
            rawPose.rotationQuaternion.w * this.smoothedPose.rotationQuaternion.w
          );
          const angleJumpDeg = 2 * Math.acos(Math.min(1.0, rotDot)) * (180 / Math.PI);

          // If sudden jump > 12m or > 65 deg in a single frame, require 4 consecutive frames to accept
          if ((posJump > 12.0 || angleJumpDeg > 65.0) && this.outlierCount < 4) {
            this.outlierCount++;
            return {
              pose: this.smoothedPose,
              status: 'holding',
              markerCount: validMarkers.length,
              primaryKey: this.primaryMarkerKey,
              isLocked: false
            };
          }
        }

        this.outlierCount = 0;
        this.lastSeenTime = now;

        // Smooth pose with adaptive 1-Euro filter + dynamic quaternion SLERP
        this.smoothedPose = this._smoothPose(rawPose, this.smoothedPose, now);
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

    // Tracking lost: reset filters so next acquisition snaps cleanly
    this.posFilters.x.reset();
    this.posFilters.y.reset();
    this.posFilters.z.reset();
    this.smoothedPose = null;

    return {
      pose: null,
      status: 'lost',
      markerCount: 0,
      isLocked: false
    };
  }

  _isValidPose(pose) {
    if (!pose || !pose.position || !pose.rotationQuaternion) return false;
    const p = pose.position;
    const q = pose.rotationQuaternion;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return false;
    if (!Number.isFinite(q.x) || !Number.isFinite(q.y) || !Number.isFinite(q.z) || !Number.isFinite(q.w)) return false;
    const dist = Math.hypot(p.x, p.y, p.z);
    return dist > 0.05 && dist < 250.0;
  }

  // --- SINGLE-MARKER POSE CALCULATION ---
  _estimateFromSingleMarker(marker, K) {
    const s = this.markerSizeMeters;
    const s2 = s / 2;

    // 1. Primary Method: OpenCV solvePnP with IPPE_SQUARE (designed specifically for planar squares)
    const cvDecomp = this._solvePnPOpenCV(
      [
        { x: -s2, y: 0, z:  s2 }, // c0: top-left
        { x:  s2, y: 0, z:  s2 }, // c1: top-right
        { x:  s2, y: 0, z: -s2 }, // c2: bottom-right
        { x: -s2, y: 0, z: -s2 }  // c3: bottom-left
      ],
      marker.corners,
      K,
      true
    );

    let R, T;
    if (cvDecomp) {
      R = cvDecomp.R;
      T = cvDecomp.T;
    } else {
      // 2. Fallback: Hartley-Normalized Homography + Polar SVD Orthonormalization
      const localCorners = [
        { x: -s2, z:  s2 },
        { x:  s2, z:  s2 },
        { x:  s2, z: -s2 },
        { x: -s2, z: -s2 }
      ];
      const H = this._computeNormalizedHomography(localCorners, marker.corners);
      if (!H) return null;

      const decomp = this._decomposeHomography(H, K, localCorners, marker.corners);
      if (!decomp) return null;
      R = decomp.R;
      T = decomp.T;
    }

    // Offset from marker position to full field origin (0,0,0):
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

    return this._convertCvToBabylon(R, T_field_cv);
  }

  // --- MULTI-MARKER POSE CALCULATION ---
  _estimateFromMultipleMarkers(markers, K) {
    const s = this.markerSizeMeters;
    const s2 = s / 2;

    const objPts3D = [];
    const groundPoints = [];
    const imagePoints = [];

    for (const m of markers) {
      const F = m.fieldPos;
      const cornerFieldPositions = [
        { x: F.x - s2, y: 0, z: F.z + s2 }, // c0
        { x: F.x + s2, y: 0, z: F.z + s2 }, // c1
        { x: F.x + s2, y: 0, z: F.z - s2 }, // c2
        { x: F.x - s2, y: 0, z: F.z - s2 }  // c3
      ];

      for (let i = 0; i < 4; i++) {
        objPts3D.push(cornerFieldPositions[i]);
        groundPoints.push({ x: cornerFieldPositions[i].x, z: cornerFieldPositions[i].z });
        imagePoints.push(m.corners[i]);
      }
    }

    // 1. Primary Method: OpenCV Multi-Point PnP (SQPNP / ITERATIVE)
    const cvDecomp = this._solvePnPOpenCV(objPts3D, imagePoints, K, false);
    if (cvDecomp) {
      return this._convertCvToBabylon(cvDecomp.R, cvDecomp.T);
    }

    // 2. Fallback: Hartley-Normalized Multi-Point Homography + Polar Orthonormalization
    const H = this._computeNormalizedHomography(groundPoints, imagePoints);
    if (!H) {
      return this._estimateFromSingleMarker(markers[0], K);
    }

    const decomp = this._decomposeHomography(H, K, groundPoints, imagePoints);
    if (!decomp) {
      return this._estimateFromSingleMarker(markers[0], K);
    }

    return this._convertCvToBabylon(decomp.R, decomp.T);
  }

  // --- OPENCV.JS SOLVEPNP + RODRIGUES (WITH NORMAL ORIENTATION ENFORCEMENT) ---
  _solvePnPOpenCV(objPts3D, imgPts2D, K, isSingleSquare) {
    if (typeof cv === 'undefined' || typeof cv.solvePnP !== 'function' || typeof cv.Rodrigues !== 'function') {
      return null;
    }

    let objMat = null, imgMat = null, camMat = null, distCoeffs = null, rvec = null, tvec = null, RMat = null;
    try {
      const N = objPts3D.length;

      if (isSingleSquare && N === 4 && typeof cv.SOLVEPNP_IPPE_SQUARE !== 'undefined') {
        // IPPE_SQUARE expects 4 corners in marker plane: [-s/2, s/2, 0], [s/2, s/2, 0], [s/2, -s/2, 0], [-s/2, -s/2, 0]
        const s2 = this.markerSizeMeters / 2;
        objMat = cv.matFromArray(4, 1, cv.CV_32FC3, [
          -s2,  s2, 0,
           s2,  s2, 0,
           s2, -s2, 0,
          -s2, -s2, 0
        ]);
      } else {
        const flatObj = [];
        for (let i = 0; i < N; i++) {
          flatObj.push(objPts3D[i].x, objPts3D[i].y || 0, objPts3D[i].z);
        }
        objMat = cv.matFromArray(N, 1, cv.CV_32FC3, flatObj);
      }

      const flatImg = [];
      for (let i = 0; i < N; i++) {
        flatImg.push(imgPts2D[i].x, imgPts2D[i].y);
      }
      imgMat = cv.matFromArray(N, 1, cv.CV_32FC2, flatImg);

      camMat = cv.matFromArray(3, 3, cv.CV_64F, [
        K.fx, 0,    K.cx,
        0,    K.fy, K.cy,
        0,    0,    1
      ]);
      distCoeffs = cv.Mat.zeros(4, 1, cv.CV_64F);
      rvec = new cv.Mat();
      tvec = new cv.Mat();
      RMat = new cv.Mat();

      let flag = cv.SOLVEPNP_ITERATIVE || 0;
      if (isSingleSquare && N === 4 && typeof cv.SOLVEPNP_IPPE_SQUARE !== 'undefined') {
        flag = cv.SOLVEPNP_IPPE_SQUARE;
      } else if (!isSingleSquare && typeof cv.SOLVEPNP_SQPNP !== 'undefined') {
        flag = cv.SOLVEPNP_SQPNP;
      }

      const ok = cv.solvePnP(objMat, imgMat, camMat, distCoeffs, rvec, tvec, false, flag);
      if (!ok) return null;

      cv.Rodrigues(rvec, RMat);
      const rData = RMat.data64F || RMat.data32F;
      const tData = tvec.data64F || tvec.data32F;
      if (!rData || !tData) return null;

      let R;
      if (isSingleSquare && N === 4 && flag === cv.SOLVEPNP_IPPE_SQUARE) {
        // Map IPPE_SQUARE plane (X_ippe = X_field, Y_ippe = Z_field, Z_ippe = -Y_field) to Field (X, Y_up, Z_north):
        // Column 0 (X_field) = col 0 of R_ippe
        // Column 1 (Y_field) = -col 2 of R_ippe
        // Column 2 (Z_field) = col 1 of R_ippe
        R = [
          [rData[0], -rData[2], rData[1]],
          [rData[3], -rData[5], rData[4]],
          [rData[6], -rData[8], rData[7]]
        ];
      } else {
        R = [
          [rData[0], rData[1], rData[2]],
          [rData[3], rData[4], rData[5]],
          [rData[6], rData[7], rData[8]]
        ];
      }

      const T = {
        x: tData[0],
        y: tData[1],
        z: tData[2]
      };

      // Verify marker is in front of camera
      if (T.z <= 0.05) return null;

      // Verify camera is above the agility ground plane (prevents planar tilt ambiguity flip)
      // Camera position in field frame: C_field = -R^T * T. Its Y coordinate is -(R[0][1]*T.x + R[1][1]*T.y + R[2][1]*T.z)
      const camFieldY = -(R[0][1] * T.x + R[1][1] * T.y + R[2][1] * T.z);
      if (camFieldY < -0.1) {
        return null; // Reject flipped underground solution so normalized homography with normal check handles it
      }

      return { R, T };
    } catch (e) {
      return null;
    } finally {
      if (objMat) objMat.delete();
      if (imgMat) imgMat.delete();
      if (camMat) camMat.delete();
      if (distCoeffs) distCoeffs.delete();
      if (rvec) rvec.delete();
      if (tvec) tvec.delete();
      if (RMat) RMat.delete();
    }
  }

  // --- HARTLEY-NORMALIZED HOMOGRAPHY SOLVER (4 OR MORE POINTS) ---
  /**
   * Normalizes both 2D ground coordinates and 2D image pixel coordinates (centroid at origin, mean distance = sqrt(2))
   * before solving DLT normal equations, eliminating floating-point ill-conditioning across large fields.
   */
  _computeNormalizedHomography(srcPts, dstPts) {
    const N = srcPts.length;
    if (N < 4) return null;

    // 1. Compute centroids
    let srcCx = 0, srcCz = 0, dstCx = 0, dstCy = 0;
    for (let i = 0; i < N; i++) {
      srcCx += srcPts[i].x;
      srcCz += srcPts[i].z;
      dstCx += dstPts[i].x;
      dstCy += dstPts[i].y;
    }
    srcCx /= N; srcCz /= N;
    dstCx /= N; dstCy /= N;

    // 2. Compute mean distances from centroid
    let srcMeanDist = 0, dstMeanDist = 0;
    for (let i = 0; i < N; i++) {
      srcMeanDist += Math.hypot(srcPts[i].x - srcCx, srcPts[i].z - srcCz);
      dstMeanDist += Math.hypot(dstPts[i].x - dstCx, dstPts[i].y - dstCy);
    }
    srcMeanDist /= N;
    dstMeanDist /= N;
    if (srcMeanDist < 1e-8 || dstMeanDist < 1e-8) return null;

    const srcScale = Math.SQRT2 / srcMeanDist;
    const dstScale = Math.SQRT2 / dstMeanDist;

    // 3. Build normalized system (AtA * h = AtB)
    const AtA = Array.from({ length: 8 }, () => new Float64Array(8));
    const AtB = new Float64Array(8);

    for (let i = 0; i < N; i++) {
      const X = (srcPts[i].x - srcCx) * srcScale;
      const Z = (srcPts[i].z - srcCz) * srcScale;
      const u = (dstPts[i].x - dstCx) * dstScale;
      const v = (dstPts[i].y - dstCy) * dstScale;

      const r1 = [X, Z, 1, 0, 0, 0, -u * X, -u * Z];
      for (let j = 0; j < 8; j++) {
        AtB[j] += r1[j] * u;
        for (let k = 0; k < 8; k++) {
          AtA[j][k] += r1[j] * r1[k];
        }
      }

      const r2 = [0, 0, 0, X, Z, 1, -v * X, -v * Z];
      for (let j = 0; j < 8; j++) {
        AtB[j] += r2[j] * v;
        for (let k = 0; k < 8; k++) {
          AtA[j][k] += r2[j] * r2[k];
        }
      }
    }

    const AtA_mat = Array.from({ length: 8 }, (_, r) => Array.from(AtA[r]));
    const AtB_arr = Array.from(AtB);

    const h = this._solveLinearSystem(AtA_mat, AtB_arr);
    if (!h) return null;

    const H_norm = [
      [h[0], h[1], h[2]],
      [h[3], h[4], h[5]],
      [h[6], h[7], 1.0]
    ];

    // 4. Denormalize: H = T_dst^-1 * H_norm * T_src
    // T_src = [ [srcScale, 0, -srcScale*srcCx], [0, srcScale, -srcScale*srcCz], [0, 0, 1] ]
    // T_dst^-1 = [ [1/dstScale, 0, dstCx], [0, 1/dstScale, dstCy], [0, 0, 1] ]
    const T_src = [
      [srcScale, 0, -srcScale * srcCx],
      [0, srcScale, -srcScale * srcCz],
      [0, 0, 1]
    ];
    const T_dst_inv = [
      [1 / dstScale, 0, dstCx],
      [0, 1 / dstScale, dstCy],
      [0, 0, 1]
    ];

    const H_temp = this._matMul3x3(H_norm, T_src);
    return this._matMul3x3(T_dst_inv, H_temp);
  }

  _matMul3x3(A, B) {
    const C = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0]
    ];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        C[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
      }
    }
    return C;
  }

  // --- HOMOGRAPHY DECOMPOSITION WITH POLAR SVD ORTHONORMALIZATION ---
  _decomposeHomography(H, K, srcPts, dstPts) {
    const fx = K.fx;
    const fy = K.fy;
    const cx = K.cx;
    const cy = K.cy;

    // Normalized homography: H_tilde = K^-1 * H
    const H_tilde = [
      [(H[0][0] - cx * H[2][0]) / fx, (H[0][1] - cx * H[2][1]) / fx, (H[0][2] - cx * H[2][2]) / fx],
      [(H[1][0] - cy * H[2][0]) / fy, (H[1][1] - cy * H[2][1]) / fy, (H[1][2] - cy * H[2][2]) / fy],
      [H[2][0],                       H[2][1],                       H[2][2]]
    ];

    const h1 = [H_tilde[0][0], H_tilde[1][0], H_tilde[2][0]];
    const h2 = [H_tilde[0][1], H_tilde[1][1], H_tilde[2][1]];
    const h3 = [H_tilde[0][2], H_tilde[1][2], H_tilde[2][2]];

    const norm1 = Math.hypot(h1[0], h1[1], h1[2]);
    const norm2 = Math.hypot(h2[0], h2[1], h2[2]);
    if (norm1 < 1e-7 || norm2 < 1e-7) return null;

    // Geometric mean scale factor
    let lambda = 1.0 / Math.sqrt(norm1 * norm2);

    // Determine sign of lambda using actual visible marker centroid (not origin, which may be behind camera!)
    if (srcPts && srcPts.length > 0) {
      let cxSrc = 0, czSrc = 0;
      for (let i = 0; i < srcPts.length; i++) {
        cxSrc += srcPts[i].x;
        czSrc += srcPts[i].z;
      }
      cxSrc /= srcPts.length;
      czSrc /= srcPts.length;
      const zCam = h1[2] * cxSrc + h2[2] * czSrc + h3[2];
      if (zCam * lambda < 0) {
        lambda = -lambda;
      }
    } else if (h3[2] < 0) {
      lambda = -lambda;
    }

    // Symmetric polar orthonormalization of [r1, r3] (treats X and Z axes equally instead of biasing X via Gram-Schmidt)
    const u1 = [h1[0] / norm1 * Math.sign(lambda), h1[1] / norm1 * Math.sign(lambda), h1[2] / norm1 * Math.sign(lambda)];
    const u3 = [h2[0] / norm2 * Math.sign(lambda), h2[1] / norm2 * Math.sign(lambda), h2[2] / norm2 * Math.sign(lambda)];

    // Sum and difference bisectors of u1 and u3
    const sPlus = [u1[0] + u3[0], u1[1] + u3[1], u1[2] + u3[2]];
    const sMinus = [u1[0] - u3[0], u1[1] - u3[1], u1[2] - u3[2]];
    const lenPlus = Math.hypot(sPlus[0], sPlus[1], sPlus[2]);
    const lenMinus = Math.hypot(sMinus[0], sMinus[1], sMinus[2]);
    if (lenPlus < 1e-7 || lenMinus < 1e-7) return null;

    const ePlus = [sPlus[0] / lenPlus, sPlus[1] / lenPlus, sPlus[2] / lenPlus];
    const eMinus = [sMinus[0] / lenMinus, sMinus[1] / lenMinus, sMinus[2] / lenMinus];

    const invSqrt2 = Math.SQRT1_2;
    const r1 = [
      (ePlus[0] + eMinus[0]) * invSqrt2,
      (ePlus[1] + eMinus[1]) * invSqrt2,
      (ePlus[2] + eMinus[2]) * invSqrt2
    ];
    const r3 = [
      (ePlus[0] - eMinus[0]) * invSqrt2,
      (ePlus[1] - eMinus[1]) * invSqrt2,
      (ePlus[2] - eMinus[2]) * invSqrt2
    ];

    // r2 = r3 x r1 (Up axis +Y of field in OpenCV camera space)
    const r2 = [
      r3[1] * r1[2] - r3[2] * r1[1],
      r3[2] * r1[0] - r3[0] * r1[2],
      r3[0] * r1[1] - r3[1] * r1[0]
    ];

    const T = {
      x: lambda * h3[0],
      y: lambda * h3[1],
      z: lambda * h3[2]
    };

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
    const posBabylon = {
      x: T_cv.x,
      y: -T_cv.y,
      z: T_cv.z
    };

    // Invert Y row and Y column: R_bab = S * R_cv * S with S = diag(1, -1, 1)
    const R_bab = [
      [ R_cv[0][0], -R_cv[0][1],  R_cv[0][2]],
      [-R_cv[1][0],  R_cv[1][1], -R_cv[1][2]],
      [ R_cv[2][0], -R_cv[2][1],  R_cv[2][2]]
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
  /**
   * Converts a 3x3 column-vector rotation matrix into a Babylon.js Quaternion.
   * Note: Babylon.js uses row-major vector multiplication (v' = v * M) where M = R^T,
   * so we negate the vector part (x, y, z) of the column-major quaternion formula so that
   * transformNode.rotationQuaternion produces the exact column-vector rotation R_bab * P!
   */
  _quaternionFromMatrix(m) {
    const m00 = m[0][0], m01 = m[0][1], m02 = m[0][2];
    const m10 = m[1][0], m11 = m[1][1], m12 = m[1][2];
    const m20 = m[2][0], m21 = m[2][1], m22 = m[2][2];
    const tr = m00 + m11 + m22;

    let x, y, z, w;
    if (tr > 0) {
      const S = Math.sqrt(tr + 1.0) * 2;
      w = 0.25 * S;
      x = (m12 - m21) / S;
      y = (m20 - m02) / S;
      z = (m01 - m10) / S;
    } else if ((m00 > m11) && (m00 > m22)) {
      const S = Math.sqrt(1.0 + m00 - m11 - m22) * 2;
      w = (m12 - m21) / S;
      x = -0.25 * S;
      y = -(m01 + m10) / S;
      z = -(m02 + m20) / S;
    } else if (m11 > m22) {
      const S = Math.sqrt(1.0 + m11 - m00 - m22) * 2;
      w = (m20 - m02) / S;
      x = -(m01 + m10) / S;
      y = -0.25 * S;
      z = -(m12 + m21) / S;
    } else {
      const S = Math.sqrt(1.0 + m22 - m00 - m11) * 2;
      w = (m01 - m10) / S;
      x = -(m02 + m20) / S;
      y = -(m12 + m21) / S;
      z = -0.25 * S;
    }

    const len = Math.hypot(x, y, z, w) || 1.0;
    return { x: x / len, y: y / len, z: z / len, w: w / len };
  }

  // --- TEMPORAL SMOOTHING (1-EURO POSITION FILTER & ADAPTIVE QUATERNION SLERP) ---
  _smoothPose(newPose, prevPose, nowMs) {
    const t = nowMs || Date.now();
    const pos = {
      x: this.posFilters.x.filter(newPose.position.x, t),
      y: this.posFilters.y.filter(newPose.position.y, t),
      z: this.posFilters.z.filter(newPose.position.z, t)
    };

    if (!prevPose) {
      return {
        position: pos,
        rotationQuaternion: { ...newPose.rotationQuaternion },
        timestamp: t
      };
    }

    // Adaptive SLERP factor based on angular velocity (eliminates micro-jitter at rest, tracks fast turns)
    const qa = prevPose.rotationQuaternion;
    const qb = newPose.rotationQuaternion;
    const dot = Math.abs(qa.w * qb.w + qa.x * qb.x + qa.y * qb.y + qa.z * qb.z);
    const angleRad = 2 * Math.acos(Math.min(1.0, dot));
    const adaptiveAlpha = Math.min(0.75, Math.max(0.12, this.smoothAlpha * (0.4 + angleRad * 3.5)));

    const rot = this._quaternionSlerp(qa, qb, adaptiveAlpha);

    return {
      position: pos,
      rotationQuaternion: rot,
      timestamp: t
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
      const rx = qa.x * (1 - t) + bx * t;
      const ry = qa.y * (1 - t) + by * t;
      const rz = qa.z * (1 - t) + bz * t;
      const rw = qa.w * (1 - t) + bw * t;
      const len = Math.hypot(rx, ry, rz, rw) || 1.0;
      return { x: rx / len, y: ry / len, z: rz / len, w: rw / len };
    }

    const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
    const ratioB = Math.sin(t * halfTheta) / sinHalfTheta;

    const rx = qa.x * ratioA + bx * ratioB;
    const ry = qa.y * ratioA + by * ratioB;
    const rz = qa.z * ratioA + bz * ratioB;
    const rw = qa.w * ratioA + bw * ratioB;
    const len = Math.hypot(rx, ry, rz, rw) || 1.0;

    return {
      x: rx / len,
      y: ry / len,
      z: rz / len,
      w: rw / len
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
