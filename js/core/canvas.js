/**
 * Main Canvas Core Engine for Agility Course Designer
 * Handles pan, zoom, grid rendering, mouse/touch events, selection, drag-and-drop, and measuring tape.
 */
import { ObstacleRenderer } from '../renderers/ObstacleRenderer.js';
import { PathRenderer } from '../renderers/PathRenderer.js';
import { Obstacle } from '../models/Obstacle.js';
import { distance, formatDistance } from './math.js';

export class CanvasEngine {
  constructor(canvasElement, field, pathModel, historyManager) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d');
    this.field = field;
    this.pathModel = pathModel;
    this.historyManager = historyManager;

    this.obstacles = [];
    this.selectedObstacles = [];

    // Viewport transform (Pan & Zoom)
    this.panX = 40;
    this.panY = 60;
    this.zoom = 1.0;

    // Interactive modes
    this.mode = 'select'; // 'select', 'measure', 'pan'
    this.measureStart = null;
    this.measureEnd = null;

    // Mouse Dragging State
    this.isDragging = false;
    this.dragStartPoint = { x: 0, y: 0 };
    this.isTransforming = false;
    this.transformType = null; // 'move', 'rotate', 'scale'

    // Callbacks
    this.onSelectionChange = null;
    this.onObstacleChange = null;

