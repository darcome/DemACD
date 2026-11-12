/**
 * Agility Course Designer - ArUco camera detector
 *
 * Owns the camera stream and the per-frame loop of the ArUco tab:
 *   grab a video frame -> draw it on the output canvas -> detect 4x4 ArUco markers with OpenCV.js ->
 *   hand the detections to `onFrame` (which positions and renders the 3D course) -> outline the markers.
 *
 * The frame that is shown is always the frame that was analyzed, and the 3D overlay is rendered in the same
 * tick, so video and overlay never run out of step with each other.
 */

// Global detector instance
var detector = null;

class ArucoCameraDetector {
  /**
   * @param {HTMLVideoElement} video - receives the camera stream (kept hidden)
   * @param {HTMLCanvasElement} canvas - shows the analyzed frames
   * @param {Object} [options]
   * @param {Function} [options.onFrame] - called per frame with { markers, width, height, time }
   * @param {Function} [options.onResize] - called with (width, height) when the video size is known/changes
   */
  constructor(video, canvas, options = {}) {
    if (typeof cv === 'undefined' || !cv.Mat) {
      throw new Error('OpenCV.js runtime is not loaded yet.');
    }
    this.video = video;
    this.canvas = canvas;
    this.onFrame = options.onFrame || null;
    this.onResize = options.onResize || null;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });

    this._initOpenCv();

    this.rgba = null;
    this.gray = null;
    this.width = 0;
    this.height = 0;
    this.isRunning = false;
    this._raf = null;
    this._ownsStream = false;
    this._lastErrorLog = 0;

    // Keep the stage (video + 3D overlay) at exactly the video's aspect ratio inside its wrapper
    this.stage = document.getElementById('aruco-canvas-stage');
    this.wrapper = this.stage ? this.stage.parentElement : null;
    this._fitStage = this._fitStage.bind(this);
    if (this.wrapper && typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(this._fitStage).observe(this.wrapper);
    }
    window.addEventListener('resize', this._fitStage);
  }

  _initOpenCv() {
    const getDict = cv.getPredefinedDictionary || cv.aruco_getPredefinedDictionary;
    const Params = cv.aruco_DetectorParameters || cv.DetectorParameters;
    const Refine = cv.aruco_RefineParameters || cv.RefineParameters;
    const Detector = cv.aruco_ArucoDetector || cv.ArucoDetector;
    if (!getDict || !Params) {
      throw new Error('This OpenCV.js build has no ArUco module.');
    }

    this.dictionary = getDict(typeof cv.DICT_4X4_50 !== 'undefined' ? cv.DICT_4X4_50 : 0);
    this.params = new Params();
    // Sub-pixel corners: corner noise is what makes a pose jitter
    this.params.cornerRefinementMethod = typeof cv.CORNER_REFINE_SUBPIX !== 'undefined' ? cv.CORNER_REFINE_SUBPIX : 1;
    this.params.cornerRefinementWinSize = 5;
    this.params.cornerRefinementMaxIterations = 30;
    this.params.cornerRefinementMinAccuracy = 0.05;
    this.params.adaptiveThreshWinSizeMin = 3;
    this.params.adaptiveThreshWinSizeMax = 23;
    this.params.adaptiveThreshWinSizeStep = 10;
    this.params.minMarkerPerimeterRate = 0.02;

    this.refineParams = Refine ? new Refine(10.0, 3.0, true) : null;
    this.arucoDetector = null;
    if (Detector) {
      this.arucoDetector = this.refineParams
        ? new Detector(this.dictionary, this.params, this.refineParams)
        : new Detector(this.dictionary, this.params);
    } else if (!(cv.detectMarkers || cv.aruco_detectMarkers)) {
      throw new Error('This OpenCV.js build has no ArUco detection function.');
    }

    this.corners = new cv.MatVector();
    this.ids = new cv.Mat();
    this.rejected = new cv.MatVector();
  }

  /**
   * Starts the camera and the detection loop.
   * @param {MediaStreamConstraints|{stream: MediaStream}} [source] - getUserMedia constraints, or an
   *        existing stream to analyze
   */
  async start(source = { video: { facingMode: { ideal: 'environment' } } }) {
    if (this.isRunning) this.stop();

    if (source && source.stream) {
      this.video.srcObject = source.stream;
      this._ownsStream = false;
    } else {
      this.video.srcObject = await navigator.mediaDevices.getUserMedia(source);
      this._ownsStream = true;
    }

    await new Promise((resolve, reject) => {
      const done = () => { this.video.removeEventListener('loadeddata', done); resolve(); };
      if (this.video.readyState >= 2 && this.video.videoWidth > 0) resolve();
      else this.video.addEventListener('loadeddata', done);
      const p = this.video.play();
      if (p && typeof p.catch === 'function') p.catch(reject);
    });

    this.isRunning = true;
    this._tick();
  }

  /** Stops the loop and the camera; OpenCV objects are kept for the next start. */
  stop() {
    this.isRunning = false;
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
    const stream = this.video.srcObject;
    if (stream) {
      if (this._ownsStream) stream.getTracks().forEach(track => track.stop());
      this.video.srcObject = null;
    }
    this._releaseFrames();
  }

  /** Releases all WebAssembly memory. */
  destroy() {
    this.stop();
    for (const name of ['corners', 'ids', 'rejected', 'arucoDetector', 'params', 'refineParams', 'dictionary']) {
      if (this[name]) { this[name].delete(); this[name] = null; }
    }
  }

  _releaseFrames() {
    if (this.rgba) { this.rgba.delete(); this.rgba = null; }
    if (this.gray) { this.gray.delete(); this.gray = null; }
    this.width = 0;
    this.height = 0;
  }

  _tick = () => {
    if (!this.isRunning) return;
    try {
      this._processFrame();
    } catch (err) {
      const now = performance.now();
      if (now - this._lastErrorLog > 2000) {
        this._lastErrorLog = now;
        const msg = (typeof err === 'number' && typeof cv.exceptionFromPtr === 'function')
          ? cv.exceptionFromPtr(err).msg
          : (err && err.message) || err;
        console.error('[ArUco] Frame processing error:', msg);
      }
    }
    this._raf = requestAnimationFrame(this._tick);
  };

  _processFrame() {
    const video = this.video;
    const w = video.videoWidth, h = video.videoHeight;
    if (video.readyState < 2 || !w || !h) return;

    if (w !== this.width || h !== this.height) {
      // First frame, or the stream changed size (e.g. the phone was rotated)
      this._releaseFrames();
      this.width = w;
      this.height = h;
      this.canvas.width = w;
      this.canvas.height = h;
      this.rgba = new cv.Mat(h, w, cv.CV_8UC4);
      this.gray = new cv.Mat(h, w, cv.CV_8UC1);
      this._fitStage();
      if (this.onResize) this.onResize(w, h);
    }

    // 1. Grab
    const ctx = this.ctx;
    ctx.drawImage(video, 0, 0, w, h);
    this.rgba.data.set(ctx.getImageData(0, 0, w, h).data);
    cv.cvtColor(this.rgba, this.gray, cv.COLOR_RGBA2GRAY);

    // 2. Detect
    if (this.arucoDetector) {
      this.arucoDetector.detectMarkers(this.gray, this.corners, this.ids, this.rejected);
    } else {
      (cv.detectMarkers || cv.aruco_detectMarkers)(this.gray, this.dictionary, this.corners, this.ids, this.params, this.rejected);
    }

    const markers = [];
    for (let i = 0; i < this.ids.rows; i++) {
      const mat = this.corners.get(i);
      const d = mat.data32F;
      const corners = [];
      let cx = 0, cy = 0;
      for (let j = 0; j < 4; j++) {
        corners.push({ x: d[j * 2], y: d[j * 2 + 1] });
        cx += d[j * 2] / 4;
        cy += d[j * 2 + 1] / 4;
      }
      mat.delete();
      markers.push({ id: this.ids.data32S[i], corners, center: { x: cx, y: cy } });
    }

    // 3. Position + render the 3D course for exactly this frame
    if (this.onFrame) {
      this.onFrame({ markers, width: w, height: h, time: performance.now() });
    }

    // 4. Outline what was detected
    this._drawMarkers(markers);
  }

  _drawMarkers(markers) {
    if (!markers.length) return;
    const ctx = this.ctx;
    const lw = Math.max(2, Math.round(this.width / 480));
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.font = `600 ${Math.max(14, Math.round(this.width / 60))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const m of markers) {
      const c = m.corners;
      ctx.beginPath();
      ctx.moveTo(c[0].x, c[0].y);
      for (let j = 1; j < 4; j++) ctx.lineTo(c[j].x, c[j].y);
      ctx.closePath();
      ctx.lineWidth = lw;
      ctx.strokeStyle = '#22e36b';
      ctx.stroke();
      // Marker center = where its diagonals cross. This is the point that is matched to the field.
      const d1x = c[2].x - c[0].x, d1y = c[2].y - c[0].y, d2x = c[3].x - c[1].x, d2y = c[3].y - c[1].y;
      const den = d1x * d2y - d1y * d2x;
      const t = Math.abs(den) > 1e-9 ? ((c[1].x - c[0].x) * d2y - (c[1].y - c[0].y) * d2x) / den : 0.5;
      const mx = c[0].x + t * d1x, my = c[0].y + t * d1y;
      ctx.beginPath();
      ctx.arc(mx, my, lw * 2, 0, 2 * Math.PI);
      ctx.fillStyle = '#ff3b6b';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      // ID next to the marker, so it does not cover the center
      const ty = Math.min(c[0].y, c[1].y, c[2].y, c[3].y) - lw * 5;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.strokeText(String(m.id), mx, ty);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(String(m.id), mx, ty);
    }
    ctx.restore();
  }

  /** Sizes the stage to the largest box of the video's aspect ratio that fits in the wrapper. */
  _fitStage() {
    if (!this.stage || !this.wrapper || !this.width || !this.height) return;
    const availW = this.wrapper.clientWidth, availH = this.wrapper.clientHeight;
    if (!availW || !availH) return;
    const scale = Math.min(availW / this.width, availH / this.height);
    this.stage.style.width = `${Math.max(1, Math.floor(this.width * scale))}px`;
    this.stage.style.height = `${Math.max(1, Math.floor(this.height * scale))}px`;
  }
}

/**
 * Creates the detector once both the DOM and the OpenCV WebAssembly runtime are ready.
 */
function setupArucoDetector() {
  if (window._arucoDetectorInitialized) return true;
  if (typeof cv === 'undefined' || !cv.Mat) return false;

  const video = document.getElementById('webcam');
  const canvas = document.getElementById('outputCanvas');
  if (!video || !canvas) return false;

  try {
    detector = new ArucoCameraDetector(video, canvas, {
      onFrame: (frame) => {
        if (window.arucoTracker) window.arucoTracker.handleDetections(frame.markers);
        if (window.agilityApp && typeof window.agilityApp.onArFrame === 'function') {
          window.agilityApp.onArFrame(frame);
        }
      }
    });

    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');

    if (startBtn) {
      startBtn.disabled = false;
      startBtn.onclick = () => {
        // Must be requested from a user gesture (iOS); harmless elsewhere
        if (window.arucoDeviceRotation) window.arucoDeviceRotation.requestPermission();
        if (window.arucoTracker) {
          window.arucoTracker.startCamera();
        } else {
          detector.start();
        }
      };
    }

    if (stopBtn) {
      stopBtn.onclick = () => {
        detector.stop();
        if (window.arucoTracker) window.arucoTracker.onCameraStopped();
        if (window.agilityApp && typeof window.agilityApp.onArStopped === 'function') {
          window.agilityApp.onArStopped();
        }
      };
    }

    window._arucoDetectorInitialized = true;

    if (window.arucoTracker) {
      window.arucoTracker.onOpenCvInitialized();
    } else {
      const statusBadge = document.getElementById('aruco-status-badge');
      if (statusBadge) {
        statusBadge.className = 'aruco-status-badge ready';
        statusBadge.innerHTML = '<span class="aruco-status-dot"></span> OpenCV Ready';
      }
    }

    console.log('[ArUco] OpenCV runtime and camera detector initialized.');
    return true;
  } catch (err) {
    console.error('[ArUco] setupArucoDetector error:', err);
    const statusBadge = document.getElementById('aruco-status-badge');
    if (statusBadge) {
      statusBadge.className = 'aruco-status-badge loading';
      statusBadge.innerHTML = '<span class="aruco-status-dot"></span> OpenCV Init Error';
      statusBadge.title = err.message || String(err);
    }
    return false;
  }
}

/**
 * OpenCV.js runtime loader hook
 */
function onCvLoaded() {
  window._cvLoadedFired = true;
  if (typeof cv !== 'undefined') {
    if (cv.Mat) {
      setupArucoDetector();
    } else {
      cv['onRuntimeInitialized'] = () => {
        setupArucoDetector();
      };
    }
  }
}

// Expose globally
window.onCvLoaded = onCvLoaded;
window.setupArucoDetector = setupArucoDetector;
window.ArucoCameraDetector = ArucoCameraDetector;

document.addEventListener('DOMContentLoaded', () => {
  setupArucoDetector();
});

// Failsafe polling: covers OpenCV finishing its async WebAssembly start at any point (e.g. iOS Safari)
(function () {
  let attempts = 0;
  const interval = setInterval(() => {
    attempts++;
    if (setupArucoDetector() || attempts > 240) {
      clearInterval(interval);
    }
  }, 250);
})();
