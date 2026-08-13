/**
 * Field Configuration Modal Component for Agility Course Designer
 */
import { FIELD_SHAPES } from '../config.js';

export class FieldModal {
  constructor(modalEl, field, canvasEngine, historyManager) {
    this.modal = modalEl;
    this.field = field;
    this.canvasEngine = canvasEngine;
    this.historyManager = historyManager;

    this._bindEvents();
  }

  show() {
    this._renderContent();
    this.modal.classList.add('active');
  }

  hide() {
    this.modal.classList.remove('active');
  }

  _renderContent() {
    this.modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-dialog">
        <div class="modal-header">
          <h3><i class="fa-solid fa-vector-square"></i> Field Dimensions & Geometry Settings</h3>
          <button class="close-modal-btn">&times;</button>
        </div>
        <div class="modal-body">
          
          <div class="form-group">
            <label class="form-label">Field Shape Geometry</label>
            <div class="shape-grid">
              <label class="shape-option ${this.field.shape === FIELD_SHAPES.RECTANGLE ? 'selected' : ''}">
                <input type="radio" name="f-shape" value="${FIELD_SHAPES.RECTANGLE}" ${this.field.shape === FIELD_SHAPES.RECTANGLE ? 'checked' : ''}>
                <div class="shape-box rect-box"></div>
                <span>Standard Rectangle</span>
              </label>

              <label class="shape-option ${this.field.shape === FIELD_SHAPES.L_SHAPE ? 'selected' : ''}">
                <input type="radio" name="f-shape" value="${FIELD_SHAPES.L_SHAPE}" ${this.field.shape === FIELD_SHAPES.L_SHAPE ? 'checked' : ''}>
                <div class="shape-box l-box"></div>
                <span>L-Shaped Ring</span>
              </label>

              <label class="shape-option ${this.field.shape === FIELD_SHAPES.OCTAGON ? 'selected' : ''}">
                <input type="radio" name="f-shape" value="${FIELD_SHAPES.OCTAGON}" ${this.field.shape === FIELD_SHAPES.OCTAGON ? 'checked' : ''}>
                <div class="shape-box oct-box"></div>
                <span>Beveled / Octagon</span>
              </label>
            </div>
          </div>

          <div class="form-row grid-2">
            <div class="form-group">
              <label class="form-label">Field Length (X-Axis)</label>
              <div class="input-with-unit">
                <input type="number" id="field-width" value="${this.field.widthMeters}" min="10" max="200" step="1" class="app-input">
                <span class="unit-tag">${this.field.unit}</span>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Field Width (Y-Axis)</label>
              <div class="input-with-unit">
                <input type="number" id="field-length" value="${this.field.lengthMeters}" min="10" max="200" step="1" class="app-input">
                <span class="unit-tag">${this.field.unit}</span>
              </div>
            </div>
          </div>

          <div class="form-row grid-2">
            <div class="form-group">
              <label class="form-label">Measurement Unit System</label>
              <select id="field-unit" class="app-select">
                <option value="m" ${this.field.unit === 'm' ? 'selected' : ''}>Meters (m)</option>
                <option value="ft" ${this.field.unit === 'ft' ? 'selected' : ''}>Feet (ft)</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Grid Spacing</label>
              <select id="field-grid-size" class="app-select">
                <option value="0.5" ${this.field.gridSizeMeters === 0.5 ? 'selected' : ''}>0.5 ${this.field.unit}</option>
                <option value="1.0" ${this.field.gridSizeMeters === 1.0 ? 'selected' : ''}>1.0 ${this.field.unit}</option>
                <option value="2.0" ${this.field.gridSizeMeters === 2.0 ? 'selected' : ''}>2.0 ${this.field.unit}</option>
                <option value="5.0" ${this.field.gridSizeMeters === 5.0 ? 'selected' : ''}>5.0 ${this.field.unit}</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" id="field-scale-obstacles">
              <span>Scale obstacle dimensions proportionally when field size changes</span>
            </label>
          </div>

          <div class="form-group bg-image-section">
            <label class="form-label"><i class="fa-solid fa-image"></i> Course Overlay Background Image (PNG/JPG)</label>
            <div class="bg-image-controls-box">
              <div class="bg-image-preview-row" style="display: flex; gap: 10px; align-items: center; margin-bottom: 10px;">
                <button type="button" id="modal-upload-bg-btn" class="sec-btn">
                  <i class="fa-solid fa-upload"></i> ${this.field.bgImageDataUrl ? 'Change Course Image' : 'Upload Course PNG / Image'}
                </button>
                <input type="file" id="modal-bg-file-input" accept="image/png, image/jpeg, image/webp" style="display:none;">
                ${this.field.bgImageDataUrl ? `
                  <button type="button" id="modal-remove-bg-btn" class="sec-btn danger-btn" title="Remove Background Image">
                    <i class="fa-solid fa-trash"></i> Remove
                  </button>
                ` : ''}
              </div>
              ${this.field.bgImageDataUrl ? `
                <div class="bg-image-settings-row" style="display: flex; flex-direction: column; gap: 10px; background: rgba(0, 0, 0, 0.2); padding: 12px; border-radius: 6px; border: 1px solid var(--panel-border);">
                  <label class="checkbox-label">
                    <input type="checkbox" id="field-show-bg-image" ${this.field.showBgImage ? 'checked' : ''}>
                    <span>Show Image Overlay Layer</span>
                  </label>
                  <div class="opacity-slider-group" style="display: flex; align-items: center; gap: 12px;">
                    <label class="form-label" style="margin:0; min-width: 100px;">Opacity: <span id="bg-opacity-val">${Math.round((this.field.bgImageOpacity !== undefined ? this.field.bgImageOpacity : 0.6) * 100)}%</span></label>
                    <input type="range" id="field-bg-opacity" min="0.1" max="1.0" step="0.05" value="${this.field.bgImageOpacity !== undefined ? this.field.bgImageOpacity : 0.6}" class="app-range" style="flex:1;">
                  </div>
                </div>
              ` : '<div class="panel-subtext">Upload a PNG or JPG map of a real course to scale and align it over the field grid for obstacle positioning.</div>'}
            </div>
          </div>

        </div>

        <div class="modal-footer">
          <button class="sec-btn close-modal-btn">Cancel</button>
          <button id="save-field-btn" class="pri-btn">
            <i class="fa-solid fa-check"></i> Apply Field Settings
          </button>
        </div>
      </div>
    `;

    // Bind inside modal
    this.modal.querySelector('.close-modal-btn').addEventListener('click', () => this.hide());
    this.modal.querySelector('.modal-backdrop').addEventListener('click', () => this.hide());

    this.modal.querySelectorAll('.shape-option').forEach(opt => {
      opt.addEventListener('click', () => {
        this.modal.querySelectorAll('.shape-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        opt.querySelector('input').checked = true;
      });
    });

    // Background Image events inside modal
    const uploadBtn = this.modal.querySelector('#modal-upload-bg-btn');
    const fileInput = this.modal.querySelector('#modal-bg-file-input');
    const removeBtn = this.modal.querySelector('#modal-remove-bg-btn');
    const showBgCb = this.modal.querySelector('#field-show-bg-image');
    const opacitySlider = this.modal.querySelector('#field-bg-opacity');

    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', e => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = evt => {
            this.field.setBgImage(evt.target.result, () => {
              this.canvasEngine.render();
              this._renderContent();
            });
          };
          reader.readAsDataURL(file);
        }
      });
    }

    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        this.field.setBgImage(null, () => {
          this.canvasEngine.render();
          this._renderContent();
        });
      });
    }

    if (showBgCb) {
      showBgCb.addEventListener('change', e => {
        this.field.showBgImage = e.target.checked;
        this.canvasEngine.render();
      });
    }

    if (opacitySlider) {
      opacitySlider.addEventListener('input', e => {
        const val = parseFloat(e.target.value);
        this.field.bgImageOpacity = val;
        const valLabel = this.modal.querySelector('#bg-opacity-val');
        if (valLabel) valLabel.textContent = `${Math.round(val * 100)}%`;
        this.canvasEngine.render();
      });
    }

    this.modal.querySelector('#save-field-btn').addEventListener('click', () => {
      this._applySettings();
    });
  }

  _applySettings() {
    const shape = this.modal.querySelector('input[name="f-shape"]:checked').value;
    const width = parseFloat(this.modal.querySelector('#field-width').value);
    const length = parseFloat(this.modal.querySelector('#field-length').value);
    const unit = this.modal.querySelector('#field-unit').value;
    const gridSize = parseFloat(this.modal.querySelector('#field-grid-size').value);
    const scaleObstacles = this.modal.querySelector('#field-scale-obstacles').checked;
    const showBgCb = this.modal.querySelector('#field-show-bg-image');
    const opacitySlider = this.modal.querySelector('#field-bg-opacity');

    if (showBgCb) this.field.showBgImage = showBgCb.checked;
    if (opacitySlider) this.field.bgImageOpacity = parseFloat(opacitySlider.value);

    const oldW = this.field.widthMeters;
    const oldL = this.field.lengthMeters;

    this.field.updateDimensions(width, length, shape, unit);
    this.field.gridSizeMeters = gridSize;

    if (scaleObstacles && oldW > 0 && oldL > 0 && (width !== oldW || length !== oldL)) {
      const scaleX = width / oldW;
      const scaleY = length / oldL;
      this.canvasEngine.obstacles.forEach(obs => {
        obs.x *= scaleX;
        obs.y *= scaleY;
      });

      if (this.canvasEngine.pathModel && this.canvasEngine.pathModel.segmentControlNodes) {
        const segNodes = this.canvasEngine.pathModel.segmentControlNodes;
        Object.keys(segNodes).forEach(key => {
          if (Array.isArray(segNodes[key])) {
            segNodes[key].forEach(node => {
              node.x *= scaleX;
              node.y *= scaleY;
            });
          }
        });
      }
    }

    this.historyManager.push(this.canvasEngine.getSnapshot());
    this.canvasEngine.render();
    this.hide();
  }

  _bindEvents() {
    // Key Esc listener
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.modal.classList.contains('active')) {
        this.hide();
      }
    });
  }
}
