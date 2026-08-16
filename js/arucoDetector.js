/**
 * Agility Course Designer - ArUco 4x4 Field Marker Detector & Tracker
 * Real-time OpenCV.js 4.x WebAssembly computer vision for Dog Agility Ring Boundary & Alignment.
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
    this.dictionary = getDictFn(dictId);

    // ArUco Parameters
    const DetectorParamsClass = cv.aruco_DetectorParameters || cv.DetectorParameters;
    this.detectorParams = new DetectorParamsClass();

    const RefineParamsClass = cv.aruco_RefineParameters || cv.RefineParameters;
    this.refineParams = RefineParamsClass ? new RefineParamsClass(10.0, 3.0, true) : null;

    // Initialize Detector
    const ArucoDetectorClass = cv.ArucoDetector || cv.aruco_ArucoDetector;
    if (ArucoDetectorClass) {
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
 * ArUco Field Marker Tracker UI & State Manager
 * Tracks 8 Dog Agility Field points (4 corners + 4 midpoints)
 * Distinguishes LIVE (active in frame), SEEN (detected previously), and NOT DETECTED.
 */
class ArUcoTrackerUI {
  constructor() {
    // 8 Predefined Agility Field Points
    this.markerDefinitions = [
      { key: 'top_left', defaultId: 0, name: 'Top-Left Corner', type: 'Corner (NW)', role: 'corner', svgPos: { x: 20, y: 20 } },
      { key: 'top_mid', defaultId: 1, name: 'Top Midpoint', type: 'Midpoint (N)', role: 'midpoint', svgPos: { x: 100, y: 20 } },
      { key: 'top_right', defaultId: 2, name: 'Top-Right Corner', type: 'Corner (NE)', role: 'corner', svgPos: { x: 180, y: 20 } },
      { key: 'right_mid', defaultId: 3, name: 'Right Midpoint', type: 'Midpoint (E)', role: 'midpoint', svgPos: { x: 180, y: 55 } },
      { key: 'bottom_right', defaultId: 4, name: 'Bottom-Right Corner', type: 'Corner (SE)', role: 'corner', svgPos: { x: 180, y: 90 } },
      { key: 'bottom_mid', defaultId: 5, name: 'Bottom Midpoint', type: 'Midpoint (S)', role: 'midpoint', svgPos: { x: 100, y: 90 } },
      { key: 'bottom_left', defaultId: 6, name: 'Bottom-Left Corner', type: 'Corner (SW)', role: 'corner', svgPos: { x: 20, y: 90 } },
      { key: 'left_mid', defaultId: 7, name: 'Left Midpoint', type: 'Midpoint (W)', role: 'midpoint', svgPos: { x: 20, y: 55 } }
    ];

    // Marker ID to definition mapping
    this.idMapping = {};
    this.markerDefinitions.forEach(m => {
      this.idMapping[m.key] = m.defaultId;
    });

    // History state per marker key: { status: 'unseen'|'seen'|'live', lastSeenTime: null, lastCenter: null, lastCorners: null }
    this.markerStates = {};
    this.resetStates();

    this.currentCamera = 'environment'; // 'environment' (rear), 'user' (front), or specific deviceId
    this.isOpenCvReady = false;
    this.isStreaming = false;

    this.fpsCounter = 0;
    this.fpsLastTime = performance.now();
    this.currentFps = 0;

    this.tickerInterval = null;
    this.initDOM();
  }

  resetStates() {
    this.markerDefinitions.forEach(m => {
      this.markerStates[m.key] = {
        key: m.key,
        name: m.name,
        type: m.type,
        role: m.role,
        id: this.idMapping[m.key],
        status: 'unseen', // 'unseen', 'seen', 'live'
        lastSeenTime: null,
        lastCenter: null,
        lastCorners: null
      };
    });
  }

  initDOM() {
    this.renderMarkerCards();
    this.renderFieldSvg();
    this.updateMetrics();

    // Start state ticker to handle Live -> Seen transitions and relative time
    if (this.tickerInterval) clearInterval(this.tickerInterval);
    this.tickerInterval = setInterval(() => this.tick(), 250);

    // Setup action buttons
    document.getElementById('btn-aruco-reset')?.addEventListener('click', () => {
      this.resetStates();
      this.updateUI();
    });

    document.getElementById('btn-aruco-export')?.addEventListener('click', () => {
      this.exportMarkerData();
    });

    document.getElementById('btn-aruco-settings')?.addEventListener('click', () => {
      this.showSettingsModal();
    });

    // Flip Camera button (Front <-> Rear)
    document.getElementById('btn-flip-camera')?.addEventListener('click', () => {
      this.flipCamera();
    });

    this.initCameraDevices();
  }

