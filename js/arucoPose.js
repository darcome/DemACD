/**
 * Agility Course Designer - ArUco 3D Pose Estimator
 * Real-time 6-DoF field pose estimation from ArUco ground markers.
 *
 * Pipeline per frame:
 *  1. IPPE (Infinitesimal Plane-based Pose Estimation) on the largest visible markers. A single planar
 *     square always has TWO plausible poses (the classic "tilt flip"), so both are kept as candidates.
 *  2. Every candidate (plus the previous frame's pose) is refined with Levenberg-Marquardt over ALL visible
 *     marker corners.
 *  3. The candidate is chosen by reprojection error, then by temporal continuity / plausibility when the
 *     error alone is ambiguous (typical for a single small marker).
 *  4. Adaptive 1-Euro style smoothing anchored on the visible markers, so the course stays glued to the
 *     markers on screen while rotation noise is damped.
 *
 * Coordinate conventions:
 *  - Field (Babylon) frame: X east, Y up, Z north, origin at field center. This frame is LEFT-handed.
 *  - Model frame used by the solver: M = (x, -y, z). Flipping Y makes it right-handed, so the solver
 *    works with proper rotations R (det = +1) mapping model -> OpenCV camera (X right, Y down, Z forward).
 *  - Output pose for Babylon: P_babylonCam = R_bab * P_field + T_bab, with R_bab = S R S, T_bab = S T,
 *    S = diag(1, -1, 1).
 */

// --- SMALL 3x3 / VECTOR HELPERS (row-major flat arrays of length 9) ---
function _m3MulVec(R, v) {
  return [
    R[0] * v[0] + R[1] * v[1] + R[2] * v[2],
    R[3] * v[0] + R[4] * v[1] + R[5] * v[2],
    R[6] * v[0] + R[7] * v[1] + R[8] * v[2]
  ];
}

function _m3Mul(A, B) {
  const C = new Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
    }
  }
  return C;
}

function _m3TMulVec(R, v) {
  return [
    R[0] * v[0] + R[3] * v[1] + R[6] * v[2],
    R[1] * v[0] + R[4] * v[1] + R[7] * v[2],
    R[2] * v[0] + R[5] * v[1] + R[8] * v[2]
  ];
}

function _cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function _dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

// Rodrigues: rotation matrix for rotation vector w
function _expSO3(w) {
  const th = Math.hypot(w[0], w[1], w[2]);
  if (th < 1e-12) return [1, -w[2], w[1], w[2], 1, -w[0], -w[1], w[0], 1];
  const k = [w[0] / th, w[1] / th, w[2] / th];
  const c = Math.cos(th), s = Math.sin(th), v = 1 - c;
  return [
    c + k[0] * k[0] * v,        k[0] * k[1] * v - k[2] * s, k[0] * k[2] * v + k[1] * s,
    k[1] * k[0] * v + k[2] * s, c + k[1] * k[1] * v,        k[1] * k[2] * v - k[0] * s,
    k[2] * k[0] * v - k[1] * s, k[2] * k[1] * v + k[0] * s, c + k[2] * k[2] * v
  ];
}

// Angle (radians) between two rotation matrices
function _rotAngle(A, B) {
  // trace(A^T B)
  let tr = 0;
  for (let i = 0; i < 9; i++) tr += A[i] * B[i];
  return Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2)));
}

// Re-orthonormalize a near-rotation matrix (Gram-Schmidt on rows, keeps it a proper rotation)
function _orthonormalize(R) {
  const r0 = [R[0], R[1], R[2]];
  let n = Math.hypot(r0[0], r0[1], r0[2]);
  r0[0] /= n; r0[1] /= n; r0[2] /= n;
  const r1 = [R[3], R[4], R[5]];
  const d = _dot(r0, r1);
  r1[0] -= d * r0[0]; r1[1] -= d * r0[1]; r1[2] -= d * r0[2];
  n = Math.hypot(r1[0], r1[1], r1[2]);
  r1[0] /= n; r1[1] /= n; r1[2] /= n;
  const r2 = _cross(r0, r1);
  return [r0[0], r0[1], r0[2], r1[0], r1[1], r1[2], r2[0], r2[1], r2[2]];
}

