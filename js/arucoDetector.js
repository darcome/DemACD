/**
 * Agility Course Designer - ArUco 4x4 Marker Detector
 * Real-time OpenCV.js 4.x WebAssembly computer vision detector.
 */

// Global detector instance
var detector = null;

/**
 * Class to detect 4x4 ArUco markers in real-time over a camera feed using OpenCV.js.
 */
class Aruco4x4Detector {
  /**
   * @param {HTMLVideoElement} videoElement - Video element receiving camera input.
   * @param {HTMLCanvasElement} canvasElement - Canvas element for rendering output.
   * @param {Object} [options]
   * @param {number} [options.dictType=cv.DICT_4X4_50] - Predefined ArUco 4x4 dictionary.
   * @param {Function} [options.onDetect] - Callback per frame with detected markers.
   */
  constructor(videoElement, canvasElement, options = {}) {
    if (typeof cv === 'undefined' || !cv.Mat) {
      throw new Error('OpenCV.js runtime is not loaded yet.');
    }

    this.video = videoElement;
    this.canvas = canvasElement;
    this.onDetect = options.onDetect || null;

    // Set 4x4 Dictionary
    const dictId = options.dictType !== undefined ? options.dictType : (cv.DICT_4X4_50 ?? 0);
    const getDictFn = cv.getPredefinedDictionary || cv.aruco_getPredefinedDictionary;
    this.dictionary = getDictFn ? getDictFn(dictId) : null;

    // ArUco Parameters
    const DetectorParamsClass = cv.aruco_DetectorParameters || cv.DetectorParameters;
    this.detectorParams = DetectorParamsClass ? new DetectorParamsClass() : null;

    const RefineParamsClass = cv.aruco_RefineParameters || cv.RefineParameters;
    this.refineParams = RefineParamsClass ? new RefineParamsClass(10.0, 3.0, true) : null;

    // Initialize Detector
    const ArucoDetectorClass = cv.ArucoDetector || cv.aruco_ArucoDetector;
    if (ArucoDetectorClass && this.dictionary && this.detectorParams) {
      if (this.refineParams) {
        this.detector = new ArucoDetectorClass(this.dictionary, this.detectorParams, this.refineParams);
      } else {
        this.detector = new ArucoDetectorClass(this.dictionary, this.detectorParams);
      }
    } else {
      this.detector = null;
    }

    this.cap = null;
    this.src = null;
    this.rgb = null;
    this.gray = null;
    this.corners = new cv.MatVector();
    this.ids = new cv.Mat();
    this.rejected = new cv.MatVector();

    this.isRunning = false;
    this.animationFrameId = null;
  }

  /**
   * Starts camera stream and detection loop.
   */
  async start(constraints = { video: { width: 640, height: 480 } }) {
    if (this.isRunning) return;

    if (!this.video.srcObject) {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.video.srcObject = stream;
    }

    await new Promise((resolve) => {
      if (this.video.readyState >= 2 && this.video.videoWidth > 0) {
        this.video.play();
        resolve();
      } else {
        this.video.onplaying = () => resolve();
        this.video.play();
      }
    });

    const width = this.video.videoWidth;
    const height = this.video.videoHeight;
    this.video.width = width;
    this.video.height = height;
    this.canvas.width = width;
    this.canvas.height = height;

    this.cap = new cv.VideoCapture(this.video);
    if (this.src) this.src.delete();
    if (this.rgb) this.rgb.delete();
    if (this.gray) this.gray.delete();

    this.src = new cv.Mat(height, width, cv.CV_8UC4);
    this.rgb = new cv.Mat(height, width, cv.CV_8UC3);
    this.gray = new cv.Mat(height, width, cv.CV_8UC1);

    this.isRunning = true;
    this._loop();
  }

  _loop = () => {
    if (!this.isRunning) return;
    this.processFrame();
    this.animationFrameId = requestAnimationFrame(this._loop);
  };

