/**
 * Agility Course Designer - ArUco field tracker
 *
 * Turns the ArUco markers detected in a camera frame into the pose of the camera relative to the agility
 * field, so the 3D course can be drawn on top of the video.
 *
 * What is trusted and what is not:
 *  - TRUSTED: where the CENTER of each marker sits on the field (the 8 perimeter points) and how the
 *    markers are placed: either lying flat on the ground, or standing upright on a pedestal with their
 *    center at a known height.
 *  - NOT TRUSTED: the angle of each marker (how a flat marker is turned on the ground / which way an
 *    upright marker faces) and the printed marker size. As soon as two or more markers are visible both
 *    are estimated from the image (and remembered), so a marker placed a few degrees off - or a
 *    scaled-down test layout on a desk - still gives a consistent fit. Only when a single marker is
 *    visible do the remembered (or default) angle and size get used. Defaults: a flat marker has its top
 *    toward north, an upright marker faces the center of the field.
 *
 * Per frame:
 *  1. IPPE on individual markers gives starting poses (a planar square always has two, the "tilt flip").
 *  2. Each start is refined by Levenberg-Marquardt on the pixel reprojection error of every visible corner.
 *  3. The best fit wins; near-ties are resolved by "the camera is not upside down" and by continuity.
 *  4. The result is smoothed around the visible markers, so they stay locked on screen.
 *  5. When no marker is visible the pose is held; if the device has an orientation sensor that was verified
 *     against the markers, the hold keeps following the camera rotation.
 *
 * Frames:
 *  - Field (Babylon world, left-handed): x east, y up, z north, origin at the field center.
 *  - Ground (solver, right-handed): X = east, Y = north, Z = up.
 *  - Camera (OpenCV): x right, y down, z forward.  P_cam = R * P_ground + t
 *
 * Matrices are flat row-major arrays of 9 numbers.
 */