class ArUcoPoseEstimator {
  constructor(options = {}) {
    this.markerSizeMeters = options.markerSizeMeters || 0.25; // Default 25cm
    this.fovDegrees = options.fovDegrees || 65.0;             // FOV across the LONGER image side (typical phone/webcam)
    this.gracePeriodMs = options.gracePeriodMs || 1500;       // Hold pose for 1.5s on occlusion
    this.maxReprojErrorPx = options.maxReprojErrorPx || 6.0;  // Reject solutions that don't fit the corners

    // Smoothing (1-Euro style: cutoff frequency grows with motion speed)
    this.posMinCutoff = 1.5;  // Hz at rest
    this.posBeta = 0.02;      // extra Hz per px/s of on-screen anchor motion
    this.rotMinCutoff = 1.0;  // Hz at rest
    this.rotBeta = 0.05;      // extra Hz per deg/s of rotation

    // Current tracking state
    this._state = null;            // Smoothed solver pose { R, t } (model -> OpenCV camera)
    this._rawState = null;         // Last unsmoothed accepted pose { R, t }
    this._lastFrameTime = 0;
    this.smoothedPose = null;      // Babylon pose { position, rotationQuaternion }
    this.lastSeenTime = 0;
    this.activeMarkerCount = 0;
    this.primaryMarkerKey = null;
    this.outlierCount = 0;
    this.trackedFrames = 0;

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

  setFov(degrees) {
    const v = parseFloat(degrees);
    if (v >= 20 && v <= 150) {
      this.fovDegrees = v;
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
    this._state = null;
    this._rawState = null;
    this.smoothedPose = null;
    this.lastSeenTime = 0;
    this.activeMarkerCount = 0;
    this.primaryMarkerKey = null;
    this.outlierCount = 0;
    this.trackedFrames = 0;
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
    // FOV refers to the longer side so the same value works in portrait and landscape
    const fovRad = (this.fovDegrees * Math.PI) / 180;
    const fx = (Math.max(width, height) / 2) / Math.tan(fovRad / 2);
    const fy = fx; // Square pixels
    const cx = width / 2;
    const cy = height / 2;
    return { fx, fy, cx, cy };
  }

  /** Vertical FOV (radians) matching getCameraIntrinsics, for the Babylon camera. */
  getVerticalFov(width, height) {
    const K = this.getCameraIntrinsics(width, height);
    return 2 * Math.atan((height / 2) / K.fy);
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
    const seenIds = new Set();
    if (detectedMarkers && detectedMarkers.length > 0) {
      for (const m of detectedMarkers) {
        const key = idToKeyMap[m.id];
        // Ignore duplicates of the same ID (a false detection would corrupt the solve)
        if (!key || !fieldCoords[key] || !m.corners || m.corners.length !== 4 || seenIds.has(m.id)) continue;
        // Calculate apparent pixel perimeter to weight larger/closer markers higher
        let perimeter = 0;
        for (let i = 0; i < 4; i++) {
          const p1 = m.corners[i];
          const p2 = m.corners[(i + 1) % 4];
          perimeter += Math.hypot(p2.x - p1.x, p2.y - p1.y);
        }
        // Reject degenerate/tiny false detections (< 24px total perimeter)
        if (perimeter >= 24) {
          seenIds.add(m.id);
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

    // Sort by apparent size descending so closest/clearest marker is primary
    validMarkers.sort((a, b) => b.perimeter - a.perimeter);
    this.activeMarkerCount = validMarkers.length;

    // --- CASE 1: AT LEAST ONE MARKER DETECTED ---
    if (validMarkers.length > 0) {
      this.primaryMarkerKey = validMarkers.length === 1
        ? validMarkers[0].key
        : validMarkers.map(m => m.key).join('+');

      const solved = this._solve(validMarkers, K, now);

      if (solved) {
        const prevRecent = this._rawState && (now - this.lastSeenTime < 500);

        // Outlier rejection: a sudden big jump must be confirmed by a few consecutive frames
        if (prevRecent && this._state) {
          const angleJumpDeg = _rotAngle(solved.R, this._state.R) * 180 / Math.PI;
          const anchorPrev = _m3MulVec(this._state.R, solved.anchor);
          const anchorNew = _m3MulVec(solved.R, solved.anchor);
          const posJump = Math.hypot(
            anchorNew[0] + solved.t[0] - anchorPrev[0] - this._state.t[0],
            anchorNew[1] + solved.t[1] - anchorPrev[1] - this._state.t[1],
            anchorNew[2] + solved.t[2] - anchorPrev[2] - this._state.t[2]
          );
          if ((posJump > 3.0 || angleJumpDeg > 25.0) && this.outlierCount < 3) {
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
        this.trackedFrames = prevRecent ? this.trackedFrames + 1 : 1;

        this._rawState = { R: solved.R, t: solved.t };
        this._smoothState(solved, K, now);
        this.lastSeenTime = now;
        this.smoothedPose = this._convertCvToBabylon(this._state.R, this._state.t);

        return {
          pose: this.smoothedPose,
          status: validMarkers.length === 1 ? 'single' : 'multi',
          markerCount: validMarkers.length,
          primaryKey: this.primaryMarkerKey,
          reprojErrorPx: solved.errPx,
          isLocked: false
        };
      }
    }

    // --- CASE 2: NO (USABLE) MARKERS IN CURRENT FRAME ---
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

    // Tracking lost: reset so next acquisition snaps cleanly
    this._state = null;
    this._rawState = null;
    this.smoothedPose = null;
    this.trackedFrames = 0;

    return {
      pose: null,
      status: 'lost',
      markerCount: 0,
      isLocked: false
    };
  }

  // --- POSE SOLVER: CANDIDATES + REFINEMENT + DISAMBIGUATION ---
  _solve(markers, K, now) {
    const s2 = this.markerSizeMeters / 2;
    const f = K.fx;

    // Observations in model coordinates + normalized image coordinates
    const pts = [];
    let ax = 0, az = 0;
    for (const m of markers) {
      const F = m.fieldPos;
      ax += F.x; az += F.z;
      const local = [[-s2, s2], [s2, s2], [s2, -s2], [-s2, -s2]]; // c0 TL, c1 TR, c2 BR, c3 BL (x, z)
      for (let i = 0; i < 4; i++) {
        pts.push({
          M: [F.x + local[i][0], 0, F.z + local[i][1]],
          u: (m.corners[i].x - K.cx) / K.fx,
          v: (m.corners[i].y - K.cy) / K.fy
        });
      }
    }
    // Anchor (model coords) = centroid of the visible markers; used for smoothing and jump checks
    const anchor = [ax / markers.length, 0, az / markers.length];

    // 1. Candidate generation
    const seeds = [];
    for (const m of markers.slice(0, 2)) {
      for (const sol of this._ippeSquare(m, K)) seeds.push({ ...sol, fromMarker: m.key });
    }
    const prevRecent = this._rawState && (now - this.lastSeenTime < 700);
    if (prevRecent) seeds.push({ R: this._rawState.R, t: this._rawState.t, fromPrev: true });
    if (seeds.length === 0) return null;

    // 2. Refinement over all visible corners
    const candidates = [];
    for (const seed of seeds) {
      const ref = this._refinePose(seed.R, seed.t, pts, f);
      if (!ref) continue;
      // Camera must be above the ground plane (field height = -model Y of camera center)
      const C = _m3TMulVec(ref.R, ref.t);
      ref.camHeight = C[1]; // -(-R^T t).y
      if (ref.camHeight < 0.05) continue;
      ref.fromPrev = !!seed.fromPrev;
      candidates.push(ref);
    }
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => a.errPx - b.errPx);
    const best = candidates[0];
    if (best.errPx > this.maxReprojErrorPx) return null;

    // 3. Disambiguation among candidates that fit (almost) as well as the best
    const tol = Math.max(best.errPx * 1.5, best.errPx + 0.75);
    const plausible = candidates.filter(c => c.errPx <= tol);
    let chosen = best;
    if (plausible.length > 1) {
      if (prevRecent) {
        chosen = plausible.reduce((a, b) =>
          (_rotAngle(a.R, this._rawState.R) <= _rotAngle(b.R, this._rawState.R) ? a : b));
      } else {
        // No history: prefer the field's "up" pointing up in the image (up_cv.y = -R[4] < 0)
        // and a hand-held camera height
        const score = c => c.errPx - 2.0 * c.R[4] + 0.5 * Math.abs(c.camHeight - 1.5);
        chosen = plausible.reduce((a, b) => (score(a) <= score(b) ? a : b));
      }
    }

    return { R: chosen.R, t: chosen.t, errPx: chosen.errPx, anchor };
  }

  /**
   * IPPE for one square marker: returns up to two { R, t } candidates in the solver's model frame.
   * Collins & Bartoli, "Infinitesimal Plane-Based Pose Estimation", IJCV 2014.
   */
  _ippeSquare(marker, K) {
    const s2 = this.markerSizeMeters / 2;
    // Plane coordinates centered on the marker: (X, Y) = (field x offset, field z offset)
    const planePts = [{ x: -s2, z: s2 }, { x: s2, z: s2 }, { x: s2, z: -s2 }, { x: -s2, z: -s2 }];
    const imgPts = marker.corners.map(c => ({ x: (c.x - K.cx) / K.fx, y: (c.y - K.cy) / K.fy }));

    const Hm = this._computeNormalizedHomography(planePts, imgPts);
    if (!Hm || Math.abs(Hm[2][2]) < 1e-12) return [];
    const h22 = Hm[2][2];
    const H = Hm.map(row => row.map(v => v / h22));

    const p = H[0][2], q = H[1][2];
    const J00 = H[0][0] - H[2][0] * p, J01 = H[0][1] - H[2][1] * p;
    const J10 = H[1][0] - H[2][0] * q, J11 = H[1][1] - H[2][1] * q;

    // Rv rotates the optical axis onto the ray through the image of the plane origin
    const n = [p, q, 1];
    const nl = Math.hypot(p, q, 1);
    n[0] /= nl; n[1] /= nl; n[2] /= nl;
    let Rv;
    const axisLen = Math.hypot(n[0], n[1]);
    if (axisLen < 1e-12) {
      Rv = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    } else {
      const th = Math.atan2(axisLen, n[2]);
      Rv = _expSO3([-n[1] / axisLen * th, n[0] / axisLen * th, 0]);
    }

    const B00 = Rv[0] - p * Rv[6], B01 = Rv[1] - p * Rv[7];
    const B10 = Rv[3] - q * Rv[6], B11 = Rv[4] - q * Rv[7];
    const det = B00 * B11 - B01 * B10;
    if (Math.abs(det) < 1e-12) return [];
    const Bi00 = B11 / det, Bi01 = -B01 / det, Bi10 = -B10 / det, Bi11 = B00 / det;

    const A00 = Bi00 * J00 + Bi01 * J10, A01 = Bi00 * J01 + Bi01 * J11;
    const A10 = Bi10 * J00 + Bi11 * J10, A11 = Bi10 * J01 + Bi11 * J11;

    // Largest singular value of A
    const ata00 = A00 * A00 + A10 * A10;
    const ata01 = A00 * A01 + A10 * A11;
    const ata11 = A01 * A01 + A11 * A11;
    const gamma2 = 0.5 * (ata00 + ata11 + Math.sqrt((ata00 - ata11) * (ata00 - ata11) + 4 * ata01 * ata01));
    if (!(gamma2 > 1e-18)) return [];
    const gamma = Math.sqrt(gamma2);

    const r00 = A00 / gamma, r01 = A01 / gamma, r10 = A10 / gamma, r11 = A11 / gamma;
    const b0 = Math.sqrt(Math.max(0, 1 - r00 * r00 - r10 * r10));
    let b1 = Math.sqrt(Math.max(0, 1 - r01 * r01 - r11 * r11));
    if (r00 * r01 + r10 * r11 > 0) b1 = -b1;

    const results = [];
    for (const sgn of [1, -1]) {
      const c0 = [r00, r10, sgn * b0];
      const c1 = [r01, r11, sgn * b1];
      const c2 = _cross(c0, c1);
      const Rt = [c0[0], c1[0], c2[0], c0[1], c1[1], c2[1], c0[2], c1[2], c2[2]];
      const Rp = _orthonormalize(_m3Mul(Rv, Rt)); // columns: plane X, plane Y, plane normal

      // Translation by linear least squares over the 4 corners
      const AtA = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      const Atb = [0, 0, 0];
      for (let i = 0; i < 4; i++) {
        const X = planePts[i].x, Y = planePts[i].z;
        const Rm = [Rp[0] * X + Rp[1] * Y, Rp[3] * X + Rp[4] * Y, Rp[6] * X + Rp[7] * Y];
        const u = imgPts[i].x, v = imgPts[i].y;
        const rows = [[1, 0, -u, u * Rm[2] - Rm[0]], [0, 1, -v, v * Rm[2] - Rm[1]]];
        for (const r of rows) {
          for (let a = 0; a < 3; a++) {
            Atb[a] += r[a] * r[3];
            for (let b = 0; b < 3; b++) AtA[a][b] += r[a] * r[b];
          }
        }
      }
      const tp = this._solveLinearSystem(AtA, Atb);
      if (!tp || tp[2] <= 0) continue;

      // Plane frame -> model frame: model x = plane X, model z = plane Y, model y = z x x = -normal
      const col0 = [Rp[0], Rp[3], Rp[6]];
      const col2 = [Rp[1], Rp[4], Rp[7]];
      const col1 = _cross(col2, col0);
      const R = [col0[0], col1[0], col2[0], col0[1], col1[1], col2[1], col0[2], col1[2], col2[2]];
      const Mc = [marker.fieldPos.x, 0, marker.fieldPos.z];
      const RMc = _m3MulVec(R, Mc);
      results.push({ R, t: [tp[0] - RMc[0], tp[1] - RMc[1], tp[2] - RMc[2]] });
    }
    return results;
  }

  _reprojErrorPx(R, t, pts, f) {
    let sum = 0;
    for (const p of pts) {
      const P = _m3MulVec(R, p.M);
      const z = P[2] + t[2];
      if (z <= 1e-3) return Infinity;
      const du = (P[0] + t[0]) / z - p.u;
      const dv = (P[1] + t[1]) / z - p.v;
      sum += du * du + dv * dv;
    }
    return f * Math.sqrt(sum / pts.length);
  }

  /** Levenberg-Marquardt refinement of (R, t) minimizing pixel reprojection error (Huber-weighted). */
  _refinePose(R0, t0, pts, f, maxIters = 15) {
    const HUBER_PX = 2.0;
    let R = R0.slice();
    let t = t0.slice();
    let lambda = 1e-3;

    const evaluate = (R, t, buildJ) => {
      const JtJ = buildJ ? Array.from({ length: 6 }, () => new Array(6).fill(0)) : null;
      const Jtr = buildJ ? new Array(6).fill(0) : null;
      let cost = 0;

      const accumulate = (Jrow, r, w) => {
        cost += w * r * r;
        if (!buildJ) return;
        for (let a = 0; a < 6; a++) {
          Jtr[a] += w * Jrow[a] * r;
          for (let b = a; b < 6; b++) JtJ[a][b] += w * Jrow[a] * Jrow[b];
        }
      };

      for (const p of pts) {
        const a = _m3MulVec(R, p.M);
        const X = a[0] + t[0], Y = a[1] + t[1], Z = a[2] + t[2];
        if (Z <= 1e-3) return null;
        const iz = 1 / Z;
        const x = X * iz, y = Y * iz;
        const ru = f * (x - p.u), rv = f * (y - p.v);
        // d(pixel)/dP = f * [[1/Z, 0, -x/Z], [0, 1/Z, -y/Z]];  dP/dw = -[a]x;  dP/dt = I
        const du = [f * iz, 0, -f * x * iz];
        const dv = [0, f * iz, -f * y * iz];
        const Ju = [
          du[1] * -a[2] + du[2] * a[1], du[0] * a[2] + du[2] * -a[0], du[0] * -a[1] + du[1] * a[0],
          du[0], du[1], du[2]
        ];
        const Jv = [
          dv[1] * -a[2] + dv[2] * a[1], dv[0] * a[2] + dv[2] * -a[0], dv[0] * -a[1] + dv[1] * a[0],
          dv[0], dv[1], dv[2]
        ];
        const e = Math.hypot(ru, rv);
        const w = e > HUBER_PX ? HUBER_PX / e : 1.0;
        accumulate(Ju, ru, w);
        accumulate(Jv, rv, w);
      }

      if (buildJ) {
        for (let a = 0; a < 6; a++) for (let b = 0; b < a; b++) JtJ[a][b] = JtJ[b][a];
      }
      return { cost, JtJ, Jtr };
    };

    let cur = evaluate(R, t, true);
    if (!cur) return null;

    for (let iter = 0; iter < maxIters; iter++) {
      const A = cur.JtJ.map((row, i) => row.map((v, j) => (i === j ? v * (1 + lambda) + 1e-9 : v)));
      const delta = this._solveLinearSystem(A, cur.Jtr.map(v => -v));
      if (!delta) break;

      const Rn = _orthonormalize(_m3Mul(_expSO3([delta[0], delta[1], delta[2]]), R));
      const tn = [t[0] + delta[3], t[1] + delta[4], t[2] + delta[5]];
      const next = evaluate(Rn, tn, true);

      if (next && next.cost < cur.cost) {
        const improvement = cur.cost - next.cost;
        R = Rn; t = tn; cur = next;
        lambda = Math.max(1e-7, lambda / 3);
        if (improvement < 1e-6 * (cur.cost + 1e-9)) break;
      } else {
        lambda *= 5;
        if (lambda > 1e6) break;
      }
      const stepNorm = Math.hypot(delta[0], delta[1], delta[2], delta[3], delta[4], delta[5]);
      if (stepNorm < 1e-9) break;
    }

    return { R, t, errPx: this._reprojErrorPx(R, t, pts, f) };
  }

  // --- TEMPORAL SMOOTHING (anchored on the visible markers) ---
  /**
   * Smooths rotation and the camera-space position of the marker anchor separately, then rebuilds the
   * translation from them. Keeping the anchor (what the user is looking at) as the pivot means rotation
   * smoothing never drags the course away from the markers on screen.
   */
  _smoothState(solved, K, now) {
    if (!this._state || now - this._lastFrameTime > 500) {
      this._state = { R: solved.R.slice(), t: solved.t.slice() };
      this._lastFrameTime = now;
      return;
    }
    const dt = Math.max(0.005, Math.min(0.25, (now - this._lastFrameTime) / 1000));
    this._lastFrameTime = now;

    const A = solved.anchor;
    const aPrevR = _m3MulVec(this._state.R, A);
    const aNewR = _m3MulVec(solved.R, A);
    const aPrev = [aPrevR[0] + this._state.t[0], aPrevR[1] + this._state.t[1], aPrevR[2] + this._state.t[2]];
    const aNew = [aNewR[0] + solved.t[0], aNewR[1] + solved.t[1], aNewR[2] + solved.t[2]];

    // Speed of the anchor on screen (px/s) and rotation speed (deg/s)
    const z = Math.max(0.1, aNew[2]);
    const pxDelta = K.fx * Math.hypot(aNew[0] - aPrev[0], aNew[1] - aPrev[1]) / z
      + K.fx * Math.abs(aNew[2] - aPrev[2]) / z * 0.5;
    const angDelta = _rotAngle(this._state.R, solved.R) * 180 / Math.PI;

    const alphaFor = (cutoff) => 1 - Math.exp(-2 * Math.PI * cutoff * dt);
    const aPos = alphaFor(this.posMinCutoff + this.posBeta * pxDelta / dt);
    const aRot = alphaFor(this.rotMinCutoff + this.rotBeta * angDelta / dt);

    const anchorF = [
      aPrev[0] + (aNew[0] - aPrev[0]) * aPos,
      aPrev[1] + (aNew[1] - aPrev[1]) * aPos,
      aPrev[2] + (aNew[2] - aPrev[2]) * aPos
    ];
    const qPrev = this._quaternionFromMatrix(this._toNested(this._state.R));
    const qNew = this._quaternionFromMatrix(this._toNested(solved.R));
    const RF = this._matrixFromQuaternion(this._quaternionSlerp(qPrev, qNew, aRot));
    const RA = _m3MulVec(RF, A);

    this._state = { R: RF, t: [anchorF[0] - RA[0], anchorF[1] - RA[1], anchorF[2] - RA[2]] };
  }

  _toNested(R) {
    return [[R[0], R[1], R[2]], [R[3], R[4], R[5]], [R[6], R[7], R[8]]];
  }

  _matrixFromQuaternion(q) {
    const { x, y, z, w } = q;
    return [
      1 - 2 * (y * y + z * z), 2 * (x * y - z * w),     2 * (x * z + y * w),
      2 * (x * y + z * w),     1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
      2 * (x * z - y * w),     2 * (y * z + x * w),     1 - 2 * (x * x + y * y)
    ];
  }

  // --- HARTLEY-NORMALIZED HOMOGRAPHY SOLVER (4 OR MORE POINTS) ---
  /**
   * Normalizes both 2D ground coordinates and 2D image coordinates (centroid at origin, mean distance = sqrt(2))
   * before solving DLT normal equations, eliminating floating-point ill-conditioning.
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
    if (srcMeanDist < 1e-12 || dstMeanDist < 1e-12) return null;

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

  // --- OPENCV TO BABYLON.JS COORDINATE TRANSFORMATION ---
  _convertCvToBabylon(R, T) {
    // OpenCV camera: +X right, +Y down, +Z forward. Babylon camera: +X right, +Y up, +Z forward.
    // Model frame has Y flipped w.r.t. the Babylon field frame, so R_bab = S * R * S with S = diag(1, -1, 1)
    const posBabylon = {
      x: T[0],
      y: -T[1],
      z: T[2]
    };

    const R_bab = [
      [ R[0], -R[1],  R[2]],
      [-R[3],  R[4], -R[5]],
      [ R[6], -R[7],  R[8]]
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
   * Converts a 3x3 column-vector rotation matrix (v' = R v) into a quaternion.
   * Babylon's Matrix.Compose builds exactly this rotation from a quaternion (its row-major storage is
   * the transpose, matched by its row-vector multiplication), so the standard formula applies as-is.
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

    const len = Math.hypot(x, y, z, w) || 1.0;
    return { x: x / len, y: y / len, z: z / len, w: w / len };
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

      if (maxVal < 1e-18) return null; // Singular matrix

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
          if (factor !== 0) {
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
