/**
 * Property Panel Component for Agility Course Designer
 * Provides controls for active obstacle properties: Sequence #, Wrap Direction (Reverse Wrap/Backside), Rotation, Scale, Curve.
 */
import { WRAP_DIRECTIONS, OBSTACLE_TYPES } from '../config.js';

export class PropertyPanel {
  constructor(containerEl, canvasEngine, historyManager) {
    this.container = containerEl;
    this.canvasEngine = canvasEngine;
    this.historyManager = historyManager;

    this.selectedObstacle = null;
    this.canvasEngine.onSelectionChange = selected => {
      this.selectedObstacle = selected.length === 1 ? selected[0] : null;
      this.render();
    };

    this.render();
  }

  render() {
    if (!this.selectedObstacle) {
      this.container.innerHTML = `
        <div class="empty-panel">
          <i class="fa-solid fa-hand-pointer"></i>
          <p>Select an obstacle on the canvas to inspect & adjust wrap direction, rotation, or sequence number.</p>
        </div>
      `;
      return;
    }

    const obs = this.selectedObstacle;
    const def = obs.def;

    this.container.innerHTML = `
      <div class="panel-header">
        <div class="panel-title">
          <i class="fa-solid ${def.icon}" style="color: ${def.color}"></i>
          <span>${def.name}</span>
        </div>
        <button class="icon-btn danger-btn delete-btn" title="Delete Obstacle">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>

      <div class="panel-section">
        <label class="panel-label">Course Sequence Number</label>
        <p class="panel-subtext">Enter sequence number(s), e.g. 1 or 1, 5</p>
        <div class="input-row">
          <input type="text" id="prop-seq" value="${typeof obs.getSeqString === 'function' ? obs.getSeqString() : (obs.seq !== null ? obs.seq : '')}" placeholder="e.g. 1 or 1, 5" class="app-input">
          <button id="btn-clear-seq" class="sec-btn">Clear</button>
        </div>
      </div>

      <!-- Wrap & Dog Jumping Direction Section -->
      <div class="panel-section highlight-section">
        <label class="panel-label">
          <i class="fa-solid fa-route"></i> Dog Direction & Wrap Mode
        </label>
        <p class="panel-subtext">Choose dog approach and wrap style (e.g. Backside / Reverse Wrap)</p>
        
        <div class="wrap-grid">
          <button class="wrap-btn ${obs.wrap === WRAP_DIRECTIONS.NONE ? 'active' : ''}" data-wrap="${WRAP_DIRECTIONS.NONE}">
            <i class="fa-solid fa-arrow-up"></i>
            <span>Straight</span>
          </button>
          
          <button class="wrap-btn ${obs.wrap === WRAP_DIRECTIONS.LEFT ? 'active' : ''}" data-wrap="${WRAP_DIRECTIONS.LEFT}">
            <i class="fa-solid fa-reply"></i>
            <span>Wrap Left</span>
          </button>

          <button class="wrap-btn ${obs.wrap === WRAP_DIRECTIONS.RIGHT ? 'active' : ''}" data-wrap="${WRAP_DIRECTIONS.RIGHT}">
            <i class="fa-solid fa-share"></i>
            <span>Wrap Right</span>
          </button>

          <button class="wrap-btn reverse-btn ${obs.wrap === WRAP_DIRECTIONS.REVERSE_LEFT ? 'active' : ''}" data-wrap="${WRAP_DIRECTIONS.REVERSE_LEFT}">
            <i class="fa-solid fa-rotate-left"></i>
            <span>Reverse Wrap (Push L)</span>
          </button>

          <button class="wrap-btn reverse-btn ${obs.wrap === WRAP_DIRECTIONS.REVERSE_RIGHT ? 'active' : ''}" data-wrap="${WRAP_DIRECTIONS.REVERSE_RIGHT}">
            <i class="fa-solid fa-rotate-right"></i>
            <span>Reverse Wrap (Push R)</span>
          </button>
        </div>
      </div>

      <!-- Rotation Section -->
      <div class="panel-section">
        <label class="panel-label">Rotation Angle (${obs.rotation}°)</label>
        <div class="slider-row">
          <input type="range" id="prop-rotation" min="-180" max="180" value="${obs.rotation}" class="app-slider">
        </div>
        <div class="quick-rot-row">
          <button class="rot-quick-btn" data-rot="0">0°</button>
          <button class="rot-quick-btn" data-rot="45">45°</button>
          <button class="rot-quick-btn" data-rot="90">90°</button>
          <button class="rot-quick-btn" data-rot="180">180°</button>
          <button class="rot-quick-btn" data-rot="-90">-90°</button>
        </div>
      </div>

      ${
        (obs.type === OBSTACLE_TYPES.TUNNEL || (typeof obs.type === 'string' && obs.type.startsWith('tunnel')))
          ? `
        <div class="panel-section">
          <label class="panel-label">Tunnel Shape & Curve</label>
          <p class="panel-subtext">3 Movable Nodes (Entry, Center, Exit). Drag nodes directly on canvas to bend.</p>
          <button id="btn-straighten-tunnel" class="sec-btn" style="width: 100%; margin-top: 6px;">
            <i class="fa-solid fa-ruler-horizontal"></i> Reset to Straight Tunnel
          </button>
        </div>
      `
          : ''
      }

      <!-- Dimensions Section -->
      <div class="panel-section">
        <label class="panel-label">Dimensions (relative to field scale)</label>
        <div class="grid-2">
          <div>
            <label class="sub-label">Width (${this.canvasEngine.field.unit})</label>
            <input type="number" id="prop-width" value="${obs.widthMeters}" step="0.1" min="0.5" class="app-input">
          </div>
          <div>
            <label class="sub-label">Length (${this.canvasEngine.field.unit})</label>
            <input type="number" id="prop-depth" value="${obs.depthMeters}" step="0.1" min="0.5" class="app-input">
          </div>
        </div>
      </div>

      <div class="panel-actions">
        <button id="btn-duplicate" class="sec-btn width-full">
          <i class="fa-solid fa-copy"></i> Duplicate
        </button>
      </div>
    `;

    this._bindEvents();
  }

