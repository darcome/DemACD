/**
 * Field Model for Agility Course Designer
 * Manages field geometry, dimensions, scale factors, and boundary rendering.
 */
import { FIELD_SHAPES, DEFAULT_FIELD } from '../config.js';

export class Field {
  constructor(config = {}) {
    this.shape = config.shape || DEFAULT_FIELD.shape;
    this.widthMeters = config.widthMeters || DEFAULT_FIELD.widthMeters; // e.g. 40m X-axis
    this.lengthMeters = config.lengthMeters || DEFAULT_FIELD.lengthMeters; // e.g. 20m Y-axis
    this.gridSizeMeters = config.gridSizeMeters || DEFAULT_FIELD.gridSizeMeters;
    this.showGrid = config.showGrid !== undefined ? config.showGrid : DEFAULT_FIELD.showGrid;
    this.snapToGrid = config.snapToGrid !== undefined ? config.snapToGrid : DEFAULT_FIELD.snapToGrid;
    this.unit = config.unit || DEFAULT_FIELD.unit; // 'm' or 'ft'
    
    // Background Image Layer Settings
    this.bgImageDataUrl = config.bgImageDataUrl || null;
    this.bgImageOpacity = config.bgImageOpacity !== undefined ? config.bgImageOpacity : 0.6;
    this.showBgImage = config.showBgImage !== undefined ? config.showBgImage : true;
    this.bgImage = null;
    if (this.bgImageDataUrl) {
      this.setBgImage(this.bgImageDataUrl);
    }
  }

  setBgImage(dataUrl, callback) {
    if (!dataUrl) {
      this.bgImageDataUrl = null;
      this.bgImage = null;
      if (typeof callback === 'function') callback();
      return;
    }
    this.bgImageDataUrl = dataUrl;
    const img = new Image();
    img.onload = () => {
      this.bgImage = img;
      if (typeof callback === 'function') callback();
    };
    img.src = dataUrl;
  }

  updateDimensions(width, length, shape = this.shape, unit = this.unit) {
    this.widthMeters = Math.max(5, width);
    this.lengthMeters = Math.max(5, length);
    this.shape = shape;
    this.unit = unit;
  }

  // Convert meters to canvas pixels
  toPixels(meters) {
    return meters * this.pixelsPerMeter;
  }

  // Convert canvas pixels to field meters
  toMeters(pixels) {
    return pixels / this.pixelsPerMeter;
  }

  snap(valMeters) {
    if (!this.snapToGrid) return valMeters;
    return Math.round(valMeters / this.gridSizeMeters) * this.gridSizeMeters;
  }

  snapPoint(p) {
    return {
      x: this.snap(p.x),
      y: this.snap(p.y)
    };
  }

  /**
   * Get field polygon boundary points in meters relative to (0,0) top-left
   */
  getBoundaryPolygon() {
    const w = this.widthMeters;
    const h = this.lengthMeters;

    switch (this.shape) {
      case FIELD_SHAPES.L_SHAPE:
        // L-shaped field (top-right cutout)
        return [
          { x: 0, y: 0 },
          { x: w * 0.6, y: 0 },
          { x: w * 0.6, y: h * 0.5 },
          { x: w, y: h * 0.5 },
          { x: w, y: h },
          { x: 0, y: h }
        ];

      case FIELD_SHAPES.OCTAGON:
        // Cut corners (15% bevel)
        const bx = w * 0.15;
        const by = h * 0.15;
        return [
          { x: bx, y: 0 },
          { x: w - bx, y: 0 },
          { x: w, y: by },
          { x: w, y: h - by },
          { x: w - bx, y: h },
          { x: bx, y: h },
          { x: 0, y: h - by },
          { x: 0, y: by }
        ];

      case FIELD_SHAPES.RECTANGLE:
      default:
        return [
          { x: 0, y: 0 },
          { x: w, y: 0 },
          { x: w, y: h },
          { x: 0, y: h }
        ];
    }
  }

  toJSON() {
    return {
      shape: this.shape,
      widthMeters: this.widthMeters,
      lengthMeters: this.lengthMeters,
      gridSizeMeters: this.gridSizeMeters,
      showGrid: this.showGrid,
      snapToGrid: this.snapToGrid,
      unit: this.unit,
      bgImageDataUrl: this.bgImageDataUrl,
      bgImageOpacity: this.bgImageOpacity,
      showBgImage: this.showBgImage
    };
  }

  fromJSON(json, onLoadCallback) {
    if (!json) return;
    this.shape = json.shape || DEFAULT_FIELD.shape;
    this.widthMeters = json.widthMeters || DEFAULT_FIELD.widthMeters;
    this.lengthMeters = json.lengthMeters || DEFAULT_FIELD.lengthMeters;
    this.gridSizeMeters = json.gridSizeMeters || DEFAULT_FIELD.gridSizeMeters;
    this.showGrid = json.showGrid !== undefined ? json.showGrid : DEFAULT_FIELD.showGrid;
    this.snapToGrid = json.snapToGrid !== undefined ? json.snapToGrid : DEFAULT_FIELD.snapToGrid;
    this.unit = json.unit || DEFAULT_FIELD.unit;
    this.bgImageOpacity = json.bgImageOpacity !== undefined ? json.bgImageOpacity : 0.6;
    this.showBgImage = json.showBgImage !== undefined ? json.showBgImage : true;
    if (json.bgImageDataUrl) {
      this.setBgImage(json.bgImageDataUrl, onLoadCallback);
    } else {
      this.setBgImage(null);
      if (typeof onLoadCallback === 'function') onLoadCallback();
    }
  }
}