  /**
   * Captures a single frame, processes markers, and updates canvas.
   */
  processFrame() {
    if (!this.isRunning || this.video.readyState < 2) return;

    try {
      const vWidth = this.video.videoWidth;
      const vHeight = this.video.videoHeight;
      if (vWidth === 0 || vHeight === 0) return;

      if (this.src.cols !== vWidth || this.src.rows !== vHeight) {
        this.src.delete();
        this.rgb.delete();
        this.gray.delete();
        this.video.width = vWidth;
        this.video.height = vHeight;
        this.canvas.width = vWidth;
        this.canvas.height = vHeight;
        this.src = new cv.Mat(vHeight, vWidth, cv.CV_8UC4);
        this.rgb = new cv.Mat(vHeight, vWidth, cv.CV_8UC3);
        this.gray = new cv.Mat(vHeight, vWidth, cv.CV_8UC1);
      }

      this.cap.read(this.src);
      cv.cvtColor(this.src, this.rgb, cv.COLOR_RGBA2RGB);
      cv.cvtColor(this.src, this.gray, cv.COLOR_RGBA2GRAY);

      // Detection step
      if (this.detector && typeof this.detector.detectMarkers === 'function') {
        this.detector.detectMarkers(this.gray, this.corners, this.ids, this.rejected);
      } else {
        const detectFn = cv.detectMarkers || cv.aruco_detectMarkers;
        if (!detectFn) {
          throw new Error('ArUco detection functions are not available in this OpenCV build.');
        }
        detectFn(this.gray, this.dictionary, this.corners, this.ids, this.detectorParams, this.rejected);
      }

      const detectedMarkers = [];

      if (this.ids.rows > 0) {
        const drawFn = cv.drawDetectedMarkers || cv.aruco_drawDetectedMarkers;
        if (drawFn) {
          drawFn(this.rgb, this.corners, this.ids);
        }

        for (let i = 0; i < this.ids.rows; ++i) {
          const id = this.ids.data32S[i];
          const cornerMat = this.corners.get(i);
          const points = [];

          for (let j = 0; j < 4; j++) {
            points.push({
              x: cornerMat.data32F[j * 2],
              y: cornerMat.data32F[j * 2 + 1]
            });
          }

          // Calculate true center
          const center = {
            x: (points[0].x + points[1].x + points[2].x + points[3].x) / 4,
            y: (points[0].y + points[1].y + points[2].y + points[3].y) / 4
          };

          detectedMarkers.push({ id, corners: points, center });
          cornerMat.delete();
        }
      }

      cv.imshow(this.canvas, this.rgb);

      if (this.onDetect && detectedMarkers.length > 0) {
        this.onDetect(detectedMarkers);
      }
    } catch (err) {
      const errorMsg = (typeof cv.exceptionFromPtr === 'function' && typeof err === 'number')
        ? cv.exceptionFromPtr(err).msg
        : (err.message || err);
      console.error('ArUco Detection error:', errorMsg);
    }
  }

  /**
   * Stops the camera feed and rendering loop without destroying OpenCV structures.
   */
  stop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.video.srcObject) {
      const tracks = this.video.srcObject.getTracks();
      tracks.forEach((track) => track.stop());
      this.video.srcObject = null;
    }

    // Clean frame matrices only
    if (this.src) { this.src.delete(); this.src = null; }
    if (this.rgb) { this.rgb.delete(); this.rgb = null; }
    if (this.gray) { this.gray.delete(); this.gray = null; }
  }

  /**
   * Fully releases all WebAssembly C++ memory handles when closing or unloading.
   */
  destroy() {
    this.stop();

    if (this.corners) { this.corners.delete(); this.corners = null; }
    if (this.ids) { this.ids.delete(); this.ids = null; }
    if (this.rejected) { this.rejected.delete(); this.rejected = null; }
    if (this.detector) { this.detector.delete(); this.detector = null; }
    if (this.detectorParams) { this.detectorParams.delete(); this.detectorParams = null; }
    if (this.refineParams) { this.refineParams.delete(); this.refineParams = null; }
    if (this.dictionary) { this.dictionary.delete(); this.dictionary = null; }
  }
}

/**
 * Robust initializer that ensures DOM and OpenCV WebAssembly runtime are both ready.
 */
function setupArucoDetector() {
  if (window._arucoDetectorInitialized) return true;

  if (typeof cv === 'undefined' || !cv.Mat) {
    return false;
  }

  const video = document.getElementById('webcam');
  const canvas = document.getElementById('outputCanvas');
  if (!video || !canvas) {
    return false;
  }

  try {
    const dictId = (typeof cv.DICT_4X4_50 !== 'undefined') ? cv.DICT_4X4_50 : 0;

    detector = new Aruco4x4Detector(video, canvas, {
      dictType: dictId,
      onDetect: (markers) => {
        markers.forEach((m) => {
          // console.log(`Detected Marker ID: ${m.id} Center:`, m.center);
        });
        if (window.arucoTracker) {
          window.arucoTracker.handleDetections(markers);
        }
      }
    });

    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');

    if (startBtn) {
      startBtn.disabled = false;
      startBtn.onclick = () => {
        if (window.arucoTracker) {
          window.arucoTracker.startCamera();
        } else {
          detector.start({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
        }
      };
    }

    if (stopBtn) {
      stopBtn.onclick = () => {
        detector.stop();
        if (window.arucoTracker) {
          window.arucoTracker.onCameraStopped();
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

    console.log('[ArUco] OpenCV 4.x runtime and Aruco4x4Detector initialized successfully.');
    return true;
  } catch (err) {
    console.error('[ArUco] setupArucoDetector error:', err);
    const statusBadge = document.getElementById('aruco-status-badge');
    if (statusBadge) {
      statusBadge.className = 'aruco-status-badge loading';
      statusBadge.innerHTML = `<span class="aruco-status-dot"></span> OpenCV Init Error`;
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
window.Aruco4x4Detector = Aruco4x4Detector;

// Auto-check on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  setupArucoDetector();
});

// Periodic failsafe check (handles fast cache / async WebAssembly load on iOS Safari)
(function() {
  let attempts = 0;
  const interval = setInterval(() => {
    attempts++;
    if (setupArucoDetector() || attempts > 60) {
      clearInterval(interval);
    }
  }, 250);
})();