    this._initEvents();
    this.resizeCanvas();
  }

  resizeCanvas() {
    const parent = this.canvas.parentElement;
    const rect = parent.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;

    this.ctx.scale(dpr, dpr);
    this.render();
  }

  setObstacles(obsList) {
    this.obstacles = obsList;
    this.render();
  }

  addObstacle(obs) {
    this.obstacles.push(obs);
    this.selectObstacle(obs);
    this.historyManager.push(this.getSnapshot());
    this.render();
  }

  selectObstacle(obs, addToSelection = false) {
    if (!addToSelection) {
      this.obstacles.forEach(o => (o.isSelected = false));
      this.selectedObstacles = [];
    }

    if (obs) {
      obs.isSelected = true;
      if (!this.selectedObstacles.includes(obs)) {
        this.selectedObstacles.push(obs);
      }
    }

    if (typeof this.onSelectionChange === 'function') {
      this.onSelectionChange(this.selectedObstacles);
    }
    this.render();
  }

  clearSelection() {
    this.obstacles.forEach(o => (o.isSelected = false));
    this.selectedObstacles = [];
    if (typeof this.onSelectionChange === 'function') {
      this.onSelectionChange([]);
    }
    this.render();
  }

  deleteSelected() {
    if (this.selectedObstacles.length === 0) return;
    this.obstacles = this.obstacles.filter(o => !this.selectedObstacles.includes(o));
    this.clearSelection();
    this.historyManager.push(this.getSnapshot());
    this.render();
  }

  duplicateSelected() {
    if (this.selectedObstacles.length === 0) return;
    const newItems = [];
    this.selectedObstacles.forEach(obs => {
      const dup = Obstacle.fromJSON(obs.toJSON());
      dup.id = `obs_${Date.now()}_${Math.random()}`;
      dup.x += 1.5; // Offset by 1.5 meters
      dup.y += 1.5;
      if (dup.seq) dup.seq += 1;
      this.obstacles.push(dup);
      newItems.push(dup);
    });

    this.clearSelection();
    newItems.forEach(item => this.selectObstacle(item, true));
    this.historyManager.push(this.getSnapshot());
    this.render();
  }

  getSnapshot() {
    return {
      field: this.field.toJSON(),
      obstacles: this.obstacles.map(o => o.toJSON())
    };
  }

  loadSnapshot(snapshot) {
    if (!snapshot) return;
    this.field.fromJSON(snapshot.field, () => this.render());
    this.obstacles = (snapshot.obstacles || []).map(o => Obstacle.fromJSON(o));
    this.clearSelection();
    this.render();
  }

  // --- Screen <-> Field Coordinates Conversion ---

  screenToField(screenX, screenY) {
    const rect = this.canvas.getBoundingClientRect();
    const clientX = screenX - rect.left;
    const clientY = screenY - rect.top;

    const canvasX = (clientX - this.panX) / this.zoom;
    const canvasY = (clientY - this.panY) / this.zoom;

    return {
      x: this.field.toMeters(canvasX),
      y: this.field.toMeters(canvasY)
    };
  }

  fieldToScreen(fieldX, fieldY) {
    const canvasX = this.field.toPixels(fieldX);
    const canvasY = this.field.toPixels(fieldY);

    return {
      x: canvasX * this.zoom + this.panX,
      y: canvasY * this.zoom + this.panY
    };
  }

  // --- Main Render Loop ---

  render() {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    // Update HUD Text Overlays if elements exist
    const fieldDimEl = document.getElementById('hud-field-dim');
    if (fieldDimEl) {
      fieldDimEl.textContent = `${this.field.widthMeters}${this.field.unit} × ${this.field.lengthMeters}${this.field.unit} (${this.field.shape.toUpperCase()})`;
    }

    const rulerTextEl = document.getElementById('scale-ruler-text');
    if (rulerTextEl) {
      const scaleMeterPx = this.field.toPixels(1) * this.zoom;
      rulerTextEl.textContent = `1 ${this.field.unit} = ${Math.round(scaleMeterPx)}px`;
      const rulerBar = document.querySelector('.ruler-bar');
      if (rulerBar) {
        rulerBar.style.width = `${Math.min(120, Math.max(30, scaleMeterPx))}px`;
      }
    }

    this.ctx.clearRect(0, 0, w, h);

    // Apply Viewport Pan & Zoom Transform
    this.ctx.save();
    this.ctx.translate(this.panX, this.panY);
    this.ctx.scale(this.zoom, this.zoom);

    // 1. Render Agility Ring / Field Surface
    this._renderFieldSurface();

    // 2. Render Grid & Ruler Markers
    if (this.field.showGrid) {
      this._renderGrid();
    }

    // 3. Render Dog Trajectory & Sequence Splines
    PathRenderer.render(this.ctx, this.pathModel, this.obstacles, this.field);

    // 4. Render All Agility Equipment / Obstacles
    this.obstacles.forEach(obs => {
      ObstacleRenderer.render(this.ctx, obs, this.field);
    });

    // 5. Render Interactive Measuring Tape
    if (this.mode === 'measure' && this.measureStart && this.measureEnd) {
      this._renderMeasuringTape();
    }

    this.ctx.restore();
  }

  _renderFieldSurface() {
    const poly = this.field.getBoundaryPolygon();
    if (poly.length === 0) return;

    this.ctx.save();

    // Field Turf Fill (lush emerald gradient or dark slate mode)
    const fieldW = this.field.toPixels(this.field.widthMeters);
    const fieldH = this.field.toPixels(this.field.lengthMeters);

    const grad = this.ctx.createLinearGradient(0, 0, fieldW, fieldH);
    grad.addColorStop(0, '#064e3b'); // Dark emerald
    grad.addColorStop(1, '#022c22'); // Deep forest turf green

    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    poly.forEach((pt, i) => {
      const px = this.field.toPixels(pt.x);
      const py = this.field.toPixels(pt.y);
      if (i === 0) this.ctx.moveTo(px, py);
      else this.ctx.lineTo(px, py);
    });
    this.ctx.closePath();
    this.ctx.fill();

    // Embedded Course PNG Background Overlay Layer
    if (this.field.showBgImage && this.field.bgImage && this.field.bgImage.complete && this.field.bgImage.naturalWidth > 0) {
      this.ctx.save();
      this.ctx.beginPath();
      poly.forEach((pt, i) => {
        const px = this.field.toPixels(pt.x);
        const py = this.field.toPixels(pt.y);
        if (i === 0) this.ctx.moveTo(px, py);
        else this.ctx.lineTo(px, py);
      });
      this.ctx.closePath();
      this.ctx.clip();

      this.ctx.globalAlpha = this.field.bgImageOpacity !== undefined ? this.field.bgImageOpacity : 0.6;
      this.ctx.drawImage(this.field.bgImage, 0, 0, fieldW, fieldH);
      this.ctx.restore();
    }

    // Outer Ring Safety Boundary line (High-visibility white/yellow dashed line)
    this.ctx.strokeStyle = '#facc15';
    this.ctx.lineWidth = 3;
    this.ctx.setLineDash([12, 8]);
    this.ctx.stroke();

    this.ctx.restore();
  }

  _renderGrid() {
    const wPx = this.field.toPixels(this.field.widthMeters);
    const hPx = this.field.toPixels(this.field.lengthMeters);
    const stepPx = this.field.toPixels(this.field.gridSizeMeters);

    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    this.ctx.lineWidth = 1;

    // Vertical grid lines & scale meter labels
    for (let x = 0; x <= wPx; x += stepPx) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, hPx);
      this.ctx.stroke();

      // Meter labels along top edge
      const mVal = this.field.toMeters(x);
      if (mVal % 5 === 0) {
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        this.ctx.font = '10px Inter, sans-serif';
        this.ctx.fillText(`${mVal}${this.field.unit}`, x + 2, -6);
      }
    }

    // Horizontal grid lines & labels
    for (let y = 0; y <= hPx; y += stepPx) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(wPx, y);
      this.ctx.stroke();

      const mVal = this.field.toMeters(y);
      if (mVal % 5 === 0) {
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        this.ctx.font = '10px Inter, sans-serif';
        this.ctx.fillText(`${mVal}${this.field.unit}`, -22, y + 3);
      }
    }

    this.ctx.restore();
  }

  _renderMeasuringTape() {
    const p1 = { x: this.field.toPixels(this.measureStart.x), y: this.field.toPixels(this.measureStart.y) };
    const p2 = { x: this.field.toPixels(this.measureEnd.x), y: this.field.toPixels(this.measureEnd.y) };

    const distMeters = distance(this.measureStart, this.measureEnd);
    const distText = formatDistance(distMeters, this.field.unit);

    this.ctx.save();
    this.ctx.strokeStyle = '#f43f5e'; // Bright rose
    this.ctx.lineWidth = 2.5;
    this.ctx.setLineDash([6, 4]);

    this.ctx.beginPath();
    this.ctx.moveTo(p1.x, p1.y);
    this.ctx.lineTo(p2.x, p2.y);
    this.ctx.stroke();

    // Measurement badge in center
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;

    this.ctx.fillStyle = '#f43f5e';
    this.ctx.beginPath();
    this.ctx.arc(p1.x, p1.y, 4, 0, Math.PI * 2);
    this.ctx.arc(p2.x, p2.y, 4, 0, Math.PI * 2);
    this.ctx.fill();

    ctxBadge(this.ctx, midX, midY, distText);

    this.ctx.restore();
  }

  // --- Event Handling ---

  _initEvents() {
    window.addEventListener('resize', () => this.resizeCanvas());

    this.canvas.addEventListener('mousedown', e => this._onMouseDown(e));
    this.canvas.addEventListener('mousemove', e => this._onMouseMove(e));
    window.addEventListener('mouseup', e => this._onMouseUp(e));
    this.canvas.addEventListener('wheel', e => this._onWheel(e), { passive: false });

    // Touch support
    this.canvas.addEventListener('touchstart', e => this._onTouchStart(e), { passive: false });
    this.canvas.addEventListener('touchmove', e => this._onTouchMove(e), { passive: false });
    this.canvas.addEventListener('touchend', e => this._onTouchEnd(e));
  }

  _onMouseDown(e) {
    if (e.button === 1 || e.spaceKey || this.mode === 'pan') {
      this.isPanning = true;
      this.lastMouse = { x: e.clientX, y: e.clientY };
      return;
    }

    const pos = this.screenToField(e.clientX, e.clientY);

    if (this.mode === 'measure') {
      this.measureStart = pos;
      this.measureEnd = pos;
      this.render();
      return;
    }

    // Check hit obstacle
    const hitObs = [...this.obstacles].reverse().find(o => o.containsPoint(pos.x, pos.y));

    if (hitObs) {
      if (!hitObs.isSelected && !e.shiftKey) {
        this.selectObstacle(hitObs);
      } else if (e.shiftKey) {
        this.selectObstacle(hitObs, true);
      }

      this.isDragging = true;
      this.dragStartPoint = pos;
    } else {
      if (!e.shiftKey) {
        this.clearSelection();
      }
    }
  }

  _onMouseMove(e) {
    if (this.isPanning) {
      const dx = e.clientX - this.lastMouse.x;
      const dy = e.clientY - this.lastMouse.y;
      this.panX += dx;
      this.panY += dy;
      this.lastMouse = { x: e.clientX, y: e.clientY };
      this.render();
      return;
    }

    const pos = this.screenToField(e.clientX, e.clientY);

    if (this.mode === 'measure' && this.measureStart) {
      this.measureEnd = pos;
      this.render();
      return;
    }

    if (this.isDragging && this.selectedObstacles.length > 0) {
      const dx = pos.x - this.dragStartPoint.x;
      const dy = pos.y - this.dragStartPoint.y;

      this.selectedObstacles.forEach(obs => {
        obs.x += dx;
        obs.y += dy;
        if (this.field.snapToGrid) {
          obs.x = this.field.snap(obs.x);
          obs.y = this.field.snap(obs.y);
        }
      });

      this.dragStartPoint = pos;
      if (typeof this.onObstacleChange === 'function') {
        this.onObstacleChange(this.selectedObstacles[0]);
      }
      this.render();
    }
  }

  _onMouseUp(e) {
    if (this.isPanning) {
      this.isPanning = false;
    }

    if (this.isDragging) {
      this.isDragging = false;
      this.historyManager.push(this.getSnapshot());
    }

    if (this.mode === 'measure' && this.measureStart) {
      // Finished measuring
    }
  }

  _onWheel(e) {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.min(Math.max(0.3, this.zoom * zoomFactor), 4.0);

    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    this.panX = mouseX - (mouseX - this.panX) * (newZoom / this.zoom);
    this.panY = mouseY - (mouseY - this.panY) * (newZoom / this.zoom);
    this.zoom = newZoom;

    this.render();
  }

  _onTouchStart(e) {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      this._onMouseDown({ clientX: touch.clientX, clientY: touch.clientY, button: 0 });
    }
  }

  _onTouchMove(e) {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      this._onMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
    }
  }

  _onTouchEnd() {
    this._onMouseUp({});
  }
}

function ctxBadge(ctx, x, y, text) {
  ctx.save();
  ctx.font = 'bold 12px Inter, sans-serif';
  const tw = ctx.measureText(text).width;

  ctx.fillStyle = '#1e293b';
  ctx.strokeStyle = '#f43f5e';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x - tw / 2 - 8, y - 12, tw + 16, 24, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}