  _bindEvents() {
    if (!this.selectedObstacle) return;
    const obs = this.selectedObstacle;

    // Delete
    this.container.querySelector('.delete-btn')?.addEventListener('click', () => {
      this.canvasEngine.deleteSelected();
    });

    // Sequence Number
    const seqInput = this.container.querySelector('#prop-seq');
    seqInput?.addEventListener('input', e => {
      const raw = e.target.value.trim();
      if (!raw) {
        obs.seq = null;
      } else {
        const arr = raw.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0);
        obs.seq = arr.length === 0 ? null : (arr.length === 1 ? arr[0] : arr);
      }
      this.canvasEngine.render();
    });

    this.container.querySelector('#btn-clear-seq')?.addEventListener('click', () => {
      obs.seq = null;
      this.render();
      this.canvasEngine.render();
    });

    // Wrap buttons (including Reverse Wrap buttons!)
    this.container.querySelectorAll('.wrap-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const wrapMode = btn.dataset.wrap;
        obs.wrap = wrapMode;
        this.render();
        this.historyManager.push(this.canvasEngine.getSnapshot());
        this.canvasEngine.render();
      });
    });

    // Rotation slider
    const rotSlider = this.container.querySelector('#prop-rotation');
    rotSlider?.addEventListener('input', e => {
      obs.rotation = parseInt(e.target.value);
      this.canvasEngine.render();
    });

    // Quick Rotation buttons
    this.container.querySelectorAll('.rot-quick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        obs.rotation = parseInt(btn.dataset.rot);
        this.render();
        this.canvasEngine.render();
      });
    });

    // Straighten Tunnel button
    const btnStraighten = this.container.querySelector('#btn-straighten-tunnel');
    btnStraighten?.addEventListener('click', () => {
      obs.resetTunnelCurve();
      this.render();
      this.historyManager.push(this.canvasEngine.getSnapshot());
      this.canvasEngine.render();
    });

    // Dimensions
    const widthInput = this.container.querySelector('#prop-width');
    widthInput?.addEventListener('change', e => {
      const val = parseFloat(e.target.value);
      if (val > 0) {
        obs.widthMeters = val;
        this.canvasEngine.render();
      }
    });

    const depthInput = this.container.querySelector('#prop-depth');
    depthInput?.addEventListener('change', e => {
      const val = parseFloat(e.target.value);
      if (val > 0) {
        obs.depthMeters = val;
        this.canvasEngine.render();
      }
    });

    // Duplicate
    this.container.querySelector('#btn-duplicate')?.addEventListener('click', () => {
      this.canvasEngine.duplicateSelected();
    });
  }
}
