/**
 * Agility Course Designer - ArUco Field Marker Tracker UI & State Manager
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
    this._idToKeyMap = {};
    this._rebuildIdMap();

    // History state per marker key: { status: 'unseen'|'seen'|'live', lastSeenTime: null, lastCenter: null, lastCorners: null }
    this.markerStates = {};
    this.resetStates();

    this.currentCamera = 'environment'; // 'environment' (rear), 'user' (front), or specific deviceId
    this._lastFacingMode = 'environment';
    this.markerSizeMeters = 0.25;       // Default 25 cm physical marker size
    this.isOpenCvReady = false;
    this.isStreaming = false;

    this.fpsCounter = 0;
    this.fpsLastTime = performance.now();
    this.currentFps = 0;

    // Cached DOM references & previous rendered snapshots to avoid per-frame DOM thrashing
    this._dom = {};
    this._cardRefs = {};
    this._cardPrev = {};
    this._svgNodes = {};
    this._svgPrev = {};
    this._metricsPrev = {};

    this.tickerInterval = null;
    this.initDOM();
  }

  _rebuildIdMap() {
    const map = {};
    this.markerDefinitions.forEach(m => {
      map[this.idMapping[m.key]] = m.key;
    });
    this._idToKeyMap = map;
    return map;
  }

  getIdToKeyMap() {
    return this._idToKeyMap;
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
    this._cacheStaticDom();
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
      // Also forget the 3D alignment and what was learned about the markers
      if (window.arucoFieldTracker) window.arucoFieldTracker.reset();
      if (window.agilityApp && typeof window.agilityApp._syncArLockButton === 'function') {
        window.agilityApp._syncArLockButton();
      }
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

    // If OpenCV initialized before ArUcoTrackerUI was mounted, update status immediately
    if (window._arucoDetectorInitialized || (typeof cv !== 'undefined' && cv.Mat)) {
      this.onOpenCvInitialized();
    }
  }

  _cacheStaticDom() {
    this._dom = {
      statusBadge: document.getElementById('aruco-status-badge'),
      placeholder: document.getElementById('aruco-camera-placeholder'),
      startBtn: document.getElementById('startBtn'),
      stopBtn: document.getElementById('stopBtn'),
      fpsVal: document.getElementById('aruco-fps-val'),
      arStatusText: document.getElementById('aruco-ar-status-text'),
      acquiredCount: document.getElementById('aruco-acquired-count'),
      liveCountChip: document.getElementById('aruco-live-count-chip'),
      cornerCountChip: document.getElementById('aruco-corner-count-chip'),
      midCountChip: document.getElementById('aruco-mid-count-chip'),
      progressBar: document.getElementById('aruco-progress-bar'),
      mobileBadgeText: document.getElementById('aruco-mobile-badge-text')
    };
  }

  async initCameraDevices() {
    const select = document.getElementById('aruco-camera-select');
    if (select) {
      select.addEventListener('change', async (e) => {
        this.currentCamera = e.target.value;
        if (typeof detector !== 'undefined' && detector && detector.isRunning) {
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
        labeledDevices.forEach((dev) => {
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
    const selectedOpt = select && select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null;
    const label = selectedOpt ? selectedOpt.textContent : '';

    if (this.currentCamera === 'environment') {
      this.currentCamera = 'user';
    } else if (this.currentCamera === 'user') {
      this.currentCamera = 'environment';
    } else if (/front|user|facetime/i.test(label) || this._lastFacingMode === 'user') {
      this.currentCamera = 'environment';
    } else if (/back|rear|environment/i.test(label) || this._lastFacingMode === 'environment') {
      this.currentCamera = 'user';
    } else {
      this.currentCamera = 'user';
    }
    this._lastFacingMode = this.currentCamera === 'user' ? 'user' : 'environment';

    if (select) {
      select.value = this.currentCamera;
    }

    if (typeof detector !== 'undefined' && detector && detector.isRunning) {
      await this.startCamera(this.currentCamera);
    }
  }

  async startCamera(cameraSelection) {
    if (typeof detector === 'undefined' || !detector) return;
    if (cameraSelection) {
      this.currentCamera = cameraSelection;
    } else {
      const select = document.getElementById('aruco-camera-select');
      this.currentCamera = (select && select.value) ? select.value : 'environment';
    }
    if (this.currentCamera === 'user' || this.currentCamera === 'environment') {
      this._lastFacingMode = this.currentCamera;
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

    const finalizeStart = async () => {
      if (!detector.isRunning) {
        this.onCameraStopped();
        return;
      }
      this.onCameraStarted();
      // Re-enumerate to get full camera labels on iOS now that permission is active
      await this.refreshCameraDevices();
    };

    try {
      await detector.start({ video: videoConstraint });
      await finalizeStart();
    } catch (err) {
      console.warn('Failed with primary video constraints, trying fallback facingMode:', err);
      try {
        const fallbackFacing = this._lastFacingMode || (this.currentCamera === 'user' ? 'user' : 'environment');
        await detector.start({
          video: {
            facingMode: fallbackFacing
          }
        });
        await finalizeStart();
      } catch (fallbackErr) {
        console.warn('Fallback facingMode failed, trying generic video constraint:', fallbackErr);
        try {
          await detector.start({ video: true });
          await finalizeStart();
        } catch (finalErr) {
          this.onCameraStopped();
          if (window.agilityApp && typeof window.agilityApp.onArStopped === 'function') {
            window.agilityApp.onArStopped();
          }
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
    const statusBadge = this._dom.statusBadge || document.getElementById('aruco-status-badge');
    if (statusBadge) {
      statusBadge.className = 'aruco-status-badge ready';
      statusBadge.innerHTML = '<span class="aruco-status-dot"></span> OpenCV Ready';
    }
    const startBtn = this._dom.startBtn || document.getElementById('startBtn');
    if (startBtn) startBtn.disabled = false;
  }

  onCameraStarted() {
    this.isStreaming = true;
    const statusBadge = this._dom.statusBadge || document.getElementById('aruco-status-badge');
    if (statusBadge) {
      statusBadge.className = 'aruco-status-badge streaming';
      statusBadge.innerHTML = '<span class="aruco-status-dot"></span> Live Streaming';
    }

    const placeholder = this._dom.placeholder || document.getElementById('aruco-camera-placeholder');
    if (placeholder) placeholder.classList.add('hidden');

    const startBtn = this._dom.startBtn || document.getElementById('startBtn');
    const stopBtn = this._dom.stopBtn || document.getElementById('stopBtn');
    if (startBtn) startBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = false;
  }

  onCameraStopped() {
    this.isStreaming = false;
    const statusBadge = this._dom.statusBadge || document.getElementById('aruco-status-badge');
    if (statusBadge) {
      statusBadge.className = 'aruco-status-badge ready';
      statusBadge.innerHTML = '<span class="aruco-status-dot"></span> Camera Stopped';
    }

    const placeholder = this._dom.placeholder || document.getElementById('aruco-camera-placeholder');
    if (placeholder) placeholder.classList.remove('hidden');

    const startBtn = this._dom.startBtn || document.getElementById('startBtn');
    const stopBtn = this._dom.stopBtn || document.getElementById('stopBtn');
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
  }

  /**
   * Called on every frame detections from detector.onDetect
   */
  handleDetections(markers) {
    const now = Date.now();

    // Map each detected marker ID to our field definitions in O(1)
    for (let i = 0; i < markers.length; i++) {
      const m = markers[i];
      const key = this._idToKeyMap[m.id];
      if (key) {
        const state = this.markerStates[key];
        state.status = 'live';
        state.lastSeenTime = now;
        const cx = Math.round(m.center.x);
        const cy = Math.round(m.center.y);
        if (state.lastCenter) {
          state.lastCenter.x = cx;
          state.lastCenter.y = cy;
        } else {
          state.lastCenter = { x: cx, y: cy };
        }
        state.lastCorners = m.corners;
      }
    }

    // FPS calculation
    this.fpsCounter++;
    if (now - this.fpsLastTime >= 1000) {
      this.currentFps = this.fpsCounter;
      this.fpsCounter = 0;
      this.fpsLastTime = now;
      const fpsEl = this._dom.fpsVal || document.getElementById('aruco-fps-val');
      if (fpsEl) fpsEl.textContent = `${this.currentFps} FPS`;
    }

    this.updateUI();
  }

  /**
   * Periodic ticker to transition markers from 'live' to 'seen' after 900ms of no detection
   */
  tick() {
    const now = Date.now();

    for (let i = 0; i < this.markerDefinitions.length; i++) {
      const state = this.markerStates[this.markerDefinitions[i].key];
      if (state.status === 'live') {
        if (!state.lastSeenTime || (now - state.lastSeenTime > 900)) {
          state.status = 'seen';
        }
      }
    }

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

    for (let i = 0; i < this.markerDefinitions.length; i++) {
      const m = this.markerDefinitions[i];
      const state = this.markerStates[m.key];
      if (state.status === 'live') liveCount++;
      if (state.status === 'live' || state.status === 'seen') {
        seenCount++;
        if (m.role === 'corner') cornerAcquired++;
        if (m.role === 'midpoint') midAcquired++;
      }
    }

    const totalCount = this.markerDefinitions.length;
    const prev = this._metricsPrev;
    const dom = this._dom;

    if (prev.seenCount !== seenCount) {
      prev.seenCount = seenCount;
      const pct = Math.round((seenCount / totalCount) * 100);
      const valEl = dom.acquiredCount || document.getElementById('aruco-acquired-count');
      if (valEl) valEl.innerHTML = `<span>${seenCount}</span> / ${totalCount}`;

      const barEl = dom.progressBar || document.getElementById('aruco-progress-bar');
      if (barEl) barEl.style.width = `${pct}%`;

      const mobileBadgeEl = dom.mobileBadgeText || document.getElementById('aruco-mobile-badge-text');
      if (mobileBadgeEl) mobileBadgeEl.textContent = `Markers (${seenCount}/${totalCount})`;
    }

    if (prev.liveCount !== liveCount) {
      prev.liveCount = liveCount;
      const subEl = dom.liveCountChip || document.getElementById('aruco-live-count-chip');
      if (subEl) subEl.textContent = `${liveCount} Live`;
    }

    if (prev.cornerAcquired !== cornerAcquired) {
      prev.cornerAcquired = cornerAcquired;
      const cornerEl = dom.cornerCountChip || document.getElementById('aruco-corner-count-chip');
      if (cornerEl) cornerEl.textContent = `${cornerAcquired} / 4`;
    }

    if (prev.midAcquired !== midAcquired) {
      prev.midAcquired = midAcquired;
      const midEl = dom.midCountChip || document.getElementById('aruco-mid-count-chip');
      if (midEl) midEl.textContent = `${midAcquired} / 4`;
    }
  }

  renderMarkerCards() {
    const container = document.getElementById('aruco-markers-list');
    if (!container) return;

    container.innerHTML = '';
    this._cardRefs = {};
    this._cardPrev = {};

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
      this._cardRefs[m.key] = {
        card,
        badge: card.querySelector(`#aruco-badge-${m.key}`),
        coord: card.querySelector(`#aruco-coord-${m.key}`),
        time: card.querySelector(`#aruco-time-${m.key}`)
      };
    });
  }

  updateMarkerCards() {
    const now = Date.now();

    for (let i = 0; i < this.markerDefinitions.length; i++) {
      const key = this.markerDefinitions[i].key;
      const state = this.markerStates[key];
      const refs = this._cardRefs[key];
      if (!refs) continue;

      const cx = state.lastCenter ? state.lastCenter.x : undefined;
      const cy = state.lastCenter ? state.lastCenter.y : undefined;
      let prev = this._cardPrev[key];

      if (state.status === 'live') {
        if (prev && prev.status === 'live' && prev.cx === cx && prev.cy === cy) continue;
        if (!prev) prev = this._cardPrev[key] = {};
        if (prev.status !== 'live') {
          refs.card.className = 'aruco-marker-card state-live';
          refs.badge.className = 'aruco-badge badge-live';
          refs.badge.textContent = 'LIVE';
          refs.time.textContent = 'In Frame';
          prev.timeText = 'In Frame';
        }
        if (prev.status === 'unseen' || prev.cx !== cx || prev.cy !== cy || !prev.status) {
          refs.coord.textContent = `X:${cx} Y:${cy}`;
        }
        prev.status = 'live';
        prev.cx = cx;
        prev.cy = cy;
        prev.lastSeenTime = state.lastSeenTime;
        prev.elapsedSec = null;
      } else if (state.status === 'seen') {
        const elapsedSec = Math.max(1, Math.round((now - state.lastSeenTime) / 1000));
        if (
          prev && prev.status === 'seen' &&
          prev.cx === cx && prev.cy === cy &&
          prev.lastSeenTime === state.lastSeenTime &&
          (prev.elapsedSec === elapsedSec || (prev.elapsedSec >= 60 && elapsedSec >= 60))
        ) {
          continue;
        }
        if (!prev) prev = this._cardPrev[key] = {};
        if (prev.status !== 'seen') {
          refs.card.className = 'aruco-marker-card state-seen';
          refs.badge.className = 'aruco-badge badge-seen';
          refs.badge.textContent = 'SEEN';
        }
        if (prev.status === 'unseen' || prev.cx !== cx || prev.cy !== cy || !prev.status) {
          refs.coord.textContent = `X:${cx} Y:${cy}`;
        }
        const timeText = elapsedSec < 60 ? `${elapsedSec}s ago` : new Date(state.lastSeenTime).toLocaleTimeString();
        if (prev.timeText !== timeText) {
          refs.time.textContent = timeText;
          prev.timeText = timeText;
        }
        prev.status = 'seen';
        prev.cx = cx;
        prev.cy = cy;
        prev.lastSeenTime = state.lastSeenTime;
        prev.elapsedSec = elapsedSec;
      } else {
        if (prev && prev.status === 'unseen') continue;
        if (!prev) prev = this._cardPrev[key] = {};
        refs.card.className = 'aruco-marker-card state-unseen';
        refs.badge.className = 'aruco-badge badge-unseen';
        refs.badge.textContent = 'Not Detected';
        refs.coord.textContent = '-- , --';
        refs.time.textContent = 'Never';
        prev.status = 'unseen';
        prev.cx = undefined;
        prev.cy = undefined;
        prev.lastSeenTime = null;
        prev.elapsedSec = null;
        prev.timeText = 'Never';
      }
    }
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

    this._svgNodes = {};
    this._svgPrev = {};

    // Cache SVG nodes and wire click handler to highlight card
    this.markerDefinitions.forEach(m => {
      const node = svg.querySelector(`#svg-node-${m.key}`);
      if (!node) return;
      this._svgNodes[m.key] = node;
      this._svgPrev[m.key] = 'unseen';
      node.addEventListener('click', () => {
        const card = (this._cardRefs[m.key] && this._cardRefs[m.key].card) || document.getElementById(`aruco-card-${m.key}`);
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          card.style.transform = 'scale(1.03)';
          setTimeout(() => { card.style.transform = ''; }, 400);
        }
      });
    });
  }

  updateFieldSvg() {
    for (let i = 0; i < this.markerDefinitions.length; i++) {
      const key = this.markerDefinitions[i].key;
      const status = this.markerStates[key].status;
      if (this._svgPrev[key] === status) continue;
      this._svgPrev[key] = status;
      const node = this._svgNodes[key];
      if (node) {
        node.className.baseVal = `field-map-node state-${status}`;
      }
    }
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

  setArStatus(text) {
    const statusEl = document.getElementById('aruco-ar-status-text');
    if (statusEl) {
      statusEl.textContent = text;
    }
  }

  hideSettingsModal() {
    document.getElementById('aruco-settings-modal')?.classList.remove('active');
    document.getElementById('aruco-backdrop')?.classList.remove('active');
  }

  showSettingsModal() {
    const modal = document.getElementById('aruco-settings-modal');
    const backdrop = document.getElementById('aruco-backdrop');
    if (!modal || !backdrop) return;

    // Populate physical marker size input
    const sizeInput = document.getElementById('input-aruco-marker-size');
    if (sizeInput) {
      sizeInput.value = this.markerSizeMeters || 0.25;
    }
    const fovInput = document.getElementById('input-aruco-fov');
    if (fovInput && window.arucoFieldTracker) {
      fovInput.value = window.arucoFieldTracker.fovDegrees;
      const autoInput = document.getElementById('input-aruco-fov-auto');
      const measuredEl = document.getElementById('aruco-fov-measured');
      if (autoInput) autoInput.checked = window.arucoFieldTracker.autoFov;
      if (measuredEl) {
        const measured = window.arucoFieldTracker.cal && window.arucoFieldTracker.cal.focalRatio;
        measuredEl.textContent = measured
          ? `- measured: ${window.arucoFieldTracker.effectiveFovDegrees.toFixed(1)}°`
          : '- not measured yet';
      }
    }
    // Marker placement (flat / upright) and, for upright markers, the height of their center
    const placementInput = document.getElementById('input-aruco-placement');
    const heightInput = document.getElementById('input-aruco-marker-height');
    const heightRow = document.getElementById('row-aruco-marker-height');
    if (placementInput && window.arucoFieldTracker) {
      placementInput.value = window.arucoFieldTracker.markerPlacement;
      if (heightInput) heightInput.value = window.arucoFieldTracker.markerHeightMeters;
      const syncHeightRow = () => {
        if (heightRow) heightRow.style.display = placementInput.value === 'upright' ? 'flex' : 'none';
      };
      placementInput.onchange = syncHeightRow;
      syncHeightRow();
    }

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
          <input type="number" min="0" max="49" step="1" class="app-input" id="input-aruco-id-${m.key}" value="${this.idMapping[m.key]}" style="width: 80px; text-align: center;">
        `;
        list.appendChild(row);
      });
    }

    let errBanner = document.getElementById('aruco-settings-error');
    if (errBanner) errBanner.style.display = 'none';

    modal.classList.add('active');
    backdrop.classList.add('active');

    const saveBtn = document.getElementById('btn-aruco-save-settings');
    const cancelBtn = document.getElementById('btn-aruco-cancel-settings');

    const closeModal = () => this.hideSettingsModal();

    if (cancelBtn) cancelBtn.onclick = closeModal;
    if (backdrop) backdrop.onclick = closeModal;

    if (saveBtn) {
      saveBtn.onclick = () => {
        // Validate all 8 marker IDs before mutating any state: integers in [0, 49], no duplicates
        const newIds = {};
        const seenIds = new Map();
        const errors = [];

        this.markerDefinitions.forEach(m => {
          const input = document.getElementById(`input-aruco-id-${m.key}`);
          if (!input) return;
          input.style.borderColor = '';
          const raw = input.value.trim();
          const num = raw === '' ? NaN : Number(raw);
          if (!Number.isInteger(num) || num < 0 || num > 49) {
            input.style.borderColor = '#f43f5e';
            errors.push(`${m.name}: ID must be an integer between 0 and 49.`);
            return;
          }
          if (seenIds.has(num)) {
            input.style.borderColor = '#f43f5e';
            const firstInput = seenIds.get(num).input;
            if (firstInput) firstInput.style.borderColor = '#f43f5e';
            errors.push(`Duplicate ID ${num} (${seenIds.get(num).name} and ${m.name}).`);
            return;
          }
          seenIds.set(num, { name: m.name, input });
          newIds[m.key] = num;
        });

        if (errors.length > 0) {
          if (!errBanner && list && list.parentElement) {
            errBanner = document.createElement('div');
            errBanner.id = 'aruco-settings-error';
            errBanner.style.cssText = 'margin-top: 10px; padding: 8px 10px; border-radius: 6px; background: rgba(244,63,94,0.14); border: 1px solid rgba(244,63,94,0.5); color: #fda4af; font-size: 12px; line-height: 1.4;';
            list.parentElement.appendChild(errBanner);
          }
          if (errBanner) {
            errBanner.textContent = errors[0];
            errBanner.style.display = 'block';
          }
          return;
        }

        if (errBanner) errBanner.style.display = 'none';

        // Save physical marker size
        const sizeInput = document.getElementById('input-aruco-marker-size');
        if (sizeInput) {
          const sizeVal = parseFloat(sizeInput.value);
          if (sizeVal > 0) {
            this.markerSizeMeters = sizeVal;
            if (window.arucoFieldTracker) {
              window.arucoFieldTracker.setMarkerSize(sizeVal);
            }
          }
        }

        // Save marker placement and (upright) marker center height
        const placementInput = document.getElementById('input-aruco-placement');
        const heightInput = document.getElementById('input-aruco-marker-height');
        if (placementInput && window.arucoFieldTracker) {
          window.arucoFieldTracker.setMarkerPlacement(placementInput.value);
          if (heightInput) window.arucoFieldTracker.setMarkerHeight(heightInput.value);
          if (window.agilityApp && typeof window.agilityApp._syncArLockButton === 'function') {
            window.agilityApp._syncArLockButton();
          }
        }

        // Save camera field of view
        const fovInput = document.getElementById('input-aruco-fov');
        if (fovInput && window.arucoFieldTracker) {
          window.arucoFieldTracker.setFov(fovInput.value);
          const autoInput = document.getElementById('input-aruco-fov-auto');
          if (autoInput) window.arucoFieldTracker.setAutoFov(autoInput.checked);
        }

        // Apply validated marker IDs and refresh cached lookup map
        this.markerDefinitions.forEach(m => {
          if (Object.prototype.hasOwnProperty.call(newIds, m.key)) {
            this.idMapping[m.key] = newIds[m.key];
            this.markerStates[m.key].id = newIds[m.key];
          }
        });
        this._rebuildIdMap();
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

// Expose globally
window.ArUcoTrackerUI = ArUcoTrackerUI;
