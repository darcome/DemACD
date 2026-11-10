/**
 * Export & Save Modal Component for Agility Course Designer
 */
export class ExportModal {
  constructor(modalEl, canvasEngine, pathModel, babylonEngine = null) {
    this.modal = modalEl;
    this.canvasEngine = canvasEngine;
    this.pathModel = pathModel;
    this.babylonEngine = babylonEngine;
  }

  show() {
    this._render();
    this.modal.classList.add('active');
  }

  hide() {
    this.modal.classList.remove('active');
  }

  _render() {
    const totalDistStr = this.pathModel.getFormattedDistance(this.canvasEngine.obstacles, this.canvasEngine.field.unit);
    const obsCount = this.canvasEngine.obstacles.length;
    const steps = typeof this.pathModel.getSequencedSteps === 'function' ? this.pathModel.getSequencedSteps(this.canvasEngine.obstacles) : this.pathModel.getSequencedObstacles(this.canvasEngine.obstacles);
    const sequencedCount = steps.length;

    this.modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-dialog">
        <div class="modal-header">
          <h3><i class="fa-solid fa-file-export"></i> Export Agility Course Map & Summary</h3>
          <button class="close-modal-btn">&times;</button>
        </div>
        
        <div class="modal-body">
          
          <div class="stats-summary-box">
            <div class="stat-item">
              <div class="stat-val">${obsCount}</div>
              <div class="stat-lbl">Total Obstacles</div>
            </div>
            <div class="stat-item">
              <div class="stat-val">${sequencedCount}</div>
              <div class="stat-lbl">Sequenced Jumps</div>
            </div>
            <div class="stat-item">
              <div class="stat-val">${totalDistStr}</div>
              <div class="stat-lbl">Estimated Run Length</div>
            </div>
          </div>

          <div class="export-options-grid">
            
            <div class="export-card" id="btn-export-png">
              <div class="export-icon"><i class="fa-solid fa-image"></i></div>
              <div class="export-title">Download High-Res PNG</div>
              <div class="export-desc">Export canvas ring layout as a clean image for printing or publishing.</div>
            </div>

            <div class="export-card" id="btn-export-json">
              <div class="export-icon"><i class="fa-solid fa-file-code"></i></div>
              <div class="export-title">Save Course File (.json)</div>
              <div class="export-desc">Save editable layout JSON file to load and modify later.</div>
            </div>

            <div class="export-card" id="btn-export-glb">
              <div class="export-icon" style="color: var(--accent-blue);"><i class="fa-solid fa-cube"></i></div>
              <div class="export-title">Export 3D Model (.glb)</div>
              <div class="export-desc">Download 3D scene with obstacles, terrain, and trajectory path.</div>
            </div>

            <div class="export-card" id="btn-import-json">
              <div class="export-icon"><i class="fa-solid fa-folder-open"></i></div>
              <div class="export-title">Load Course File (.json)</div>
              <div class="export-desc">Open an existing saved agility course JSON file.</div>
              <input type="file" id="json-file-input" accept=".json" style="display: none;">
            </div>

            <div class="export-card" id="btn-print-summary">
              <div class="export-icon"><i class="fa-solid fa-print"></i></div>
              <div class="export-title">Print Course Map / PDF</div>
              <div class="export-desc">Print judge map sheet with field scale, grid, and obstacle list.</div>
            </div>

          </div>

        </div>

        <div class="modal-footer">
          <button class="sec-btn close-modal-btn">Close</button>
        </div>
      </div>
    `;

    this._bindEvents();
  }

  _bindEvents() {
    this.modal.querySelector('.close-modal-btn').addEventListener('click', () => this.hide());
    this.modal.querySelector('.modal-backdrop').addEventListener('click', () => this.hide());

    // Export PNG
    this.modal.querySelector('#btn-export-png').addEventListener('click', () => {
      this._downloadPNG();
    });

    // Save JSON
    this.modal.querySelector('#btn-export-json').addEventListener('click', () => {
      this._saveJSON();
    });

    // Export GLB
    const glbCard = this.modal.querySelector('#btn-export-glb');
    glbCard?.addEventListener('click', async () => {
      const engine = this.babylonEngine || (window.agilityApp ? window.agilityApp.babylonEngine : null);
      if (!engine) {
        alert('3D Babylon Engine is not available.');
        return;
      }
      const titleEl = glbCard.querySelector('.export-title');
      const origTitle = titleEl ? titleEl.innerHTML : '';
      try {
        glbCard.style.pointerEvents = 'none';
        if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Exporting .GLB...';
        engine.updateScene(this.canvasEngine.field, this.canvasEngine.obstacles, this.pathModel);
        await engine.exportGLB(`Agility_Course_3D_${Date.now()}`);
        if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-check" style="color: var(--accent-emerald);"></i> Exported .GLB!';
        setTimeout(() => {
          if (titleEl) titleEl.innerHTML = origTitle;
          glbCard.style.pointerEvents = 'auto';
          this.hide();
        }, 1000);
      } catch (err) {
        console.error("GLB Export error:", err);
        alert(`Failed to export GLB: ${err.message || err}`);
        if (titleEl) titleEl.innerHTML = origTitle;
        glbCard.style.pointerEvents = 'auto';
      }
    });

    // Load JSON
    const importBtn = this.modal.querySelector('#btn-import-json');
    const fileInput = this.modal.querySelector('#json-file-input');

    importBtn.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = evt => {
        try {
          const snapshot = JSON.parse(evt.target.result);
          this.canvasEngine.loadSnapshot(snapshot);
          this.hide();
        } catch (err) {
          alert('Invalid course file format.');
        }
      };
      reader.readAsText(file);
    });

    // Print
    this.modal.querySelector('#btn-print-summary').addEventListener('click', () => {
      window.print();
    });
  }

  _downloadPNG() {
    // Re-render canvas crisp and generate blob
    this.canvasEngine.render();
    const link = document.createElement('a');
    link.download = `Agility_Course_Map_${Date.now()}.png`;
    link.href = this.canvasEngine.canvas.toDataURL('image/png');
    link.click();
  }

  _saveJSON() {
    const snapshot = this.canvasEngine.getSnapshot();
    const jsonStr = JSON.stringify(snapshot, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.download = `Agility_Course_${Date.now()}.json`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }
}