  async initCameraDevices() {
    const select = document.getElementById('aruco-camera-select');
    if (select) {
      select.addEventListener('change', async (e) => {
        this.currentCamera = e.target.value;
        if (detector && detector.isRunning) {
          await this.startCamera(this.currentCamera);
        }
      });
    }

    await this.refreshCameraDevices();
  }

  async refreshCameraDevices() {
    const select = document.getElementById('aruco-camera-select');
    if (!select) return;

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');

      const prevValue = this.currentCamera || select.value || 'environment';

      select.innerHTML = `
        <option value="environment">📷 Rear / Back Camera</option>
        <option value="user">🤳 Front Camera</option>
      `;

      // If we have identified physical devices with labels
      const labeledDevices = videoDevices.filter(d => d.label && d.label.trim().length > 0);
      if (labeledDevices.length > 0) {
        const optGroup = document.createElement('optgroup');
        optGroup.label = 'Available Hardware Cameras';
        labeledDevices.forEach((dev, idx) => {
          const opt = document.createElement('option');
          opt.value = dev.deviceId;
          const isBack = /back|rear|environment/i.test(dev.label);
          const isFront = /front|user|facetime/i.test(dev.label);
          const icon = isBack ? '📷 ' : (isFront ? '🤳 ' : '📹 ');
          opt.textContent = `${icon}${dev.label}`;
          optGroup.appendChild(opt);
        });
        select.appendChild(optGroup);
      }

      // Restore value if option exists, otherwise keep current
      if ([...select.options].some(o => o.value === prevValue)) {
        select.value = prevValue;
      } else {
        select.value = this.currentCamera || 'environment';
      }
    } catch (err) {
      console.warn('Camera device enumeration error:', err);
    }
  }

  async flipCamera() {
    const select = document.getElementById('aruco-camera-select');
    // If currently environment or back camera, switch to front; else switch to back
    if (this.currentCamera === 'environment') {
      this.currentCamera = 'user';
    } else if (this.currentCamera === 'user') {
      this.currentCamera = 'environment';
    } else {
      this.currentCamera = (this.currentCamera.includes('front') || this.currentCamera === 'user') ? 'environment' : 'user';
    }

    if (select) {
      select.value = this.currentCamera;
    }

    if (detector && detector.isRunning) {
      await this.startCamera(this.currentCamera);
    }
  }

  async startCamera(cameraSelection) {
    if (!detector) return;
    if (cameraSelection) {
      this.currentCamera = cameraSelection;
    } else {
      const select = document.getElementById('aruco-camera-select');
      this.currentCamera = (select && select.value) ? select.value : 'environment';
    }

    // Stop existing stream if currently running
    if (detector.isRunning) {
      detector.stop();
    }

    let videoConstraint = {};

    if (this.currentCamera === 'user') {
      videoConstraint = {
        facingMode: { ideal: 'user' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      };
    } else if (this.currentCamera === 'environment') {
      videoConstraint = {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      };
    } else if (this.currentCamera && this.currentCamera.length > 0) {
      videoConstraint = {
        deviceId: { exact: this.currentCamera },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      };
    } else {
      videoConstraint = {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      };
    }

    try {
      await detector.start({ video: videoConstraint });
      this.onCameraStarted();
      // Re-enumerate to get full camera labels on iOS now that permission is active
      await this.refreshCameraDevices();
    } catch (err) {
      console.warn('Failed with primary video constraints, trying fallback facingMode:', err);
      try {
        const fallbackFacing = this.currentCamera === 'user' ? 'user' : 'environment';
        await detector.start({
          video: {
            facingMode: fallbackFacing
          }
        });
        this.onCameraStarted();
        await this.refreshCameraDevices();
      } catch (fallbackErr) {
        console.warn('Fallback facingMode failed, trying generic video constraint:', fallbackErr);
        try {
          await detector.start({ video: true });
          this.onCameraStarted();
          await this.refreshCameraDevices();
        } catch (finalErr) {
          alert('Could not start camera: ' + (finalErr.message || finalErr));
        }
      }
    }
  }

  startDetectorWithDevice(selection) {
    return this.startCamera(selection);
  }

  onOpenCvInitialized() {
    this.isOpenCvReady = true;
    const statusBadge = document.getElementById('aruco-status-badge');
    if (statusBadge) {
      statusBadge.className = 'aruco-status-badge ready';
      statusBadge.innerHTML = '<span class="aruco-status-dot"></span> OpenCV Ready';
    }
    const startBtn = document.getElementById('startBtn');
    if (startBtn) startBtn.disabled = false;
  }

  onCameraStarted() {
    this.isStreaming = true;
    const statusBadge = document.getElementById('aruco-status-badge');
    if (statusBadge) {
      statusBadge.className = 'aruco-status-badge streaming';
      statusBadge.innerHTML = '<span class="aruco-status-dot"></span> Live Streaming';
    }

    const placeholder = document.getElementById('aruco-camera-placeholder');
    if (placeholder) placeholder.classList.add('hidden');

    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    if (startBtn) startBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = false;
  }

  onCameraStopped() {
    this.isStreaming = false;
    const statusBadge = document.getElementById('aruco-status-badge');
    if (statusBadge) {
      statusBadge.className = 'aruco-status-badge ready';
      statusBadge.innerHTML = '<span class="aruco-status-dot"></span> Camera Stopped';
    }

    const placeholder = document.getElementById('aruco-camera-placeholder');
    if (placeholder) placeholder.classList.remove('hidden');

    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
  }

  /**
   * Called on every frame detections from detector.onDetect
   */
  handleDetections(markers) {
    const now = Date.now();

    // Map each detected marker ID to our field definitions
    markers.forEach(m => {
      // Find matching definition
      const def = this.markerDefinitions.find(d => this.idMapping[d.key] === m.id);
      if (def) {
        const state = this.markerStates[def.key];
        state.status = 'live';
        state.lastSeenTime = now;
        state.lastCenter = { x: Math.round(m.center.x), y: Math.round(m.center.y) };
        state.lastCorners = m.corners;
      }
    });

    // FPS calculation
    this.fpsCounter++;
    if (now - this.fpsLastTime >= 1000) {
      this.currentFps = this.fpsCounter;
      this.fpsCounter = 0;
      this.fpsLastTime = now;
      const fpsEl = document.getElementById('aruco-fps-val');
      if (fpsEl) fpsEl.textContent = `${this.currentFps} FPS`;
    }

    this.updateUI();
  }

  /**
   * Periodic ticker to transition markers from 'live' to 'seen' after 900ms of no detection
   */
  tick() {
    const now = Date.now();
    let hasChanges = false;

    this.markerDefinitions.forEach(m => {
      const state = this.markerStates[m.key];
      if (state.status === 'live') {
        if (!state.lastSeenTime || (now - state.lastSeenTime > 900)) {
          state.status = 'seen';
          hasChanges = true;
        }
      }
    });

    this.updateUI();
  }

  updateUI() {
    this.updateMetrics();
    this.updateMarkerCards();
    this.updateFieldSvg();
  }

  updateMetrics() {
    let liveCount = 0;
    let seenCount = 0;
    let cornerAcquired = 0;
    let midAcquired = 0;

    this.markerDefinitions.forEach(m => {
      const state = this.markerStates[m.key];
      if (state.status === 'live') liveCount++;
      if (state.status === 'live' || state.status === 'seen') {
        seenCount++;
        if (m.role === 'corner') cornerAcquired++;
        if (m.role === 'midpoint') midAcquired++;
      }
    });

    const totalCount = this.markerDefinitions.length;
    const pct = Math.round((seenCount / totalCount) * 100);

    const valEl = document.getElementById('aruco-acquired-count');
    if (valEl) valEl.innerHTML = `<span>${seenCount}</span> / ${totalCount}`;

    const subEl = document.getElementById('aruco-live-count-chip');
    if (subEl) subEl.textContent = `${liveCount} Live`;

    const cornerEl = document.getElementById('aruco-corner-count-chip');
    if (cornerEl) cornerEl.textContent = `${cornerAcquired} / 4`;

    const midEl = document.getElementById('aruco-mid-count-chip');
    if (midEl) midEl.textContent = `${midAcquired} / 4`;

    const barEl = document.getElementById('aruco-progress-bar');
    if (barEl) barEl.style.width = `${pct}%`;
  }

  renderMarkerCards() {
    const container = document.getElementById('aruco-markers-list');
    if (!container) return;

    container.innerHTML = '';
    this.markerDefinitions.forEach(m => {
      const card = document.createElement('div');
      card.id = `aruco-card-${m.key}`;
      card.className = 'aruco-marker-card state-unseen';
      card.innerHTML = `
        <div class="aruco-card-top">
          <div class="aruco-marker-identity">
            <span class="aruco-id-pill">ID: ${this.idMapping[m.key]}</span>
            <div>
              <div class="aruco-marker-name">${m.name}</div>
              <span class="aruco-marker-type">${m.type}</span>
            </div>
          </div>
          <span class="aruco-badge badge-unseen" id="aruco-badge-${m.key}">Not Detected</span>
        </div>
        <div class="aruco-card-coords">
          <span>Center: <strong id="aruco-coord-${m.key}">-- , --</strong></span>
          <span class="aruco-card-time" id="aruco-time-${m.key}">Never</span>
        </div>
      `;
      container.appendChild(card);
    });
  }

  updateMarkerCards() {
    const now = Date.now();

    this.markerDefinitions.forEach(m => {
      const state = this.markerStates[m.key];
      const card = document.getElementById(`aruco-card-${m.key}`);
      const badge = document.getElementById(`aruco-badge-${m.key}`);
      const coord = document.getElementById(`aruco-coord-${m.key}`);
      const time = document.getElementById(`aruco-time-${m.key}`);

      if (!card || !badge || !coord || !time) return;

      card.className = `aruco-marker-card state-${state.status}`;

      if (state.status === 'live') {
        badge.className = 'aruco-badge badge-live';
        badge.textContent = 'LIVE';
        coord.textContent = `X:${state.lastCenter?.x} Y:${state.lastCenter?.y}`;
        time.textContent = 'In Frame';
      } else if (state.status === 'seen') {
        badge.className = 'aruco-badge badge-seen';
        const elapsedSec = Math.max(1, Math.round((now - state.lastSeenTime) / 1000));
        badge.textContent = 'SEEN';
        coord.textContent = `X:${state.lastCenter?.x} Y:${state.lastCenter?.y}`;
        time.textContent = elapsedSec < 60 ? `${elapsedSec}s ago` : new Date(state.lastSeenTime).toLocaleTimeString();
      } else {
        badge.className = 'aruco-badge badge-unseen';
        badge.textContent = 'Not Detected';
        coord.textContent = '-- , --';
        time.textContent = 'Never';
      }
    });
  }

  renderFieldSvg() {
    const svg = document.getElementById('aruco-field-svg');
    if (!svg) return;

    // Build SVG content
    let nodesHtml = '';
    this.markerDefinitions.forEach(m => {
      const id = this.idMapping[m.key];
      const p = m.svgPos;
      nodesHtml += `
        <g id="svg-node-${m.key}" class="field-map-node state-unseen" transform="translate(${p.x}, ${p.y})" data-key="${m.key}">
          <circle class="node-bg" r="9"></circle>
          <text>${id}</text>
        </g>
      `;
    });

    svg.innerHTML = `
      <!-- Field Perimeter Rectangle (Standard Dog Agility Ring) -->
      <rect x="20" y="20" width="160" height="70" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1.5" stroke-dasharray="4,3" rx="4" />
      <!-- Field Center Mark -->
      <line x1="95" y1="55" x2="105" y2="55" stroke="rgba(255,255,255,0.15)" stroke-width="1" />
      <line x1="100" y1="50" x2="100" y2="60" stroke="rgba(255,255,255,0.15)" stroke-width="1" />
      <!-- 8 Marker Nodes -->
      ${nodesHtml}
    `;

    // Click handler to highlight card
    svg.querySelectorAll('.field-map-node').forEach(node => {
      node.addEventListener('click', () => {
        const key = node.getAttribute('data-key');
        const card = document.getElementById(`aruco-card-${key}`);
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          card.style.transform = 'scale(1.03)';
          setTimeout(() => { card.style.transform = ''; }, 400);
        }
      });
    });
  }

  updateFieldSvg() {
    this.markerDefinitions.forEach(m => {
      const state = this.markerStates[m.key];
      const node = document.getElementById(`svg-node-${m.key}`);
      if (node) {
        node.className.baseVal = `field-map-node state-${state.status}`;
      }
    });
  }

  exportMarkerData() {
    const data = {
      timestamp: new Date().toISOString(),
      dictionary: 'DICT_4X4_50',
      fieldMarkers: this.markerDefinitions.map(m => {
        const state = this.markerStates[m.key];
        return {
          key: m.key,
          name: m.name,
          role: m.role,
          markerId: this.idMapping[m.key],
          status: state.status,
          lastSeenTime: state.lastSeenTime ? new Date(state.lastSeenTime).toISOString() : null,
          center: state.lastCenter,
          corners: state.lastCorners
        };
      })
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aruco_field_markers_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  showSettingsModal() {
    const modal = document.getElementById('aruco-settings-modal');
    const backdrop = document.getElementById('aruco-backdrop');
    if (!modal || !backdrop) return;

    const list = document.getElementById('aruco-settings-inputs');
    if (list) {
      list.innerHTML = '';
      this.markerDefinitions.forEach(m => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'space-between';
        row.style.gap = '12px';
        row.innerHTML = `
          <label style="font-size: 13px; color: var(--text-main); font-weight: 500;">
            ${m.name} <span style="font-size: 11px; color: var(--text-dim);">(${m.type})</span>
          </label>
          <input type="number" min="0" max="49" class="app-input" id="input-aruco-id-${m.key}" value="${this.idMapping[m.key]}" style="width: 80px; text-align: center;">
        `;
        list.appendChild(row);
      });
    }

    modal.classList.add('active');
    backdrop.classList.add('active');

    const saveBtn = document.getElementById('btn-aruco-save-settings');
    const cancelBtn = document.getElementById('btn-aruco-cancel-settings');

    const closeModal = () => {
      modal.classList.remove('active');
      backdrop.classList.remove('active');
    };

    if (cancelBtn) cancelBtn.onclick = closeModal;
    if (backdrop) backdrop.onclick = closeModal;

    if (saveBtn) {
      saveBtn.onclick = () => {
        this.markerDefinitions.forEach(m => {
          const input = document.getElementById(`input-aruco-id-${m.key}`);
          if (input) {
            this.idMapping[m.key] = parseInt(input.value, 10) || 0;
            this.markerStates[m.key].id = this.idMapping[m.key];
          }
        });
        this.renderMarkerCards();
        this.renderFieldSvg();
        this.updateUI();
        closeModal();
      };
    }
  }
}