(function (global) {
  'use strict';

  const DEG = Math.PI / 180;

  // ---------------------------------------------------------------------------------------------
  // Small linear algebra helpers
  // ---------------------------------------------------------------------------------------------
  function mul(A, B) {
    const C = new Array(9);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
      }
    }
    return C;
  }

  function mulVec(A, v) {
    return [
      A[0] * v[0] + A[1] * v[1] + A[2] * v[2],
      A[3] * v[0] + A[4] * v[1] + A[5] * v[2],
      A[6] * v[0] + A[7] * v[1] + A[8] * v[2]
    ];
  }

  function tMulVec(A, v) {
    return [
      A[0] * v[0] + A[3] * v[1] + A[6] * v[2],
      A[1] * v[0] + A[4] * v[1] + A[7] * v[2],
      A[2] * v[0] + A[5] * v[1] + A[8] * v[2]
    ];
  }

  function transpose(A) {
    return [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]];
  }

  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }

  function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  /** Rotation matrix for the rotation vector w (Rodrigues). */
  function expSO3(w) {
    const th = Math.hypot(w[0], w[1], w[2]);
    if (th < 1e-12) return [1, -w[2], w[1], w[2], 1, -w[0], -w[1], w[0], 1];
    const kx = w[0] / th, ky = w[1] / th, kz = w[2] / th;
    const c = Math.cos(th), s = Math.sin(th), v = 1 - c;
    return [
      c + kx * kx * v, kx * ky * v - kz * s, kx * kz * v + ky * s,
      ky * kx * v + kz * s, c + ky * ky * v, ky * kz * v - kx * s,
      kz * kx * v - ky * s, kz * ky * v + kx * s, c + kz * kz * v
    ];
  }

  /** Angle in radians of the rotation that takes A to B. */
  function rotAngle(A, B) {
    let tr = 0;
    for (let i = 0; i < 9; i++) tr += A[i] * B[i];
    return Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2)));
  }

  /** Gram-Schmidt on the rows; keeps a nearly-orthogonal matrix a proper rotation. */
  function orthonormalize(R) {
    let r0 = [R[0], R[1], R[2]];
    let n = Math.hypot(r0[0], r0[1], r0[2]);
    r0 = [r0[0] / n, r0[1] / n, r0[2] / n];
    let r1 = [R[3], R[4], R[5]];
    const d = dot(r0, r1);
    r1 = [r1[0] - d * r0[0], r1[1] - d * r0[1], r1[2] - d * r0[2]];
    n = Math.hypot(r1[0], r1[1], r1[2]);
    r1 = [r1[0] / n, r1[1] / n, r1[2] / n];
    const r2 = cross(r0, r1);
    return [r0[0], r0[1], r0[2], r1[0], r1[1], r1[2], r2[0], r2[1], r2[2]];
  }

  /** Rotation that goes the fraction alpha of the way from A to B. */
  function slerp(A, B, alpha) {
    if (alpha >= 1) return B.slice();
    const D = mul(B, transpose(A));
    const ang = Math.acos(Math.max(-1, Math.min(1, (D[0] + D[4] + D[8] - 1) / 2)));
    if (ang < 1e-9) return B.slice();
    const s = 2 * Math.sin(ang);
    if (Math.abs(s) < 1e-6) return B.slice(); // 180 degrees apart: no unique path, just snap
    const k = alpha * ang / s;
    return orthonormalize(mul(expSO3([(D[7] - D[5]) * k, (D[2] - D[6]) * k, (D[3] - D[1]) * k]), A));
  }

  /** Gaussian elimination with partial pivoting. Returns null for a singular system. */
  function solveLinear(A, b) {
    const n = b.length;
    const M = A.map((row, i) => row.concat([b[i]]));
    for (let i = 0; i < n; i++) {
      let p = i;
      for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
      if (!(Math.abs(M[p][i]) > 1e-14)) return null;
      if (p !== i) { const tmp = M[i]; M[i] = M[p]; M[p] = tmp; }
      const piv = M[i][i];
      for (let c = i; c <= n; c++) M[i][c] /= piv;
      for (let r = 0; r < n; r++) {
        if (r === i) continue;
        const fct = M[r][i];
        if (fct === 0) continue;
        for (let c = i; c <= n; c++) M[r][c] -= fct * M[i][c];
      }
    }
    const x = M.map(row => row[n]);
    return x.every(Number.isFinite) ? x : null;
  }

  // ---------------------------------------------------------------------------------------------
  // Field layout
  // ---------------------------------------------------------------------------------------------
  // ArUco corner order is clockwise from the marker's own top-left. For a marker lying on the ground with
  // its top toward north that is (west,north), (east,north), (east,south), (west,south).
  const CORNER_SIGNS = [[-1, 1], [1, 1], [1, -1], [-1, -1]];

  /** Ground position [X east, Y north] of the center of each of the 8 perimeter markers. */
  function markerLayout(field) {
    const W = (field && field.widthMeters) || 40;
    const L = (field && field.lengthMeters) || 20;
    const hw = W / 2, hl = L / 2;
    return {
      top_left: [-hw, hl], top_mid: [0, hl], top_right: [hw, hl],
      right_mid: [hw, 0],
      bottom_right: [hw, -hl], bottom_mid: [0, -hl], bottom_left: [-hw, -hl],
      left_mid: [-hw, 0]
    };
  }

  // ---------------------------------------------------------------------------------------------
  // IPPE: the two poses of a single square marker (Collins & Bartoli, IJCV 2014)
  // ---------------------------------------------------------------------------------------------
  /**
   * @param {number} half - half of the marker edge length
   * @param {number[][]} img - the 4 corners in normalized image coordinates [(px - cx) / f, (py - cy) / f]
   * @returns {{R:number[], t:number[]}[]} up to two marker -> camera poses. Marker frame: x toward the
   *          marker's right edge, y toward its top edge, z out of the printed face.
   */
  function ippeSquare(half, img) {
    // Homography from the marker plane (in units of `half`, so corners are at +-1) to the image
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const X = CORNER_SIGNS[i][0], Y = CORNER_SIGNS[i][1];
      const u = img[i][0], v = img[i][1];
      A.push([X, Y, 1, 0, 0, 0, -u * X, -u * Y]); b.push(u);
      A.push([0, 0, 0, X, Y, 1, -v * X, -v * Y]); b.push(v);
    }
    const h = solveLinear(A, b);
    if (!h) return [];
    // Back to metric plane units
    const H00 = h[0] / half, H01 = h[1] / half, p = h[2];
    const H10 = h[3] / half, H11 = h[4] / half, q = h[5];
    const H20 = h[6] / half, H21 = h[7] / half;

    const J00 = H00 - H20 * p, J01 = H01 - H21 * p;
    const J10 = H10 - H20 * q, J11 = H11 - H21 * q;

    // Rv turns the optical axis onto the ray through the image of the marker center
    const tn = Math.hypot(p, q);
    const Rv = tn < 1e-12 ? [1, 0, 0, 0, 1, 0, 0, 0, 1]
      : expSO3([-q / tn * Math.atan2(tn, 1), p / tn * Math.atan2(tn, 1), 0]);

    const B00 = Rv[0] - p * Rv[6], B01 = Rv[1] - p * Rv[7];
    const B10 = Rv[3] - q * Rv[6], B11 = Rv[4] - q * Rv[7];
    const det = B00 * B11 - B01 * B10;
    if (!(Math.abs(det) > 1e-12)) return [];
    const A00 = (B11 * J00 - B01 * J10) / det, A01 = (B11 * J01 - B01 * J11) / det;
    const A10 = (-B10 * J00 + B00 * J10) / det, A11 = (-B10 * J01 + B00 * J11) / det;

    // Largest singular value of the 2x2 matrix
    const s00 = A00 * A00 + A10 * A10, s01 = A00 * A01 + A10 * A11, s11 = A01 * A01 + A11 * A11;
    const gamma = Math.sqrt(0.5 * (s00 + s11 + Math.sqrt((s00 - s11) * (s00 - s11) + 4 * s01 * s01)));
    if (!(gamma > 1e-12)) return [];

    const r00 = A00 / gamma, r01 = A01 / gamma, r10 = A10 / gamma, r11 = A11 / gamma;
    const b0 = Math.sqrt(Math.max(0, 1 - r00 * r00 - r10 * r10));
    let b1 = Math.sqrt(Math.max(0, 1 - r01 * r01 - r11 * r11));
    if (r00 * r01 + r10 * r11 > 0) b1 = -b1;

    const out = [];
    for (const sgn of [1, -1]) {
      const c0 = [r00, r10, sgn * b0];
      const c1 = [r01, r11, sgn * b1];
      const c2 = cross(c0, c1);
      const R = orthonormalize(mul(Rv, [c0[0], c1[0], c2[0], c0[1], c1[1], c2[1], c0[2], c1[2], c2[2]]));

      // Translation by linear least squares over the 4 corners
      const N = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], g = [0, 0, 0];
      for (let i = 0; i < 4; i++) {
        const X = CORNER_SIGNS[i][0] * half, Y = CORNER_SIGNS[i][1] * half;
        const P = [R[0] * X + R[1] * Y, R[3] * X + R[4] * Y, R[6] * X + R[7] * Y];
        const rows = [[1, 0, -img[i][0], img[i][0] * P[2] - P[0]], [0, 1, -img[i][1], img[i][1] * P[2] - P[1]]];
        for (const r of rows) {
          for (let a = 0; a < 3; a++) {
            g[a] += r[a] * r[3];
            for (let c = 0; c < 3; c++) N[a][c] += r[a] * r[c];
          }
        }
      }
      const t = solveLinear(N, g);
      if (t && t[2] > 0) out.push({ R, t });
    }
    return out;
  }

  // ---------------------------------------------------------------------------------------------
  // Reprojection model and Levenberg-Marquardt refinement
  // ---------------------------------------------------------------------------------------------
  const HUBER_PX = 3.0;

  /**
   * Pixel residuals of every corner for the state { R, t, yaws[], size }.
   * obs[k] = { c: [X, Y, Z] marker center in the ground frame, img: 4 normalized corners }
   * model = { upright, camWeight, camHeight }: marker placement and the optional camera height prior
   * Returns null when a corner falls behind the camera.
   */
  function residuals(st, obs, f, model, outBuf) {
    const R = st.R, t = st.t, half = st.size / 2;
    const upright = model.upright;
    const fs = st.fs || 1;
    const m = obs.length * 8 + (model.camWeight ? 2 : 0);
    const out = outBuf || new Float64Array(m);
    for (let k = 0; k < obs.length; k++) {
      const o = obs[k];
      const cs = Math.cos(st.yaws[k]) * half, sn = Math.sin(st.yaws[k]) * half;
      for (let j = 0; j < 4; j++) {
        const sx = CORNER_SIGNS[j][0], sy = CORNER_SIGNS[j][1];
        let X, Y, Z;
        if (upright) {
          // Standing marker facing the direction of its angle: its right edge is horizontal, its top is up
          X = o.c[0] - sn * sx;
          Y = o.c[1] + cs * sx;
          Z = o.c[2] + half * sy;
        } else {
          // Marker lying on the ground, turned by its angle
          X = o.c[0] + cs * sx - sn * sy;
          Y = o.c[1] + sn * sx + cs * sy;
          Z = o.c[2];
        }
        const z = R[6] * X + R[7] * Y + R[8] * Z + t[2];
        if (!(z > 1e-6)) return null;
        // st.fs rescales the focal length (1 = the focal length the corners were normalized with)
        out[k * 8 + j * 2] = f * (fs * (R[0] * X + R[1] * Y + R[2] * Z + t[0]) / z - o.img[j][0]);
        out[k * 8 + j * 2 + 1] = f * (fs * (R[3] * X + R[4] * Y + R[5] * Z + t[1]) / z - o.img[j][1]);
      }
    }
    if (model.camWeight) {
      // Weak pull of the camera height toward the expected one; only matters where the image says little
      out[obs.length * 8] = model.camWeight * (-(R[2] * t[0] + R[5] * t[1] + R[8] * t[2]) - model.camHeight);
      out[obs.length * 8 + 1] = 0;
    }
    return out;
  }

  /**
   * Rotation marker frame -> ground frame (columns: marker right, marker top, out of the printed face).
   * Flat: the marker lies face-up, turned by `angle` (0 = top toward north).
   * Upright: the marker stands with its top up and its face looking along `angle` (0 = east).
   */
  function markerToGround(upright, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return upright
      ? [-s, 0, c, c, 0, s, 0, 1, 0]
      : [c, -s, 0, s, c, 0, 0, 0, 1];
  }

  function robustCost(r, len) {
    const m = len !== undefined ? len : r.length;
    let cost = 0;
    for (let i = 0; i < m; i += 2) {
      const e2 = r[i] * r[i] + r[i + 1] * r[i + 1];
      cost += e2 <= HUBER_PX * HUBER_PX ? e2 : 2 * HUBER_PX * Math.sqrt(e2) - HUBER_PX * HUBER_PX;
    }
    return cost;
  }

  // Reusable LM scratch buffers to avoid per-frame typed/matrix allocations inside refine()
  const _lmVecScratch = { cap: 0, r: null, rc: null, rp: null, w: null };
  const _lmDimScratch = [];
  function _getRefineScratch(m, nP) {
    if (_lmVecScratch.cap < m) {
      const cap = Math.max(m, 66);
      _lmVecScratch.cap = cap;
      _lmVecScratch.r = new Float64Array(cap);
      _lmVecScratch.rc = new Float64Array(cap);
      _lmVecScratch.rp = new Float64Array(cap);
      _lmVecScratch.w = new Float64Array(cap);
    }
    let ds = _lmDimScratch[nP];
    if (!ds || ds.mCap < m) {
      const mCap = Math.max(m, ds ? ds.mCap : 66);
      if (!ds) {
        const Hm = [], Ad = [];
        for (let a = 0; a < nP; a++) {
          Hm.push(new Array(nP).fill(0));
          Ad.push(new Array(nP).fill(0));
        }
        ds = _lmDimScratch[nP] = {
          mCap,
          d: new Array(nP).fill(0),
          g: new Array(nP).fill(0),
          Hm,
          Ad,
          J: []
        };
      } else {
        ds.mCap = mCap;
      }
      for (let p = 0; p < nP; p++) {
        ds.J[p] = new Float64Array(mCap);
      }
    }
    return { vec: _lmVecScratch, dim: ds };
  }

  /**
   * Refines a starting state. The camera pose is always optimized; with freeExtras the turn of every
   * marker on the ground and the common marker size are optimized too, and with model.freeFocal the
   * camera focal length as well (st.fs, a factor on the focal length f).
   */
  function refine(start, obs, f, freeExtras, model, maxIter) {
    const n = obs.length;
    const iF = 6 + (freeExtras ? n + 1 : 0);
    const nP = iF + (model.freeFocal ? 1 : 0);
    const m = n * 8 + (model.camWeight ? 2 : 0);
    const { vec, dim } = _getRefineScratch(m, nP);
    let r = vec.r, rc = vec.rc;
    const rp = vec.rp, w = vec.w;
    const { d, g, Hm, Ad, J } = dim;

    const apply = (st, step) => ({
      R: orthonormalize(mul(expSO3([step[0], step[1], step[2]]), st.R)),
      t: [st.t[0] + step[3], st.t[1] + step[4], st.t[2] + step[5]],
      yaws: freeExtras ? st.yaws.map((y, i) => y + step[6 + i]) : st.yaws,
      size: freeExtras ? st.size * Math.exp(step[6 + n]) : st.size,
      fs: model.freeFocal ? st.fs * Math.exp(step[iF]) : st.fs
    });

    let st = { R: start.R, t: start.t, yaws: start.yaws, size: start.size, fs: start.fs || 1 };
    if (!residuals(st, obs, f, model, r)) return null;
    let cost = robustCost(r, m);
    let lambda = 1e-3;
    const EPS = 1e-6;

    for (let iter = 0; iter < (maxIter || 12); iter++) {
      // Numeric Jacobian (at most 15 parameters, so this stays cheap)
      let ok = true;
      d.fill(0);
      for (let p = 0; p < nP && ok; p++) {
        d[p] = EPS;
        const rpOk = residuals(apply(st, d), obs, f, model, rp);
        d[p] = 0;
        if (!rpOk) { ok = false; break; }
        const col = J[p];
        for (let i = 0; i < m; i++) col[i] = (rp[i] - r[i]) / EPS;
      }
      if (!ok) break;

      // Huber weights per corner
      for (let i = 0; i < m; i += 2) {
        const e = Math.hypot(r[i], r[i + 1]);
        w[i] = w[i + 1] = e > HUBER_PX ? HUBER_PX / e : 1;
      }

      for (let a = 0; a < nP; a++) {
        const colA = J[a];
        let ga = 0;
        for (let i = 0; i < m; i++) ga += w[i] * colA[i] * r[i];
        g[a] = -ga;
      }
      for (let a = 0; a < nP; a++) {
        const colA = J[a];
        for (let c = a; c < nP; c++) {
          const colC = J[c];
          let s = 0;
          for (let i = 0; i < m; i++) s += w[i] * colA[i] * colC[i];
          Hm[a][c] = Hm[c][a] = s;
        }
      }

      let accepted = false, gain = 0;
      for (let attempt = 0; attempt < 8; attempt++) {
        for (let i = 0; i < nP; i++) {
          const hRow = Hm[i], aRow = Ad[i];
          for (let j = 0; j < nP; j++) {
            aRow[j] = i === j ? hRow[j] * (1 + lambda) + 1e-12 : hRow[j];
          }
        }
        const delta = solveLinear(Ad, g);
        if (delta) {
          const cand = apply(st, delta);
          if (residuals(cand, obs, f, model, rc)) {
            const cc = robustCost(rc, m);
            if (cc < cost) {
              gain = cost - cc;
              st = cand;
              const tmp = r; r = rc; rc = tmp;
              cost = cc;
              lambda = Math.max(lambda / 3, 1e-9);
              accepted = true;
              break;
            }
          }
        }
        lambda *= 4;
      }
      if (!accepted || gain < 1e-7 * cost + 1e-10) break;
    }

    // RMS corner error in pixels (the camera height prior is not a corner)
    let sum = 0;
    for (let i = 0; i < n * 8; i++) sum += r[i] * r[i];
    st.cost = cost;
    st.rms = Math.sqrt(sum / (n * 4));
    return st;
  }

  // ---------------------------------------------------------------------------------------------
  // Device orientation (gyroscope) support
  // ---------------------------------------------------------------------------------------------
  // How the camera axes can sit relative to the device axes (rear or front camera, 4 screen rotations).
  // The right one is found by comparing the sensor with what the markers show, so no assumption about
  // the browser's screen-orientation conventions is needed.
  const CAMERA_MOUNTS = (function () {
    const list = [];
    for (const base of [[1, 0, 0, 0, -1, 0, 0, 0, -1], [-1, 0, 0, 0, -1, 0, 0, 0, 1]]) {
      for (let k = 0; k < 4; k++) list.push(mul(expSO3([0, 0, k * Math.PI / 2]), base));
    }
    return list;
  })();

  /** W3C DeviceOrientation angles (degrees) -> rotation matrix device -> earth. */
  function deviceRotationMatrix(alpha, beta, gamma) {
    const cZ = Math.cos(alpha * DEG), sZ = Math.sin(alpha * DEG);
    const cX = Math.cos(beta * DEG), sX = Math.sin(beta * DEG);
    const cY = Math.cos(gamma * DEG), sY = Math.sin(gamma * DEG);
    return [
      cZ * cY - sZ * sX * sY, -cX * sZ, cY * sZ * sX + cZ * sY,
      cY * sZ + cZ * sX * sY, cZ * cX, sZ * sY - cZ * cY * sX,
      -cX * sY, sX, cX * cY
    ];
  }

  /** Camera rotation between two device orientations, for a given camera mount. */
  function cameraDelta(mount, RdPrev, RdNow) {
    return mul(transpose(mount), mul(mul(transpose(RdNow), RdPrev), mount));
  }

  /** Listens to the browser's device orientation events (phones / tablets). */
  class DeviceRotationSensor {
    constructor() {
      this._R = null;
      this._time = 0;
      this._listening = false;
      this._listen();
    }

    _listen() {
      if (this._listening || typeof window === 'undefined' || !window.addEventListener) return;
      this._listening = true;
      window.addEventListener('deviceorientation', (e) => {
        if (e.alpha === null || e.beta === null || e.gamma === null) return;
        this._R = deviceRotationMatrix(e.alpha, e.beta, e.gamma);
        this._time = performance.now();
      }, true);
    }

    /** iOS only hands out orientation events after a permission prompt started by a user gesture. */
    async requestPermission() {
      try {
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
          return (await DeviceOrientationEvent.requestPermission()) === 'granted';
        }
      } catch (err) {
        console.warn('[ArUco] Device orientation permission:', err);
        return false;
      }
      return true;
    }

    /** Latest device -> earth rotation, or null when there is no (fresh) sensor data. */
    current() {
      return this._R && performance.now() - this._time < 500 ? this._R : null;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // The tracker
  // ---------------------------------------------------------------------------------------------
  class ArUcoFieldTracker {
    constructor(options = {}) {
      this.markerSizeMeters = options.markerSizeMeters || 0.25;
      this.fovDegrees = options.fovDegrees || 65;   // across the LONGER side of the video
      this.holdMs = options.holdMs || 1500;         // pose kept this long without markers (no sensor)
      this.gyroHoldMs = options.gyroHoldMs || 20000; // ... and this long when the sensor follows rotation
      this.minMarkerSidePx = 4;

      // How the markers are placed: 'flat' on the ground, or 'upright' on a pedestal facing the field center
      this.markerPlacement = options.markerPlacement === 'upright' ? 'upright' : 'flat';
      this.markerHeightMeters = options.markerHeightMeters || 1.0; // upright only: marker CENTER above ground
      this.cameraHeightMeters = 1.5;   // upright only: expected camera height (soft)
      this.cameraHeightWeight = options.cameraHeightWeight === undefined ? 1.5 : options.cameraHeightWeight; // px per meter off

      // Smoothing: cutoff frequency (Hz) at rest, plus how much it opens up with motion
      this.rotMinCutoff = 1.0; this.rotBeta = 0.05;  // per deg/s
      this.posMinCutoff = 2.0; this.posBeta = 0.03;  // per px/s

      this.autoFov = options.autoFov !== false;      // measure the camera field of view from the markers

      this.isLocked = false;
      this.reset();
    }

    /** Forget everything, including what was learned about the markers and the camera. */
    reset() {
      this.map = { yaw: {}, yawCount: {}, size: null, sizeCount: 0 };
      // Measured from the marker centers: camera focal length and the shape of the marker rectangle
      this.cal = { focal: [], focalFit: [], focalRatio: null, aspect: [], aspectFor: null, measuredAspect: null };
      this.isLocked = false;
      this._gyro = { prev: null, scores: new Array(CAMERA_MOUNTS.length).fill(0), mount: -1, ref: null };
      this._dropTracking();
    }

    _dropTracking() {
      this.pose = null;      // smoothed { R, t }
      this.raw = null;       // last accepted unsmoothed { R, t }
      this._lastSolveTime = -Infinity;
      this._jumps = 0;
      this._lastInfo = null;
    }

    setMarkerSize(meters) {
      const v = parseFloat(meters);
      if (v > 0 && v !== this.markerSizeMeters) {
        this.markerSizeMeters = v;
        this.map.size = null;
        this.map.sizeCount = 0;
      }
    }

    /** 'flat' (on the ground) or 'upright' (on a pedestal, facing the field center). */
    setMarkerPlacement(placement) {
      const p = placement === 'upright' ? 'upright' : 'flat';
      if (p !== this.markerPlacement) {
        this.markerPlacement = p;
        this.reset(); // what was learned about the markers belongs to the other placement
      }
    }

    /** Upright markers only: height of the marker center above the ground. */
    setMarkerHeight(meters) {
      const v = parseFloat(meters);
      if (v >= 0 && v !== this.markerHeightMeters) {
        this.markerHeightMeters = v;
        this._dropTracking();
      }
    }

    get _upright() {
      return this.markerPlacement === 'upright';
    }

    setFov(degrees) {
      const v = parseFloat(degrees);
      if (v >= 20 && v <= 150) this.fovDegrees = v;
    }

    /** Whether the camera field of view is measured from the markers (true) or always taken from setFov. */
    setAutoFov(enabled) {
      this.autoFov = !!enabled;
    }

    /** The field of view in use right now (degrees, across the longer side of the video). */
    get effectiveFovDegrees() {
      return this.autoFov && this.cal.focalRatio
        ? 2 * Math.atan(0.5 / this.cal.focalRatio) / DEG
        : this.fovDegrees;
    }

    setLocked(locked) {
      this.isLocked = !!locked && !!this.pose;
      return this.isLocked;
    }

    toggleLock() {
      return this.setLocked(!this.isLocked);
    }

    get gyroActive() {
      return this._gyro.mount >= 0;
    }

    /** Pinhole intrinsics: square pixels, principal point at the image center. */
    intrinsics(width, height) {
      const f = (Math.max(width, height) / 2) / Math.tan(this.effectiveFovDegrees * DEG / 2);
      return { f, cx: width / 2, cy: height / 2 };
    }

    /** Vertical field of view (radians) matching intrinsics(), for the 3D camera. */
    verticalFov(width, height) {
      return 2 * Math.atan((height / 2) / this.intrinsics(width, height).f);
    }

    /**
     * Process one camera frame.
     * @param {Object} frame
     * @param {{key:string, corners:{x:number,y:number}[]}[]} frame.markers - detections already mapped to field keys
     * @param {number} frame.width, frame.height - size of the image the corners refer to
     * @param {Object} frame.field - { widthMeters, lengthMeters }
     * @param {number} frame.time - milliseconds (monotonic)
     * @param {number[]|null} [frame.deviceRotation] - device -> earth rotation from the orientation sensor
     */
    update(frame) {
      const time = frame.time;
      const K = this.intrinsics(frame.width, frame.height);
      const obs = this._buildObservations(frame, K);
      this._frameMaxDim = Math.max(frame.width, frame.height);

      const locked = this.isLocked && !!this.pose;
      if (!locked) {
        const W = (frame.field && frame.field.widthMeters) || 40;
        const L = (frame.field && frame.field.lengthMeters) || 20;
        const fieldKey = `${W}x${L}`;
        if (this.cal.aspectFor && this.cal.aspectFor !== fieldKey) {
          this.cal.aspect = [];
          this.cal.measuredAspect = null;
          this.cal.focalFit = [];
          if (this.cal.focal.length < 20) this.cal.focalRatio = null;
        }
        this.cal.aspectFor = fieldKey;
        if (this.autoFov) this._calibrate(obs, frame);
      }

      // 1. Predict: carry the pose along with the rotation reported by the orientation sensor
      const G = this._gyroDelta(frame.deviceRotation || null);
      if (G) {
        for (const s of [this.pose, this.raw]) {
          if (!s) continue;
          s.R = orthonormalize(mul(G, s.R));
          s.t = mulVec(G, s.t);
        }
      }

      if (locked) {
        return this._result('locked', obs.length, K);
      }

      // 2. Measure
      if (obs.length > 0) {
        const recent = this.raw && time - this._lastSolveTime < 700;
        const solved = this._solve(obs, K.f, recent ? this.raw : null);
        if (solved) {
          // A sudden large turn must persist for a few frames before it is believed
          if (recent && rotAngle(solved.R, this.raw.R) > 25 * DEG && this._jumps < 3) {
            this._jumps++;
            return this._result('holding', obs.length, K);
          }
          this._jumps = 0;

          this._learn(obs, solved);
          this._checkGyro(solved.R, frame.deviceRotation || null, time);

          let ax = 0, ay = 0;
          for (const o of obs) { ax += o.c[0]; ay += o.c[1]; }
          this._smooth(solved, [ax / obs.length, ay / obs.length, obs[0].c[2]], K.f, time);

          this.raw = { R: solved.R, t: solved.t };
          this._lastSolveTime = time;
          this._lastInfo = { rmsPx: solved.rms, keys: obs.map(o => o.key) };
          return this._result('tracking', obs.length, K);
        }
      }

      // 3. Nothing usable in this frame: hold for a while, then give up
      const limit = this.gyroActive && G ? this.gyroHoldMs : this.holdMs;
      if (this.pose && time - this._lastSolveTime <= limit) {
        return this._result('holding', obs.length, K);
      }
      this._dropTracking();
      return this._result('lost', obs.length, K);
    }

    _result(status, markerCount, K) {
      const info = this._lastInfo || {};
      return {
        status,
        markerCount,
        pose: this.pose ? { R: this.pose.R.slice(), t: this.pose.t.slice() } : null,
        camera: this.pose ? ArUcoFieldTracker.toFieldCamera(this.pose) : null,
        rmsPx: status === 'tracking' ? info.rmsPx : null,
        keys: status === 'tracking' ? info.keys : [],
        gyro: this.gyroActive,
        intrinsics: K,
        fovDegrees: this.effectiveFovDegrees,
        // Width : length of the rectangle the markers really form (null until measured)
        measuredAspect: this.cal.measuredAspect
      };
    }

    /**
     * Picks the focal length to use from the measurements collected so far. Preferred: the ones that do
     * not depend on the field's proportions (cal.focal). Otherwise: the ones from fitting the focal
     * length together with the pose (cal.focalFit), which assume the proportions in the app are right.
     */
    _updateFocal() {
      const cal = this.cal;
      const src = cal.focal.length >= 20 ? cal.focal : (cal.focalFit.length >= 15 ? cal.focalFit : null);
      if (!src) return;
      const a = src.slice().sort((x, y) => x - y);
      const m = a[a.length >> 1];
      // Small changes are not worth a visible jump of the overlay
      if (!cal.focalRatio || Math.abs(m / cal.focalRatio - 1) > 0.015) cal.focalRatio = m;
    }

    /**
     * Second way to measure the focal length: let it vary in the fit of one frame. Works when the camera
     * looks straight along the field too, but takes the field's proportions in the app for granted.
     */
    _sampleFocalFit(chosen, obs, f, model) {
      const cal = this.cal;
      if (!this.autoFov || obs.length < 4 || cal.focal.length >= 20) return;
      if ((this._fitTick = (this._fitTick || 0) + 1) % 3 !== 0 && cal.focalFit.length >= 15) return;

      // Perspective must be visible: markers at clearly different distances
      let zMin = Infinity, zMax = 0;
      for (const o of obs) {
        const z = chosen.R[6] * o.c[0] + chosen.R[7] * o.c[1] + chosen.R[8] * o.c[2] + chosen.t[2];
        zMin = Math.min(zMin, z); zMax = Math.max(zMax, z);
      }
      if (!(zMin > 0) || zMax / zMin < 1.3) return;

      const fit = refine(chosen, obs, f, true, Object.assign({}, model, { freeFocal: true }), 15);
      if (!fit || !(fit.rms < 2) || !(fit.rms < chosen.rms)) return;
      const ratio = fit.fs * f / this._frameMaxDim;
      const fov = 2 * Math.atan(0.5 / ratio) / DEG;
      if (fov < 35 || fov > 100) return;
      cal.focalFit.push(ratio);
      if (cal.focalFit.length > 90) cal.focalFit.shift();
      this._updateFocal();
    }

    /**
     * Measures two things from the marker CENTERS alone (5 or more needed), independent of the pose solver:
     *  - the camera focal length, so the field-of-view setting does not have to be right;
     *  - the width : length proportion of the rectangle the markers form, to detect a field whose shape
     *    in the app does not match the markers on the ground.
     * All marker centers lie in one plane (the ground, or pedestal height), so they map to the image by a
     * homography H = K [r1 r2 t] diag(a, b, 1), where a, b are how much the real layout is stretched
     * relative to the field in the app. r1 and r2 are perpendicular (gives the focal length, whatever a
     * and b are) and equally long (gives a / b once the focal length is known).
     */
    _calibrate(obs, frame) {
      if (obs.length < 5) return;
      const W = (frame.field && frame.field.widthMeters) || 40;
      const L = (frame.field && frame.field.lengthMeters) || 20;
      const s = Math.max(frame.width, frame.height) / 2;
      const cx = frame.width / 2, cy = frame.height / 2;
      const ms = 2 / Math.max(W, L);

      const N = [], g = new Array(8).fill(0);
      for (let i = 0; i < 8; i++) N.push(new Array(8).fill(0));
      const rowsOf = (o) => {
        const X = o.c[0] * ms, Y = o.c[1] * ms, u = (o.px[0] - cx) / s, v = (o.px[1] - cy) / s;
        return [[[X, Y, 1, 0, 0, 0, -u * X, -u * Y], u], [[0, 0, 0, X, Y, 1, -v * X, -v * Y], v]];
      };
      for (const o of obs) {
        for (const [row, rhs] of rowsOf(o)) {
          for (let a = 0; a < 8; a++) {
            g[a] += row[a] * rhs;
            for (let b = 0; b < 8; b++) N[a][b] += row[a] * row[b];
          }
        }
      }
      const h = solveLinear(N, g);
      if (!h) return;

      // The centers must really behave like points of one plane
      let sum = 0;
      for (const o of obs) {
        const X = o.c[0] * ms, Y = o.c[1] * ms, w = h[6] * X + h[7] * Y + 1;
        if (!(w > 1e-9)) return;
        const du = (h[0] * X + h[1] * Y + h[2]) / w - (o.px[0] - cx) / s;
        const dv = (h[3] * X + h[4] * Y + h[5]) / w - (o.px[1] - cy) / s;
        sum += du * du + dv * dv;
      }
      if (Math.sqrt(sum / obs.length) * s > 3) return;

      const cal = this.cal;
      const median = (arr) => { const a = arr.slice().sort((x, y) => x - y); return a[a.length >> 1]; };

      // Focal length from "r1 and r2 are perpendicular" (in units of the longer image side). It does not
      // depend on the field's proportions being right, but it only works in views where both field
      // directions converge clearly in the image; otherwise it is a division of two tiny numbers.
      const n1 = Math.hypot(h[0], h[3]), n2 = Math.hypot(h[1], h[4]);
      if (Math.abs(h[6]) > 0.06 * n1 && Math.abs(h[7]) > 0.06 * n2) {
        const f2 = -(h[0] * h[1] + h[3] * h[4]) / (h[6] * h[7]);
        const fov = f2 > 0 ? 2 * Math.atan(1 / Math.sqrt(f2)) / DEG : 0;
        if (fov >= 35 && fov <= 100) {
          cal.focal.push(Math.sqrt(f2) / 2);
          if (cal.focal.length > 150) cal.focal.shift();
          this._updateFocal();
        }
      }

      // Shape of the marker rectangle. Needs a focal length: the one measured above if there is one
      // (it is independent of the shape), else the one in use.
      const fn = cal.focal.length >= 20
        ? 2 * median(cal.focal)
        : 1 / Math.tan(this.effectiveFovDegrees * DEG / 2);
      const q1 = h[0] * h[0] + h[3] * h[3] + fn * fn * h[6] * h[6];
      const q2 = h[1] * h[1] + h[4] * h[4] + fn * fn * h[7] * h[7];
      if (q1 > 0 && q2 > 0) {
        const key = `${W}x${L}`;
        if (cal.aspectFor !== key) {
          cal.aspectFor = key;
          cal.aspect = [];
          cal.measuredAspect = null;
          cal.focalFit = [];
          if (cal.focal.length < 20) cal.focalRatio = null;
        }
        cal.aspect.push(Math.sqrt(q1 / q2) * W / L);
        if (cal.aspect.length > 60) cal.aspect.shift();
        if (cal.aspect.length >= 10) cal.measuredAspect = median(cal.aspect);
      }
    }

    _buildObservations(frame, K) {
      const layout = markerLayout(frame.field);
      const upright = this._upright;
      const byKey = new Map();
      for (const m of frame.markers || []) {
        if (!m || !layout[m.key] || !m.corners || m.corners.length !== 4) continue;
        let side = 0;
        for (let i = 0; i < 4; i++) {
          const a = m.corners[i], b = m.corners[(i + 1) % 4];
          side += Math.hypot(b.x - a.x, b.y - a.y) / 4;
        }
        if (!(side >= this.minMarkerSidePx)) continue;
        const prev = byKey.get(m.key);
        if (prev && prev.side >= side) continue; // same ID twice: keep the bigger one
        const g = layout[m.key];
        const learned = this.map.yaw[m.key];
        // True image of the marker center: where its diagonals cross (the mean of the corners is not)
        const c = m.corners;
        const d1x = c[2].x - c[0].x, d1y = c[2].y - c[0].y, d2x = c[3].x - c[1].x, d2y = c[3].y - c[1].y;
        const den = d1x * d2y - d1y * d2x;
        const tt = Math.abs(den) > 1e-9 ? ((c[1].x - c[0].x) * d2y - (c[1].y - c[0].y) * d2x) / den : 0.5;
        byKey.set(m.key, {
          key: m.key,
          px: [c[0].x + tt * d1x, c[0].y + tt * d1y],
          c: [g[0], g[1], upright ? this.markerHeightMeters : 0],
          side,
          img: m.corners.map(p => [(p.x - K.cx) / K.f, (p.y - K.cy) / K.f]),
          // Until measured: a flat marker has its top toward north, an upright one faces the field center
          yaw: learned !== undefined ? learned : (upright ? Math.atan2(-g[1], -g[0]) : 0)
        });
      }
      return Array.from(byKey.values()).sort((a, b) => b.side - a.side);
    }

    // --- Pose from the markers of one frame ---
    _solve(obs, f, ref) {
      const multi = obs.length >= 2;
      const size0 = this.map.size || this.markerSizeMeters;

      for (let k = 0; k < obs.length; k++) {
        obs[k].ippe = k < 4 ? ippeSquare(size0 / 2, obs[k].img) : [];
      }

      const seeds = [];
      if (ref) seeds.push({ R: ref.R, t: ref.t, yaws: obs.map(o => o.yaw), size: size0 });

      const upright = this._upright;
      // Upright markers seen head-on say little about the camera's pitch, i.e. its height above the
      // ground. A person holds the camera at about eye level: lean on that where the image is vague.
      const model = upright
        ? { upright: true, camHeight: this.cameraHeightMeters, camWeight: this.cameraHeightWeight }
        : { upright: false, camWeight: 0 };
      {
        // From the biggest marker alone: its remembered (or default) orientation fixes the heading of the
        // field. With one marker this is all there is; with more it is just one more start.
        const o = obs[0];
        const Mt = transpose(markerToGround(upright, o.yaw));
        for (const sol of o.ippe) {
          const R = mul(sol.R, Mt);
          const Rc = mulVec(R, o.c);
          seeds.push({
            R, t: [sol.t[0] - Rc[0], sol.t[1] - Rc[1], sol.t[2] - Rc[2]],
            yaws: obs.map(ob => ob.yaw), size: size0
          });
        }
      }
      if (multi) {
        // Several markers: the direction between two marker centers fixes the heading, so the turn of
        // the individual markers is not needed
        const a = obs[0];
        let b = null, far = -1;
        for (let k = 1; k < obs.length; k++) {
          const d = Math.hypot(obs[k].c[0] - a.c[0], obs[k].c[1] - a.c[1]);
          if (obs[k].ippe.length && d > far) { far = d; b = obs[k]; }
        }
        if (b && a.ippe.length) {
          for (const sa of a.ippe) seeds.push(this._pairSeed(a, sa, b, b.ippe[0].t, obs, size0));
          for (const sb of b.ippe) seeds.push(this._pairSeed(b, sb, a, a.ippe[0].t, obs, size0));
        }
      }

      const cands = [];
      for (const seed of seeds) {
        if (!seed) continue;
        const fit = refine(seed, obs, f, multi, model);
        if (!fit) continue;
        // The camera has to be above the ground
        if (!(-(fit.R[2] * fit.t[0] + fit.R[5] * fit.t[1] + fit.R[8] * fit.t[2]) > 0)) continue;
        cands.push(fit);
      }
      if (!cands.length) return null;

      let best = cands[0];
      for (const c of cands) if (c.cost < best.cost) best = c;

      // Candidates that explain the image about as well as the best one
      const tol = best.cost * 1.5 + 0.25 * obs.length * 4;
      let plausible = cands.filter(c => c.cost <= tol);
      if (plausible.length > 1) {
        // World "up" has to point up in the image (R[5] is its image-y component): rules out the tilt flip
        const upMin = Math.min.apply(null, plausible.map(c => c.R[5]));
        plausible = plausible.filter(c => c.R[5] <= upMin + 0.35);
      }
      let chosen = plausible[0];
      for (const c of plausible) {
        if (ref ? rotAngle(c.R, ref.R) < rotAngle(chosen.R, ref.R) : c.cost < chosen.cost) chosen = c;
      }
      if (this._frameMaxDim) this._sampleFocalFit(chosen, obs, f, model);
      return chosen;
    }

    /** Starting pose from the "up" direction marker a shows and the direction from marker a to marker b. */
    _pairSeed(a, sa, b, tb, obs, size0) {
      // Which marker axis points up: the face normal for a flat marker, the top edge for an upright one.
      // The other one (right edge / face normal) is horizontal and gives the marker's angle.
      const upright = this._upright;
      const u = upright ? 1 : 2, hz = upright ? 2 : 0;
      const n = [sa.R[u], sa.R[3 + u], sa.R[6 + u]];
      const d = [tb[0] - sa.t[0], tb[1] - sa.t[1], tb[2] - sa.t[2]];
      const dn = dot(d, n);
      const dp = [d[0] - dn * n[0], d[1] - dn * n[1], d[2] - dn * n[2]];
      const len = Math.hypot(dp[0], dp[1], dp[2]);
      const mx = b.c[0] - a.c[0], my = b.c[1] - a.c[1];
      const ml = Math.hypot(mx, my);
      if (!(len > 1e-9) || !(ml > 1e-9)) return null;

      const e1 = [dp[0] / len, dp[1] / len, dp[2] / len];
      const e2 = cross(n, e1);
      const m1 = [mx / ml, my / ml], m2 = [-my / ml, mx / ml];
      // R maps ground axes (m1, m2, up) onto camera axes (e1, e2, n)
      const R = orthonormalize([
        e1[0] * m1[0] + e2[0] * m2[0], e1[0] * m1[1] + e2[0] * m2[1], n[0],
        e1[1] * m1[0] + e2[1] * m2[0], e1[1] * m1[1] + e2[1] * m2[1], n[1],
        e1[2] * m1[0] + e2[2] * m2[0], e1[2] * m1[1] + e2[2] * m2[1], n[2]
      ]);
      // If the real marker size differs from the assumed one all distances are off by the same factor
      const rho = ml / len;
      const Rc = mulVec(R, a.c);
      const t = [rho * sa.t[0] - Rc[0], rho * sa.t[1] - Rc[1], rho * sa.t[2] - Rc[2]];

      // Angle of each marker, read off its own pose
      const yaws = obs.map(o => {
        let pick = null, align = -Infinity;
        for (const s of o.ippe) {
          const al = s.R[u] * n[0] + s.R[3 + u] * n[1] + s.R[6 + u] * n[2];
          if (al > align) { align = al; pick = s; }
        }
        if (!pick) return o.yaw;
        const v = tMulVec(R, [pick.R[hz], pick.R[3 + hz], pick.R[6 + hz]]);
        return Math.atan2(v[1], v[0]);
      });
      return { R, t, yaws, size: size0 * rho };
    }

    /** Remember how each marker is turned and how big the markers really are. */
    _learn(obs, solved) {
      if (obs.length < 2 || !(solved.rms < 4)) return;
      const map = this.map;
      for (let k = 0; k < obs.length; k++) {
        const key = obs[k].key;
        const cnt = map.yawCount[key] || 0;
        const a = Math.max(0.05, 1 / (cnt + 1));
        const old = cnt ? map.yaw[key] : solved.yaws[k];
        let diff = solved.yaws[k] - old;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        map.yaw[key] = old + a * diff;
        map.yawCount[key] = cnt + 1;
      }
      const a = Math.max(0.03, 1 / (map.sizeCount + 1));
      map.size = map.sizeCount ? map.size * Math.pow(solved.size / map.size, a) : solved.size;
      map.sizeCount++;
    }

    // --- Smoothing ---
    /**
     * Rotation and the camera-space position of the visible markers' centroid are filtered separately and
     * the translation is rebuilt from them, so smoothing never drags the course off the markers in view.
     */
    _smooth(meas, anchor, f, time) {
      const dtMs = time - this._lastSolveTime;
      if (!this.pose || dtMs > 500) {
        this.pose = { R: meas.R.slice(), t: meas.t.slice() };
        return;
      }
      const dt = Math.max(0.005, Math.min(0.25, dtMs / 1000));
      const P = this.pose;
      const rp = mulVec(P.R, anchor), rm = mulVec(meas.R, anchor);
      const aP = [rp[0] + P.t[0], rp[1] + P.t[1], rp[2] + P.t[2]];
      const aM = [rm[0] + meas.t[0], rm[1] + meas.t[1], rm[2] + meas.t[2]];

      const angDeg = rotAngle(P.R, meas.R) / DEG;
      const zP = Math.max(1e-6, aP[2]), zM = Math.max(1e-6, aM[2]);
      const px = f * Math.hypot(aM[0] / zM - aP[0] / zP, aM[1] / zM - aP[1] / zP)
        + 0.25 * f * Math.abs(zM - zP) / zM;

      const alpha = (cutoff) => 1 - Math.exp(-2 * Math.PI * cutoff * dt);
      const aR = alpha(this.rotMinCutoff + this.rotBeta * angDeg / dt);
      const aT = alpha(this.posMinCutoff + this.posBeta * px / dt);

      const R = slerp(P.R, meas.R, aR);
      const a = [aP[0] + (aM[0] - aP[0]) * aT, aP[1] + (aM[1] - aP[1]) * aT, aP[2] + (aM[2] - aP[2]) * aT];
      const ra = mulVec(R, anchor);
      this.pose = { R, t: [a[0] - ra[0], a[1] - ra[1], a[2] - ra[2]] };
    }

    // --- Orientation sensor ---
    /** Camera rotation since the previous frame according to the sensor (null until it is verified). */
    _gyroDelta(Rd) {
      const g = this._gyro;
      const prev = g.prev;
      g.prev = Rd;
      if (!Rd || !prev || g.mount < 0) return null;
      return cameraDelta(CAMERA_MOUNTS[g.mount], prev, Rd);
    }

    /**
     * Compares how the camera turned according to the markers with what the sensor says for each possible
     * camera mount. The sensor is only used once one mount keeps agreeing with the markers.
     */
    _checkGyro(R, Rd, time) {
      const g = this._gyro;
      if (!Rd) { g.ref = null; return; }
      if (!g.ref || time - g.ref.time > 1500) { g.ref = { R, Rd, time }; return; }

      const V = mul(R, transpose(g.ref.R));
      const ang = Math.acos(Math.max(-1, Math.min(1, (V[0] + V[4] + V[8] - 1) / 2)));
      if (ang < 4 * DEG) return; // not enough motion yet to tell anything

      const tol = Math.max(2.5 * DEG, 0.35 * ang);
      for (let i = 0; i < CAMERA_MOUNTS.length; i++) {
        const agrees = rotAngle(V, cameraDelta(CAMERA_MOUNTS[i], g.ref.Rd, Rd)) < tol;
        g.scores[i] = Math.max(-5, Math.min(20, g.scores[i] + (agrees ? 1 : -1)));
      }
      g.ref = { R, Rd, time };

      let best = 0, second = -Infinity;
      for (let i = 1; i < g.scores.length; i++) if (g.scores[i] > g.scores[best]) best = i;
      for (let i = 0; i < g.scores.length; i++) if (i !== best) second = Math.max(second, g.scores[i]);
      if (g.scores[best] >= 6 && g.scores[best] - second >= 3) g.mount = best;
      else if (g.mount >= 0 && g.scores[g.mount] < 2) g.mount = -1;
    }

    // --- Output helpers ---
    /**
     * Where the camera is in the field (Babylon) frame.
     * `axes` holds the camera's right / up / forward directions as rows, i.e. the 3x3 rotation block of a
     * Babylon world matrix; `position` is the camera position.
     */
    static toFieldCamera(pose) {
      const R = pose.R, t = pose.t;
      const C = tMulVec(R, [-t[0], -t[1], -t[2]]); // camera center on the ground frame
      return {
        position: [C[0], C[2], C[1]],
        axes: [
          R[0], R[2], R[1],
          -R[3], -R[5], -R[4],
          R[6], R[8], R[7]
        ]
      };
    }

    /** Pixel position of a field-frame point (x east, y up, z north); null if behind the camera. */
    static projectFieldPoint(pose, K, x, y, z) {
      const R = pose.R, t = pose.t;
      const pz = R[6] * x + R[7] * z + R[8] * y + t[2];
      if (!(pz > 1e-6)) return null;
      return {
        x: K.cx + K.f * (R[0] * x + R[1] * z + R[2] * y + t[0]) / pz,
        y: K.cy + K.f * (R[3] * x + R[4] * z + R[5] * y + t[1]) / pz
      };
    }
  }

  const api = {
    ArUcoFieldTracker,
    DeviceRotationSensor,
    markerLayout,
    ippeSquare,
    deviceRotationMatrix,
    CAMERA_MOUNTS,
    CORNER_SIGNS,
    math: { mul, mulVec, tMulVec, transpose, expSO3, rotAngle, orthonormalize, slerp }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof window !== 'undefined') {
    window.ArUcoPose = api;
    window.ArUcoFieldTracker = ArUcoFieldTracker;
    window.arucoFieldTracker = new ArUcoFieldTracker();
    window.arucoDeviceRotation = new DeviceRotationSensor();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