// Instantiate UI tracker on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.arucoTracker = new ArUcoTrackerUI();
});

/**
 * OpenCV.js runtime loader hook requested by specification
 */
function onCvLoaded() {
  const initOpenCvRuntime = () => {
    const video = document.getElementById('webcam');
    const canvas = document.getElementById('outputCanvas');

    detector = new Aruco4x4Detector(video, canvas, {
      dictType: cv.DICT_4X4_50,
      onDetect: (markers) => {
        markers.forEach((m) => {
          //console.log(`Detected Marker ID: ${m.id} Center:`, m.center);
        });
        if (window.arucoTracker) {
          window.arucoTracker.handleDetections(markers);
        }
      }
    });

    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');

    if (startBtn) {
      startBtn.onclick = () => {
        const deviceSelect = document.getElementById('aruco-camera-select');
        const deviceId = deviceSelect ? deviceSelect.value : null;
        if (window.arucoTracker) {
          window.arucoTracker.startDetectorWithDevice(deviceId);
        } else {
          detector.start();
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

    if (window.arucoTracker) {
      window.arucoTracker.onOpenCvInitialized();
    }
  };

  if (typeof cv !== 'undefined' && cv.Mat) {
    initOpenCvRuntime();
  } else if (typeof cv !== 'undefined') {
    cv['onRuntimeInitialized'] = initOpenCvRuntime;
  }
}

// Expose globally for window / OpenCV callback
window.onCvLoaded = onCvLoaded;
window.Aruco4x4Detector = Aruco4x4Detector;
