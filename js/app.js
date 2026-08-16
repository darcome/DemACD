/**
 * Agility Course Designer - Standalone Bundle
 * Pure Vanilla JavaScript (Compatible with file:// protocol without CORS errors)
 */

(function () {
  'use strict';

  // --- 1. CONFIG & CONSTANTS ---

  const WRAP_DIRECTIONS = {
    NONE: 'none',             // Straight through
    LEFT: 'left',             // Frontside wrap left
    RIGHT: 'right',           // Frontside wrap right
    REVERSE_LEFT: 'rev_left', // Reverse / Backside wrap left (push left)
    REVERSE_RIGHT: 'rev_right'// Reverse / Backside wrap right (push right)
  };

  const FIELD_SHAPES = {
    RECTANGLE: 'rectangle',
    L_SHAPE: 'l_shape',
    OCTAGON: 'octagon',
    CUSTOM: 'custom'
  };

  const OBSTACLE_TYPES = {
    JUMP_SINGLE: 'jump_single',
    JUMP_DOUBLE: 'jump_double',
    JUMP_LONG: 'jump_long',
    JUMP_TIRE: 'jump_tire',
    JUMP_WALL: 'jump_wall',
    TUNNEL: 'tunnel',
    TUNNEL_3M: 'tunnel_3m',
    TUNNEL_4M: 'tunnel_4m',
    TUNNEL_5M: 'tunnel_5m',
    TUNNEL_6M: 'tunnel_6m',
    A_FRAME: 'a_frame',
    DOG_WALK: 'dog_walk',
    SEESAW: 'seesaw',
    WEAVE_6: 'weave_6',
    WEAVE_12: 'weave_12',
    START_FINISH: 'start_finish'
  };
  window.OBSTACLE_TYPES = OBSTACLE_TYPES;

  const OBSTACLE_DEFS = {
    [OBSTACLE_TYPES.JUMP_SINGLE]: {
      name: 'Single Jump',
      category: 'Jumps',
      widthMeters: 2,
      depthMeters: 0.5,
      icon: 'fa-grip-lines-vertical',
      color: '#3b82f6',
      hasWrap: true,
      description: 'Standard single bar jump with upright wings'
    },
    [OBSTACLE_TYPES.JUMP_DOUBLE]: {
      name: 'Double Jump',
      category: 'Jumps',
      widthMeters: 2,
      depthMeters: 0.8,
      icon: 'fa-align-justify',
      color: '#2563eb',
      hasWrap: true,
      description: 'Spread jump with two ascending bars'
    },
    [OBSTACLE_TYPES.JUMP_LONG]: {
      name: 'Long Jump',
      category: 'Jumps',
      widthMeters: 1.5,
      depthMeters: 1.2,
      icon: 'fa-equals',
      color: '#0284c7',
      hasWrap: false,
      description: 'Broad jump composed of 4-5 horizontal planks'
    },
    [OBSTACLE_TYPES.JUMP_TIRE]: {
      name: 'Tire Jump',
      category: 'Jumps',
      widthMeters: 1.3,
      depthMeters: 0.8,
      icon: 'fa-circle-notch',
      color: '#06b6d4',
      hasWrap: true,
      description: 'Circular tire mounted in a frame'
    },
    [OBSTACLE_TYPES.JUMP_WALL]: {
      name: 'Wall Jump',
      category: 'Jumps',
      widthMeters: 2,
      depthMeters: 0.4,
      icon: 'fa-monument',
      color: '#0891b2',
      hasWrap: true,
      description: 'Solid wall jump with removable towers'
    },
    [OBSTACLE_TYPES.TUNNEL_3M]: {
      name: 'Tunnel 3m',
      category: 'Tunnels',
      widthMeters: 0.6,
      lengthMeters: 3.0,
      icon: 'fa-ring',
      color: '#f59e0b',
      hasWrap: false,
      isFlexible: true,
      description: '3-meter flexible pipe tunnel bendable with 4 control nodes'
    },
    [OBSTACLE_TYPES.TUNNEL_4M]: {
      name: 'Tunnel 4m',
      category: 'Tunnels',
      widthMeters: 0.6,
      lengthMeters: 4.0,
      icon: 'fa-ring',
      color: '#f59e0b',
      hasWrap: false,
      isFlexible: true,
      description: '4-meter flexible pipe tunnel bendable with 4 control nodes'
    },
    [OBSTACLE_TYPES.TUNNEL_5M]: {
      name: 'Tunnel 5m',
      category: 'Tunnels',
      widthMeters: 0.6,
      lengthMeters: 5.0,
      icon: 'fa-ring',
      color: '#d97706',
      hasWrap: false,
      isFlexible: true,
      description: '5-meter flexible pipe tunnel bendable with 4 control nodes'
    },
    [OBSTACLE_TYPES.TUNNEL_6M]: {
      name: 'Tunnel 6m',
      category: 'Tunnels',
      widthMeters: 0.6,
      lengthMeters: 6.0,
      icon: 'fa-ring',
      color: '#b45309',
      hasWrap: false,
      isFlexible: true,
      description: '6-meter flexible pipe tunnel bendable with 4 control nodes'
    },
    [OBSTACLE_TYPES.A_FRAME]: {
      name: 'A-Frame',
      category: 'Contact Equipment',
      widthMeters: 1.1,
      lengthMeters: 4,
      icon: 'fa-caret-up',
      color: '#10b981',
      hasWrap: false,
      contactLengthMeters: 1,
      description: 'A-Frame contact obstacle with yellow touch zones'
    },
    [OBSTACLE_TYPES.DOG_WALK]: {
      name: 'Dog Walk',
      category: 'Contact Equipment',
      widthMeters: 0.3,
      lengthMeters: 10.8,
      icon: 'fa-ruler-horizontal',
      color: '#059669',
      hasWrap: false,
      contactLengthMeters: 0.9,
      description: 'Elevated dog walk with 3 ramps and contact zones'
    },
    [OBSTACLE_TYPES.SEESAW]: {
      name: 'Seesaw / Teeter',
      category: 'Contact Equipment',
      widthMeters: 0.3,
      lengthMeters: 3.6,
      icon: 'fa-balance-scale',
      color: '#047857',
      hasWrap: false,
      contactLengthMeters: 0.9,
      description: 'Pivoting teeter-totter with contact zones'
    },
    [OBSTACLE_TYPES.WEAVE_6]: {
      name: 'Weave Poles (6)',
      category: 'Weaves',
      widthMeters: 0.4,
      lengthMeters: 3.6,
      icon: 'fa-ellipsis-v',
      color: '#8b5cf6',
      hasWrap: false,
      poles: 6,
      description: '6 weave poles spaced 60cm apart'
    },
    [OBSTACLE_TYPES.WEAVE_12]: {
      name: 'Weave Poles (12)',
      category: 'Weaves',
      widthMeters: 0.4,
      lengthMeters: 7.2,
      icon: 'fa-grip-lines-vertical',
      color: '#7c3aed',
      hasWrap: false,
      poles: 12,
      description: '12 weave poles spaced 60cm apart'
    },
    [OBSTACLE_TYPES.START_FINISH]: {
      name: 'Start / Finish Gate',
      category: 'Other',
      widthMeters: 2.0,
      depthMeters: 0.4,
      icon: 'fa-flag-checkered',
      color: '#ef4444',
      hasWrap: false,
      description: 'Start or Finish timing markers / gate'
    }
  };

  const DEFAULT_FIELD = {
    shape: FIELD_SHAPES.RECTANGLE,
    widthMeters: 40,
    lengthMeters: 25,
    gridSizeMeters: 1.0,
    showGrid: true,
    snapToGrid: true,
    unit: 'm'
  };

  // --- 2. MATH UTILITIES ---

  function degToRad(deg) { return (deg * Math.PI) / 180; }
  function radToDeg(rad) { return (rad * 180) / Math.PI; }

  function distance(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.hypot(dx, dy);
  }

  function rotatePoint(p, center, angleDeg) {
    const rad = degToRad(angleDeg);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    return {
      x: center.x + (dx * cos - dy * sin),
      y: center.y + (dx * sin + dy * cos)
    };
  }

  function isPointInOrientedRect(px, py, cx, cy, width, height, angleDeg) {
    const unrotated = rotatePoint({ x: px, y: py }, { x: cx, y: cy }, -angleDeg);
    const halfW = width / 2;
    const halfH = height / 2;
    return (
      unrotated.x >= cx - halfW &&
      unrotated.x <= cx + halfW &&
      unrotated.y >= cy - halfH &&
      unrotated.y <= cy + halfH
    );
  }

  function formatDistance(valInMeters, unit = 'm') {
    if (unit === 'ft') {
      const feet = valInMeters * 3.28084;
      return `${feet.toFixed(1)} ft`;
    }
    return `${valInMeters.toFixed(1)} m`;
  }

  function formatSegmentDistance(valInMeters, unit = 'm') {
    if (unit === 'ft') {
      const feet = valInMeters * 3.28084;
      return `${feet.toFixed(1).replace('.', ',')} ft`;
    }
    return `${valInMeters.toFixed(2).replace('.', ',')}m`;
  }

  // --- 3. HISTORY MANAGER ---

  class HistoryManager {
    constructor(maxSize = 50) {
      this.undoStack = [];
      this.redoStack = [];
      this.maxSize = maxSize;
      this.onChangeCallback = null;
    }
    setOnChange(cb) { this.onChangeCallback = cb; }
    push(state) {
      const serialized = JSON.stringify(state);
      if (this.undoStack.length > 0 && this.undoStack[this.undoStack.length - 1] === serialized) return;
      this.undoStack.push(serialized);
      if (this.undoStack.length > this.maxSize) this.undoStack.shift();
      this.redoStack = [];
      this._notify();
    }
    undo(currentState) {
      if (!this.canUndo()) return null;
      this.redoStack.push(JSON.stringify(currentState));
      const prev = this.undoStack.pop();
      this._notify();
      return JSON.parse(prev);
    }
    redo(currentState) {
      if (!this.canRedo()) return null;
      this.undoStack.push(JSON.stringify(currentState));
      const next = this.redoStack.pop();
      this._notify();
      return JSON.parse(next);
    }
    canUndo() { return this.undoStack.length > 0; }
    canRedo() { return this.redoStack.length > 0; }
    clear() {
      this.undoStack = [];
      this.redoStack = [];
      this._notify();
    }
    _notify() {
      if (typeof this.onChangeCallback === 'function') {
        this.onChangeCallback({ canUndo: this.canUndo(), canRedo: this.canRedo() });
      }
    }
  }

  // --- 4. MODELS ---

  class Field {
    constructor(config = {}) {
      this.shape = config.shape || DEFAULT_FIELD.shape;
      this.widthMeters = config.widthMeters || DEFAULT_FIELD.widthMeters;
      this.lengthMeters = config.lengthMeters || DEFAULT_FIELD.lengthMeters;
      this.gridSizeMeters = config.gridSizeMeters || DEFAULT_FIELD.gridSizeMeters;
      this.showGrid = config.showGrid !== undefined ? config.showGrid : DEFAULT_FIELD.showGrid;
      this.snapToGrid = config.snapToGrid !== undefined ? config.snapToGrid : DEFAULT_FIELD.snapToGrid;
      this.unit = config.unit || DEFAULT_FIELD.unit;
      this.pixelsPerMeter = 25;

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
    updateDimensions(w, l, shape = this.shape, unit = this.unit) {
      this.widthMeters = Math.max(5, w);
      this.lengthMeters = Math.max(5, l);
      this.shape = shape;
      this.unit = unit;
    }
    toPixels(m) { return m * this.pixelsPerMeter; }
    toMeters(px) { return px / this.pixelsPerMeter; }
    snap(valM) {
      if (!this.snapToGrid) return valM;
      return Math.round(valM / this.gridSizeMeters) * this.gridSizeMeters;
    }
    getBoundaryPolygon() {
      const w = this.widthMeters;
      const h = this.lengthMeters;
      switch (this.shape) {
        case FIELD_SHAPES.L_SHAPE:
          return [
            { x: 0, y: 0 }, { x: w * 0.6, y: 0 }, { x: w * 0.6, y: h * 0.5 },
            { x: w, y: h * 0.5 }, { x: w, y: h }, { x: 0, y: h }
          ];
        case FIELD_SHAPES.OCTAGON:
          const bx = w * 0.15, by = h * 0.15;
          return [
            { x: bx, y: 0 }, { x: w - bx, y: 0 }, { x: w, y: by }, { x: w, y: h - by },
            { x: w - bx, y: h }, { x: bx, y: h }, { x: 0, y: h - by }, { x: 0, y: by }
          ];
        default:
          return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
      }
    }
    toJSON() {
      return {
        shape: this.shape, widthMeters: this.widthMeters, lengthMeters: this.lengthMeters,
        gridSizeMeters: this.gridSizeMeters, showGrid: this.showGrid, snapToGrid: this.snapToGrid, unit: this.unit,
        bgImageDataUrl: this.bgImageDataUrl, bgImageOpacity: this.bgImageOpacity, showBgImage: this.showBgImage
      };
    }
    fromJSON(j, onLoadCallback) {
      if (!j) return;
      this.shape = j.shape || DEFAULT_FIELD.shape;
      this.widthMeters = j.widthMeters || DEFAULT_FIELD.widthMeters;
      this.lengthMeters = j.lengthMeters || DEFAULT_FIELD.lengthMeters;
      this.gridSizeMeters = j.gridSizeMeters || DEFAULT_FIELD.gridSizeMeters;
      this.showGrid = j.showGrid !== undefined ? j.showGrid : DEFAULT_FIELD.showGrid;
      this.snapToGrid = j.snapToGrid !== undefined ? j.snapToGrid : DEFAULT_FIELD.snapToGrid;
      this.unit = j.unit || DEFAULT_FIELD.unit;
      this.bgImageOpacity = j.bgImageOpacity !== undefined ? j.bgImageOpacity : 0.6;
      this.showBgImage = j.showBgImage !== undefined ? j.showBgImage : true;
      if (j.bgImageDataUrl) {
        this.setBgImage(j.bgImageDataUrl, onLoadCallback);
      } else {
        this.setBgImage(null);
        if (typeof onLoadCallback === 'function') onLoadCallback();
      }
    }
  }

  // --- Waypoint Helpers for Local <-> World Coordinates ---
  function localToWorld(lx, ly, cx, cy, angleDeg) {
    const rad = degToRad(angleDeg);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
      x: cx + lx * cos - ly * sin,
      y: cy + lx * sin + ly * cos
    };
  }

  function worldToLocal(wx, wy, cx, cy, angleDeg) {
    const rad = degToRad(-(angleDeg || 0));
    const dx = wx - cx;
    const dy = wy - cy;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
      x: dx * cos - dy * sin,
      y: dx * sin + dy * cos
    };
  }

  let idCounter = 1;
  class Obstacle {
    constructor(type, xM = 0, yM = 0, options = {}) {
      this.id = options.id || `obs_${Date.now()}_${idCounter++}`;
      this.type = type;
      this.def = OBSTACLE_DEFS[type] || OBSTACLE_DEFS[OBSTACLE_TYPES.JUMP_SINGLE];
      this.x = xM;
      this.y = yM;
      this.rotation = options.rotation || 0;
      this.widthMeters = options.widthMeters || this.def.widthMeters;
      this.depthMeters = options.depthMeters || this.def.lengthMeters || this.def.depthMeters || 0.6;
      this.seq = options.seq !== undefined ? options.seq : null;
      this.wrap = options.wrap || WRAP_DIRECTIONS.NONE;
      this.curve = options.curve || 0;
      this.badgeAngleDeg = options.badgeAngleDeg !== undefined ? options.badgeAngleDeg : -135;
      this.isSelected = false;

      const isTunnelType = type === OBSTACLE_TYPES.TUNNEL || (typeof type === 'string' && type.startsWith('tunnel'));
      if (options.tunnelNodes && Array.isArray(options.tunnelNodes) && options.tunnelNodes.length === 3) {
        this.tunnelNodes = options.tunnelNodes.map(n => ({ x: n.x, y: n.y }));
      } else if (isTunnelType) {
        this.initTunnelNodes();
      }
    }

    getLengthMeters() {
      return (this.def && this.def.lengthMeters) ? this.def.lengthMeters : (this.depthMeters || 3.0);
    }

    initTunnelNodes() {
      const L = this.getLengthMeters();
      this.tunnelNodes = [
        { x: 0, y: -L / 2 },
        { x: 0, y: 0 },
        { x: 0, y: L / 2 }
      ];
    }

    resetTunnelCurve() {
      const defW = (this.def && this.def.widthMeters) ? this.def.widthMeters : 0.6;
      const L = this.getLengthMeters();
      this.widthMeters = defW;
      this.depthMeters = L;
      this.initTunnelNodes();
      this.curve = 0;
    }

    getTunnelWorldNodes() {
      if (!this.tunnelNodes || this.tunnelNodes.length !== 3) {
        this.initTunnelNodes();
      }
      return this.tunnelNodes.map(node =>
        localToWorld(node.x, node.y, this.x, this.y, this.rotation)
      );
    }

    getTunnelBoundingBox() {
      const isTunnelType = this.type === OBSTACLE_TYPES.TUNNEL || (typeof this.type === 'string' && this.type.startsWith('tunnel'));
      if (!isTunnelType) {
        return { widthMeters: this.widthMeters, depthMeters: this.depthMeters };
      }
      const localSpline = this.getTunnelLocalSplinePoints(30);
      let minLX = Infinity, maxLX = -Infinity, minLY = Infinity, maxLY = -Infinity;
      localSpline.forEach(pt => {
        if (pt.x < minLX) minLX = pt.x;
        if (pt.x > maxLX) maxLX = pt.x;
        if (pt.y < minLY) minLY = pt.y;
        if (pt.y > maxLY) maxLY = pt.y;
      });

      const diameter = (this.def && this.def.widthMeters) ? this.def.widthMeters : 0.6;
      return {
        widthMeters: Math.max(diameter, (maxLX - minLX) + diameter),
        depthMeters: Math.max(this.getLengthMeters(), (maxLY - minLY) + diameter)
      };
    }

    moveTunnelNode(nodeIdx, worldX, worldY) {
      if (!this.tunnelNodes || this.tunnelNodes.length !== 3) {
        this.initTunnelNodes();
      }

      const L = this.getLengthMeters();
      const targetSegLen = L / 2;

      // 1. Convert current tunnel nodes to world coordinates
      const worldNodes = this.tunnelNodes.map(node =>
        localToWorld(node.x, node.y, this.x, this.y, this.rotation)
      );

      // 2. Update dragged node position
      worldNodes[nodeIdx] = { x: worldX, y: worldY };

      const fixDistance = (pFix, pAdj, reqDist) => {
        const dx = pAdj.x - pFix.x;
        const dy = pAdj.y - pFix.y;
        let d = Math.hypot(dx, dy);
        if (d < 0.0001) {
          return { x: pFix.x, y: pFix.y + reqDist };
        }
        return {
          x: pFix.x + (dx / d) * reqDist,
          y: pFix.y + (dy / d) * reqDist
        };
      };

      // 3. Relax segment lengths in world space
      if (nodeIdx === 1) {
        worldNodes[0] = fixDistance(worldNodes[1], worldNodes[0], targetSegLen);
        worldNodes[2] = fixDistance(worldNodes[1], worldNodes[2], targetSegLen);
      } else if (nodeIdx === 0) {
        worldNodes[1] = fixDistance(worldNodes[0], worldNodes[1], targetSegLen);
        worldNodes[2] = fixDistance(worldNodes[1], worldNodes[2], targetSegLen);
      } else if (nodeIdx === 2) {
        worldNodes[1] = fixDistance(worldNodes[2], worldNodes[1], targetSegLen);
        worldNodes[0] = fixDistance(worldNodes[1], worldNodes[0], targetSegLen);
      }

      // 4. Sample world curve points to compute true center of mass & bounding box
      const N0_loc = worldToLocal(worldNodes[0].x, worldNodes[0].y, this.x, this.y, this.rotation);
      const N1_loc = worldToLocal(worldNodes[1].x, worldNodes[1].y, this.x, this.y, this.rotation);
      const N2_loc = worldToLocal(worldNodes[2].x, worldNodes[2].y, this.x, this.y, this.rotation);

      const Cx = 2 * N1_loc.x - 0.5 * N0_loc.x - 0.5 * N2_loc.x;
      const Cy = 2 * N1_loc.y - 0.5 * N0_loc.y - 0.5 * N2_loc.y;

      const rawLocal = [];
      const samplesCount = 30;
      for (let i = 0; i <= samplesCount; i++) {
        const t = i / samplesCount;
        const mt = 1 - t;
        rawLocal.push({
          x: mt * mt * N0_loc.x + 2 * mt * t * Cx + t * t * N2_loc.x,
          y: mt * mt * N0_loc.y + 2 * mt * t * Cy + t * t * N2_loc.y
        });
      }

      const rawWorld = rawLocal.map(pt => localToWorld(pt.x, pt.y, this.x, this.y, this.rotation));
      let minWX = Infinity, maxWX = -Infinity, minWY = Infinity, maxWY = -Infinity;
      rawWorld.forEach(pt => {
        if (pt.x < minWX) minWX = pt.x;
        if (pt.x > maxWX) maxWX = pt.x;
        if (pt.y < minWY) minWY = pt.y;
        if (pt.y > maxWY) maxWY = pt.y;
      });

      const newCenterX = (minWX + maxWX) / 2;
      const newCenterY = (minWY + maxWY) / 2;

      // 5. Move obstacle origin (obs.x, obs.y) to true center of curved tunnel
      this.x = newCenterX;
      this.y = newCenterY;

      // 6. Convert worldNodes to local coordinates relative to updated (this.x, this.y)
      this.tunnelNodes = worldNodes.map(wn =>
        worldToLocal(wn.x, wn.y, this.x, this.y, this.rotation)
      );

      // 7. Ensure obstacle physical tube diameter remains fixed (0.6m) and length stays L
      const tunnelDiameter = (this.def && this.def.widthMeters) ? this.def.widthMeters : 0.6;
      this.widthMeters = tunnelDiameter;
      this.depthMeters = L;
    }

    getTunnelLocalSplinePoints(samplesCount = 30) {
      if (!this.tunnelNodes || this.tunnelNodes.length !== 3) {
        this.initTunnelNodes();
      }
      const N0 = this.tunnelNodes[0];
      const N1 = this.tunnelNodes[1];
      const N2 = this.tunnelNodes[2];

      const Cx = 2 * N1.x - 0.5 * N0.x - 0.5 * N2.x;
      const Cy = 2 * N1.y - 0.5 * N0.y - 0.5 * N2.y;

      const rawPts = [];
      for (let i = 0; i <= samplesCount; i++) {
        const t = i / samplesCount;
        const mt = 1 - t;
        const x = mt * mt * N0.x + 2 * mt * t * Cx + t * t * N2.x;
        const y = mt * mt * N0.y + 2 * mt * t * Cy + t * t * N2.y;
        rawPts.push({ x, y });
      }

      let currentLen = 0;
      const dists = [0];
      for (let i = 1; i <= samplesCount; i++) {
        const d = Math.hypot(rawPts[i].x - rawPts[i - 1].x, rawPts[i].y - rawPts[i - 1].y);
        currentLen += d;
        dists.push(currentLen);
      }

      const res = [];
      for (let i = 0; i <= samplesCount; i++) {
        const targetD = (i / samplesCount) * currentLen;
        let idx = 0;
        while (idx < samplesCount && dists[idx + 1] < targetD) {
          idx++;
        }
        if (idx >= samplesCount) {
          res.push({ ...rawPts[samplesCount] });
        } else {
          const segLen = dists[idx + 1] - dists[idx];
          const factor = segLen > 0.00001 ? (targetD - dists[idx]) / segLen : 0;
          res.push({
            x: rawPts[idx].x + factor * (rawPts[idx + 1].x - rawPts[idx].x),
            y: rawPts[idx].y + factor * (rawPts[idx + 1].y - rawPts[idx].y)
          });
        }
      }
      return res;
    }

    getTunnelSplinePoints(samplesCount = 30) {
      const localPts = this.getTunnelLocalSplinePoints(samplesCount);
      return localPts.map(pt => localToWorld(pt.x, pt.y, this.x, this.y, this.rotation));
    }

    getSeqArray() {
      if (this.seq === null || this.seq === undefined || this.seq === '') return [];
      if (Array.isArray(this.seq)) {
        return this.seq.map(n => parseInt(n)).filter(n => !isNaN(n) && n > 0);
      }
      if (typeof this.seq === 'number') {
        return this.seq > 0 ? [this.seq] : [];
      }
      if (typeof this.seq === 'string') {
        return this.seq.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0);
      }
      return [];
    }

    getSeqString() {
      return this.getSeqArray().join(', ');
    }

    hasSeq(num) {
      return this.getSeqArray().includes(num);
    }

    getBadgeWorldPosition() {
      const rx = Math.max(this.widthMeters / 2 + 0.8, 1.4);
      const ry = Math.max(this.depthMeters / 2 + 0.8, 1.4);
      const badgeRad = degToRad(this.badgeAngleDeg !== undefined ? this.badgeAngleDeg : -135);

      const localX = rx * Math.cos(badgeRad);
      const localY = ry * Math.sin(badgeRad);

      const rotRad = degToRad(this.rotation || 0);
      const cosR = Math.cos(rotRad);
      const sinR = Math.sin(rotRad);

      return {
        x: this.x + (localX * cosR - localY * sinR),
        y: this.y + (localX * sinR + localY * cosR)
      };
    }

    getBadgeAngleFromWorldPosition(worldX, worldY) {
      const rx = Math.max(this.widthMeters / 2 + 0.8, 1.4);
      const ry = Math.max(this.depthMeters / 2 + 0.8, 1.4);
      const rotRad = degToRad(-this.rotation || 0);
      const cosR = Math.cos(rotRad);
      const sinR = Math.sin(rotRad);

      const dx = worldX - this.x;
      const dy = worldY - this.y;

      const unrotX = dx * cosR - dy * sinR;
      const unrotY = dx * sinR + dy * cosR;

      const rad = Math.atan2(unrotY / ry, unrotX / rx);
      return Math.round(radToDeg(rad));
    }

    /**
     * Calculates ordered trajectory waypoints through this obstacle
     */
    getWaypoints(prevPt) {
      const halfW = this.widthMeters / 2;
      const halfD = this.depthMeters / 2;
      const centerWorld = localToWorld(0, 0, this.x, this.y, this.rotation);
      centerWorld.isCenter = true;

      const isTunnelType = this.type === OBSTACLE_TYPES.TUNNEL || (typeof this.type === 'string' && this.type.startsWith('tunnel'));
      const isWeaveType = (typeof this.type === 'string' && this.type.startsWith('weave')) || this.type === OBSTACLE_TYPES.WEAVE_6 || this.type === OBSTACLE_TYPES.WEAVE_12;

      // 1. Tunnels with 3-node spline (return Entry, Center, Exit)
      if (isTunnelType) {
        const worldNodes = this.getTunnelWorldNodes();
        const endA = worldNodes[0];
        const mid = worldNodes[1];
        const endB = worldNodes[2];

        if (prevPt) {
          if (distance(prevPt, endB) < distance(prevPt, endA)) {
            return [endB, mid, endA];
          }
        }
        return [endA, mid, endB];
      }

      // 2. Contact Equipment (A-Frame, Dog Walk, Seesaw, Weave Poles)
      if (isWeaveType || [OBSTACLE_TYPES.A_FRAME, OBSTACLE_TYPES.DOG_WALK, OBSTACLE_TYPES.SEESAW].includes(this.type)) {
        const endA = localToWorld(0, -halfD, this.x, this.y, this.rotation);
        const endB = localToWorld(0, +halfD, this.x, this.y, this.rotation);

        if (prevPt) {
          if (distance(prevPt, endB) < distance(prevPt, endA)) {
            return [endB, endA];
          }
        }
        return [endA, endB];
      }

      // 3. Jumps with Reverse Wrap (Backside Push)
      if (this.wrap === WRAP_DIRECTIONS.REVERSE_LEFT || this.wrap === WRAP_DIRECTIONS.REVERSE_RIGHT) {
        const isLeft = this.wrap === WRAP_DIRECTIONS.REVERSE_LEFT;
        const wingDir = isLeft ? -1 : 1;
        const wingWrapPt = localToWorld((halfW + 0.8) * wingDir, 0, this.x, this.y, this.rotation);
        return [wingWrapPt, centerWorld];
      }

      // 4. Standard Jumps, Start/Finish
      return [centerWorld];
    }

    containsPoint(px, py) {
      const isTunnelType = this.type === OBSTACLE_TYPES.TUNNEL || (typeof this.type === 'string' && this.type.startsWith('tunnel'));
      if (isTunnelType && this.tunnelNodes) {
        const worldNodes = this.getTunnelWorldNodes();
        if (worldNodes.some(n => Math.hypot(n.x - px, n.y - py) < (this.widthMeters / 2 + 0.6))) {
          return true;
        }
      }
      return isPointInOrientedRect(px, py, this.x, this.y, this.widthMeters + 0.3, this.depthMeters + 0.3, this.rotation);
    }
    toJSON() {
      return {
        id: this.id, type: this.type, x: this.x, y: this.y, rotation: this.rotation,
        widthMeters: this.widthMeters, depthMeters: this.depthMeters, seq: this.seq, wrap: this.wrap, curve: this.curve,
        badgeAngleDeg: this.badgeAngleDeg,
        tunnelNodes: this.tunnelNodes ? this.tunnelNodes.map(n => ({ x: n.x, y: n.y })) : undefined
      };
    }
    static fromJSON(j) {
      return new Obstacle(j.type, j.x, j.y, {
        id: j.id, rotation: j.rotation, widthMeters: j.widthMeters, depthMeters: j.depthMeters,
        seq: j.seq, wrap: j.wrap, curve: j.curve, badgeAngleDeg: j.badgeAngleDeg,
        tunnelNodes: j.tunnelNodes
      });
    }
  }

  class CoursePath {
    constructor() {
      this.showPath = true;
      this.showSequenceNumbers = true;
      this.showDirectionArrows = true;
      this.showControlNodes = true;
      this.showBadgePosMode = false; // Toggle for interactive sequence badge orbital positioning
      this.segmentControlNodes = {};
    }
    getSequencedSteps(obstacles) {
      const steps = [];
      (obstacles || []).forEach(obs => {
        const seqs = typeof obs.getSeqArray === 'function' ? obs.getSeqArray() : (Array.isArray(obs.seq) ? obs.seq : (obs.seq ? [obs.seq] : []));
        seqs.forEach(s => {
          if (typeof s === 'number' && s > 0) {
            steps.push({ seq: s, obstacle: obs });
          }
        });
      });
      return steps.sort((a, b) => a.seq - b.seq);
    }
    getSequencedObstacles(obstacles) {
      const steps = this.getSequencedSteps(obstacles);
      const seen = new Set();
      const result = [];
      steps.forEach(step => {
        if (!seen.has(step.obstacle.id)) {
          seen.add(step.obstacle.id);
          result.push(step.obstacle);
        }
      });
      return result;
    }
    autoSequence(obstacles) {
      let num = 1;
      obstacles.forEach(o => { o.seq = num++; });
      this.segmentControlNodes = {};
    }
    getSegmentNodes(obs1, obs2, seq1 = null, seq2 = null) {
      const key = (seq1 !== null && seq2 !== null) ? `${obs1.id}_s${seq1}_${obs2.id}_s${seq2}` : `${obs1.id}_${obs2.id}`;
      const v1 = obs1.getWaypoints();
      const v2 = obs2.getWaypoints();
      const startPt = v1[v1.length - 1];
      const endPt = v2[0];

      if (!this.segmentControlNodes[key] || this.segmentControlNodes[key].length === 0) {
        this.segmentControlNodes[key] = [
          {
            key, index: 0,
            x: startPt.x + 0.5 * (endPt.x - startPt.x),
            y: startPt.y + 0.5 * (endPt.y - startPt.y),
            isSegmentNode: true
          }
        ];
      } else if (this.segmentControlNodes[key].length > 1) {
        // Migration: keep only 1 control node per segment
        this.segmentControlNodes[key] = [this.segmentControlNodes[key][0]];
      }
      return this.segmentControlNodes[key];
    }
    getAllWaypoints(obstacles) {
      const steps = this.getSequencedSteps(obstacles);
      if (steps.length === 0) return [];

      let allPoints = [];

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const obs = step.obstacle;
        const prevPt = allPoints.length > 0 ? allPoints[allPoints.length - 1] : null;
        const waypts = obs.getWaypoints(prevPt);
        allPoints = allPoints.concat(waypts);

        if (i < steps.length - 1) {
          const nextStep = steps[i + 1];
          const nextObs = nextStep.obstacle;
          const segNodes = this.getSegmentNodes(obs, nextObs, step.seq, nextStep.seq);
          allPoints = allPoints.concat(segNodes);
        }
      }

      return allPoints;
    }
    getAllSegmentControlNodes(obstacles) {
      const steps = this.getSequencedSteps(obstacles);
      let allNodes = [];
      for (let i = 0; i < steps.length - 1; i++) {
        const segNodes = this.getSegmentNodes(steps[i].obstacle, steps[i + 1].obstacle, steps[i].seq, steps[i + 1].seq);
        allNodes = allNodes.concat(segNodes);
      }
      return allNodes;
    }
    resetSegmentNodes() {
      this.segmentControlNodes = {};
    }
    calculateTotalDistance(obstacles) {
      const allPoints = this.getAllWaypoints(obstacles);
      if (allPoints.length < 2) return 0;

      let dist = 0;
      for (let i = 0; i < allPoints.length - 1; i++) {
        dist += distance(allPoints[i], allPoints[i + 1]);
      }
      return dist;
    }
    getFormattedDistance(obstacles, unit = 'm') {
      return formatDistance(this.calculateTotalDistance(obstacles), unit);
    }
    toJSON() {
      return {
        showPath: this.showPath,
        showSequenceNumbers: this.showSequenceNumbers,
        showDirectionArrows: this.showDirectionArrows,
        showControlNodes: this.showControlNodes,
        showBadgePosMode: this.showBadgePosMode,
        segmentControlNodes: this.segmentControlNodes
      };
    }
    fromJSON(j) {
      if (!j) return;
      if (j.showPath !== undefined) this.showPath = j.showPath;
      if (j.showSequenceNumbers !== undefined) this.showSequenceNumbers = j.showSequenceNumbers;
      if (j.showDirectionArrows !== undefined) this.showDirectionArrows = j.showDirectionArrows;
      if (j.showControlNodes !== undefined) this.showControlNodes = j.showControlNodes;
      if (j.showBadgePosMode !== undefined) this.showBadgePosMode = j.showBadgePosMode;
      if (j.segmentControlNodes) {
        this.segmentControlNodes = j.segmentControlNodes;
      }
    }
  }

  // --- 5. RENDERERS ---

  class PathRenderer {
    static render(ctx, pathModel, obstacles, field) {
      if (!pathModel.showPath && !pathModel.showSequenceNumbers) return;
      const list = pathModel.getSequencedObstacles(obstacles);
      const allWaypoints = pathModel.getAllWaypoints(obstacles);

      if (allWaypoints.length === 0) return;

      // 1. Render Natural Dog Trajectory Path (True Smooth Catmull-Rom Spline)
      if (pathModel.showPath && allWaypoints.length >= 2) {
        ctx.save();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.shadowColor = 'rgba(56, 189, 248, 0.4)';
        ctx.shadowBlur = 6;

        ctx.beginPath();
        this._drawCatmullRomSpline(ctx, allWaypoints, field);
        ctx.stroke();

        // Render directional arrows along the path
        // if (pathModel.showDirectionArrows && allWaypoints.length >= 2) {
        //   ctx.setLineDash([]);
        //   for (let i = 0; i < allWaypoints.length - 1; i += 2) {
        //     const p1 = { x: field.toPixels(allWaypoints[i].x), y: field.toPixels(allWaypoints[i].y) };
        //     const p2 = { x: field.toPixels(allWaypoints[i + 1].x), y: field.toPixels(allWaypoints[i + 1].y) };
        //     this._renderPathArrow(ctx, p1, p2);
        //   }
        // }
        ctx.restore();
      }

      // 2. Render 3 Movable Control Nodes on Every Trajectory Segment (if showControlNodes is enabled)
      if (pathModel.showControlNodes) {
        const segNodes = pathModel.getAllSegmentControlNodes(obstacles);
        segNodes.forEach(node => {
          const px = field.toPixels(node.x);
          const py = field.toPixels(node.y);

          ctx.save();
          ctx.shadowColor = 'rgba(56, 189, 248, 0.9)';
          ctx.shadowBlur = 10;

          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;

          ctx.beginPath();
          ctx.arc(px, py, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

        //   // Node index label inside (1, 2, 3)
        //   ctx.shadowBlur = 0;
        //   ctx.fillStyle = '#0f172a';
        //   ctx.font = 'bold 9px sans-serif';
        //   ctx.textAlign = 'center';
        //   ctx.textBaseline = 'middle';
        //   ctx.fillText((node.index + 1).toString(), px, py);
          ctx.restore();
        });
      }

      // 3. Render Inter-Obstacle Segment Distances (e.g. "9,20m")
      const steps = pathModel.getSequencedSteps(obstacles);
      if (pathModel.showPath && steps.length >= 2) {
        for (let i = 0; i < steps.length - 1; i++) {
          const obs1 = steps[i].obstacle;
          const obs2 = steps[i + 1].obstacle;
          const segNodes = pathModel.getSegmentNodes(obs1, obs2, steps[i].seq, steps[i + 1].seq);
          const v1 = obs1.getWaypoints();
          const v2 = obs2.getWaypoints();

          const pts = [v1[v1.length - 1], ...segNodes, v2[0]];

          let distMeters = 0;
          for (let j = 0; j < pts.length - 1; j++) {
            distMeters += distance(pts[j], pts[j + 1]);
          }

          const midNode = (segNodes && segNodes.length > 0) ? segNodes[Math.floor(segNodes.length / 2)] : {
            x: (v1[v1.length - 1].x + v2[0].x) / 2,
            y: (v1[v1.length - 1].y + v2[0].y) / 2
          };
          if (!midNode) continue;
          const px = field.toPixels(midNode.x);
          const py = field.toPixels(midNode.y);

          const distStr = formatSegmentDistance(distMeters, field.unit);
          this._renderDistancePill(ctx, px, py + (pathModel.showControlNodes ? 18 : 0), distStr);
        }
      }

      // 4. Render Sequence Number Badges (1, 2, 3...)
      if (pathModel.showSequenceNumbers && list.length > 0) {
        list.forEach(obs => this._renderSequenceBadge(ctx, obs, field));
      }
    }

    static _renderDistancePill(ctx, px, py, text) {
      ctx.save();
      ctx.font = 'bold 10px sans-serif';
      const textMetrics = ctx.measureText(text);
      const padX = 7;
      const boxW = textMetrics.width + (padX * 2) - 4;
      const boxH = 16;
      const boxX = px - boxW / 2;
      const boxY = py - boxH / 2;

      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1;

      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(boxX, boxY, boxW, boxH, 9);
      } else {
        const r = 9;
        ctx.moveTo(boxX + r, boxY);
        ctx.arcTo(boxX + boxW, boxY, boxX + boxW, boxY + boxH, r);
        ctx.arcTo(boxX + boxW, boxY + boxH, boxX, boxY + boxH, r);
        ctx.arcTo(boxX, boxY + boxH, boxX, boxY, r);
        ctx.arcTo(boxX, boxY, boxX + boxW, boxY, r);
      }
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, px, py);
      ctx.restore();
    }

    /**
     * True Smooth Catmull-Rom Spline algorithm (Full tangents, zero sharp edges!)
     */
    static _drawCatmullRomSpline(ctx, points, field) {
      if (points.length < 2) return;
      const pts = points.map(p => ({ x: field.toPixels(p.x), y: field.toPixels(p.y) }));

      ctx.moveTo(pts[0].x, pts[0].y);

      if (pts.length === 2) {
        ctx.lineTo(pts[1].x, pts[1].y);
        return;
      }

      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = i > 0 ? pts[i - 1] : pts[i];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = i < pts.length - 2 ? pts[i + 2] : p2;

        // Full Catmull-Rom tangent vectors (/ 6) for silky-smooth C2 continuous curves!
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;

        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;

        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
      }
    }

    static _renderSequenceBadge(ctx, obs, field, isPosModeActive = false) {
      const bPos = obs.getBadgeWorldPosition();
      const badgeX = field.toPixels(bPos.x);
      const badgeY = field.toPixels(bPos.y);
      const obsPx = field.toPixels(obs.x);
      const obsPy = field.toPixels(obs.y);
      const rxPx = field.toPixels(Math.max(obs.widthMeters / 2 + 0.8, 1.4));
      const ryPx = field.toPixels(Math.max(obs.depthMeters / 2 + 0.8, 1.4));
      const obsRotRad = degToRad(obs.rotation || 0);

      ctx.save();

      // Render orbital ellipse guide line rotated to match obstacle orientation!
      if (isPosModeActive || obs.isSelected) {
        ctx.save();
        ctx.strokeStyle = isPosModeActive ? '#f59e0b' : '#38bdf8';
        ctx.lineWidth = isPosModeActive ? 1.8 : 1.2;
        ctx.setLineDash([5, 5]);
        ctx.shadowColor = isPosModeActive ? 'rgba(245, 158, 11, 0.4)' : 'rgba(56, 189, 248, 0.3)';
        ctx.shadowBlur = 6;

        ctx.beginPath();
        if (typeof ctx.ellipse === 'function') {
          ctx.ellipse(obsPx, obsPy, rxPx, ryPx, obsRotRad, 0, Math.PI * 2);
        } else {
          ctx.save();
          ctx.translate(obsPx, obsPy);
          ctx.rotate(obsRotRad);
          ctx.arc(0, 0, Math.max(rxPx, ryPx), 0, Math.PI * 2);
          ctx.restore();
        }
        ctx.stroke();
        ctx.restore();
      }

      const seqStr = typeof obs.getSeqString === 'function' ? obs.getSeqString() : (obs.seq ? obs.seq.toString() : '');
      if (!seqStr) return;

      const badgeRadius = Math.max(9, 6 + seqStr.length * 2.5);

      // Render Sequence Badge Circle / Pill
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = isPosModeActive ? '#f59e0b' : '#38bdf8';
      ctx.lineWidth = isPosModeActive ? 2.5 : 2.0;
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 6;

      ctx.beginPath();
      if (seqStr.length <= 2) {
        ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
      } else {
        const boxW = badgeRadius * 2.2;
        const boxH = 18;
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(badgeX - boxW / 2, badgeY - boxH / 2, boxW, boxH, 9);
        } else {
          ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
        }
      }
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(seqStr, badgeX, badgeY);
      ctx.restore();
    }
  }

  class ObstacleRenderer {
    static render(ctx, obstacle, field) {
      const px = field.toPixels(obstacle.x);
      const py = field.toPixels(obstacle.y);
      const wPx = field.toPixels(obstacle.widthMeters);
      const dPx = field.toPixels(obstacle.depthMeters);

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(degToRad(obstacle.rotation));

      switch (obstacle.type) {
        case OBSTACLE_TYPES.JUMP_SINGLE:
        case OBSTACLE_TYPES.JUMP_DOUBLE:
		case OBSTACLE_TYPES.JUMP_TIRE:
          this._renderJump(ctx, obstacle, wPx, dPx);
          break;
        case OBSTACLE_TYPES.JUMP_WALL:
		  this._renderWallJump(ctx, obstacle, wPx, dPx);
          break;
        case OBSTACLE_TYPES.JUMP_LONG:
          this._renderLongJump(ctx, obstacle, wPx, dPx);
          break;
        case OBSTACLE_TYPES.TUNNEL:
        case OBSTACLE_TYPES.TUNNEL_3M:
        case OBSTACLE_TYPES.TUNNEL_4M:
        case OBSTACLE_TYPES.TUNNEL_5M:
        case OBSTACLE_TYPES.TUNNEL_6M:
          this._renderTunnel(ctx, obstacle, wPx, dPx, field);
          break;
        case OBSTACLE_TYPES.A_FRAME:
          this._renderAFrame(ctx, obstacle, wPx, dPx, field);
          break;
        case OBSTACLE_TYPES.DOG_WALK:
          this._renderDogWalk(ctx, obstacle, wPx, dPx, field);
          break;
        case OBSTACLE_TYPES.SEESAW:
          this._renderSeesaw(ctx, obstacle, wPx, dPx, field);
          break;
        case OBSTACLE_TYPES.WEAVE_6:
        case OBSTACLE_TYPES.WEAVE_12:
          this._renderWeavePoles(ctx, obstacle, wPx, dPx, field);
          break;
        case OBSTACLE_TYPES.START_FINISH:
          this._renderStartFinish(ctx, obstacle, wPx, dPx);
          break;
        default:
          this._renderGenericBox(ctx, obstacle, wPx, dPx);
          break;
      }

      ctx.restore();

      if (obstacle.isSelected) {
        const isTunnel = obstacle.type === OBSTACLE_TYPES.TUNNEL || (typeof obstacle.type === 'string' && obstacle.type.startsWith('tunnel'));
        const bbox = (isTunnel && typeof obstacle.getTunnelBoundingBox === 'function')
          ? obstacle.getTunnelBoundingBox()
          : { widthMeters: obstacle.widthMeters, depthMeters: obstacle.depthMeters };

        const selW = field.toPixels(bbox.widthMeters);
        const selD = field.toPixels(bbox.depthMeters);

        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(degToRad(obstacle.rotation));
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        ctx.shadowColor = 'rgba(56, 189, 248, 0.6)';
        ctx.shadowBlur = 12;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(-selW / 2 - 8, -selD / 2 - 8, selW + 16, selD + 16);
        ctx.restore();

        this._renderSelectionHandles(ctx, px, py, selW, selD, obstacle.rotation);
      }
    }

    static _renderJump(ctx, obs, w, d) {
      const halfW = w / 2;
      const wingSize = 5;
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = obs.def.color;
      ctx.lineWidth = 1;
      ctx.fillRect(-halfW - wingSize, -wingSize / 2, wingSize, wingSize);
      ctx.strokeRect(-halfW - wingSize, -wingSize / 2, wingSize, wingSize);
      ctx.fillRect(halfW, -wingSize / 2, wingSize, wingSize);
      ctx.strokeRect(halfW, -wingSize / 2, wingSize, wingSize);

	  if (obs.type !== OBSTACLE_TYPES.JUMP_TIRE) {
		const barCount = obs.type === OBSTACLE_TYPES.JUMP_DOUBLE ? 2 : 1;
		const barSpacing = d / (barCount + 1);
		for (let i = 0; i < barCount; i++) {
			const yPos = -d / 2 + barSpacing * (i + 1);
			ctx.lineWidth = 2;
			ctx.strokeStyle = '#f8fafc';
			ctx.beginPath(); ctx.moveTo(-halfW, yPos); ctx.lineTo(halfW, yPos); ctx.stroke();
			ctx.strokeStyle = obs.def.color;
			ctx.setLineDash([10, 10]);
			ctx.beginPath(); ctx.moveTo(-halfW, yPos); ctx.lineTo(halfW, yPos); ctx.stroke();
			ctx.setLineDash([]);
		}
	  }

      if (obs.type === OBSTACLE_TYPES.JUMP_TIRE) {
        ctx.fillStyle = 'transparent'; ctx.strokeStyle = '#06b6d4'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }

	static _renderWallJump(ctx, obs, w, d) {
      const halfW = w / 2;
      const wingSize = 12;
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = obs.def.color;
      ctx.lineWidth = 2;
      ctx.fillRect(-halfW - wingSize, -wingSize / 2, wingSize, wingSize);
      ctx.strokeRect(-halfW - wingSize, -wingSize / 2, wingSize, wingSize);
      ctx.fillRect(halfW, -wingSize / 2, wingSize, wingSize);
      ctx.strokeRect(halfW, -wingSize / 2, wingSize, wingSize);

      const barCount =  1;
      const barSpacing = d / (barCount + 1);
      for (let i = 0; i < barCount; i++) {
        const yPos = -d / 2 + barSpacing * (i + 1);
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#f8fafc';
        ctx.beginPath(); ctx.moveTo(-halfW, yPos); ctx.lineTo(halfW, yPos); ctx.stroke();
        ctx.strokeStyle = obs.def.color;
        ctx.setLineDash([10, 10]);
        ctx.beginPath(); ctx.moveTo(-halfW, yPos); ctx.lineTo(halfW, yPos); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    static _renderLongJump(ctx, obs, w, d) {
      const halfW = w / 2, count = 4, step = d / count;
      for (let i = 0; i < count; i++) {
        const y = -d / 2 + i * step;
        ctx.fillStyle = i % 2 === 0 ? '#0284c7' : '#e0f2fe';
        ctx.fillRect(-halfW, y, w, step - 2);
        ctx.strokeStyle = '#0369a1';
        ctx.strokeRect(-halfW, y, w, step - 2);
      }
    }

    static _renderTunnel(ctx, obs, w, d, field) {
      const localPts = obs.getTunnelLocalSplinePoints(30);
      const wPx = field.toPixels(obs.widthMeters || 0.6);

      ctx.save();

      // 1. Draw outer glow if selected
      if (obs.isSelected) {
        ctx.beginPath();
        localPts.forEach((pt, idx) => {
          const px = field.toPixels(pt.x);
          const py = field.toPixels(pt.y);
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
        ctx.lineWidth = wPx + 8;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // 2. Render main pipe body
      ctx.beginPath();
      localPts.forEach((pt, idx) => {
        const px = field.toPixels(pt.x);
        const py = field.toPixels(pt.y);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = wPx;
      ctx.lineCap = 'butt';
      ctx.stroke();

      // 3. Render rib lines (corrugation rings)
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 2;
      for (let i = 1; i < localPts.length - 1; i += 2) {
        const pPrev = localPts[i - 1];
        const pNext = localPts[i + 1];
        const dx = field.toPixels(pNext.x - pPrev.x);
        const dy = field.toPixels(pNext.y - pPrev.y);
        const len = Math.hypot(dx, dy);
        if (len > 0.001) {
          const nx = -dy / len;
          const ny = dx / len;
          const px = field.toPixels(localPts[i].x);
          const py = field.toPixels(localPts[i].y);
          ctx.beginPath();
          ctx.moveTo(px - nx * (wPx / 2), py - ny * (wPx / 2));
          ctx.lineTo(px + nx * (wPx / 2), py + ny * (wPx / 2));
          ctx.stroke();
        }
      }

      // 4. Render entrance & exit collars
      const p0 = localPts[0];
      const p1 = localPts[1];
      const pN1 = localPts[localPts.length - 2];
      const pN = localPts[localPts.length - 1];

      const drawCollar = (ptA, ptB) => {
        const dx = field.toPixels(ptB.x - ptA.x);
        const dy = field.toPixels(ptB.y - ptA.y);
        const len = Math.hypot(dx, dy);
        if (len > 0.001) {
          const nx = -dy / len;
          const ny = dx / len;
          const px = field.toPixels(ptA.x);
          const py = field.toPixels(ptA.y);
          ctx.fillStyle = '#78350f';
          ctx.beginPath();
          ctx.moveTo(px - nx * (wPx / 2 + 3), py - ny * (wPx / 2 + 3));
          ctx.lineTo(px + nx * (wPx / 2 + 3), py + ny * (wPx / 2 + 3));
          ctx.lineTo(px + nx * (wPx / 2 + 3) + (dx / len) * 8, py + ny * (wPx / 2 + 3) + (dy / len) * 8);
          ctx.lineTo(px - nx * (wPx / 2 + 3) + (dx / len) * 8, py - ny * (wPx / 2 + 3) + (dy / len) * 8);
          ctx.closePath();
          ctx.fill();
        }
      };
      drawCollar(p0, p1);
      drawCollar(pN, pN1);

      ctx.restore();

      // 5. Render 3 Movable Control Nodes when selected
      if (obs.isSelected && obs.tunnelNodes) {
        obs.tunnelNodes.forEach((node, idx) => {
          const nx = field.toPixels(node.x);
          const ny = field.toPixels(node.y);

          ctx.save();
          ctx.beginPath();
          ctx.arc(nx, ny, idx === 1 ? 9 : 7.5, 0, Math.PI * 2);
          ctx.fillStyle = idx === 1 ? '#38bdf8' : '#f59e0b';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
          ctx.shadowBlur = 6;
          ctx.fill();
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();

          // Node label inside: 1 (Entry), 2 (Center), 3 (Exit)
          ctx.fillStyle = '#0f172a';
          ctx.font = 'bold 9px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText((idx + 1).toString(), nx, ny);
          ctx.restore();
        });
      }
    }

    static _renderAFrame(ctx, obs, w, d, field) {
      const halfW = w / 2, halfD = d / 2;
      const contactLenPx = field.toPixels(obs.def.contactLengthMeters || 1.06);
      ctx.fillStyle = '#10b981'; ctx.fillRect(-halfW, -halfD, w, d);
      ctx.strokeStyle = '#065f46'; ctx.lineWidth = 2; ctx.strokeRect(-halfW, -halfD, w, d);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-halfW, 0); ctx.lineTo(halfW, 0); ctx.stroke();
      ctx.fillStyle = '#facc15';
      ctx.fillRect(-halfW, -halfD, w, contactLenPx);
      ctx.fillRect(-halfW, halfD - contactLenPx, w, contactLenPx);
    }

    static _renderDogWalk(ctx, obs, w, d, field) {
      const halfW = w / 2, halfD = d / 2;
      const contactLenPx = field.toPixels(obs.def.contactLengthMeters || 0.9);
      ctx.fillStyle = '#059669'; ctx.fillRect(-halfW, -halfD, w, d);
      ctx.strokeStyle = '#064e3b'; ctx.lineWidth = 2; ctx.strokeRect(-halfW, -halfD, w, d);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(-halfW, -halfD, w, contactLenPx);
      ctx.fillRect(-halfW, halfD - contactLenPx, w, contactLenPx);
    }

    static _renderSeesaw(ctx, obs, w, d, field) {
      const halfW = w / 2, halfD = d / 2;
      const contactLenPx = field.toPixels(obs.def.contactLengthMeters || 0.9);
      ctx.fillStyle = '#047857'; ctx.fillRect(-halfW, -halfD, w, d);
      ctx.strokeStyle = '#064e3b'; ctx.lineWidth = 2; ctx.strokeRect(-halfW, -halfD, w, d);
      ctx.fillStyle = '#334155'; ctx.fillRect(-halfW - 4, -4, w + 8, 8);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(-halfW, -halfD, w, contactLenPx);
      ctx.fillRect(-halfW, halfD - contactLenPx, w, contactLenPx);
    }

    static _renderWeavePoles(ctx, obs, w, d, field) {
      const count = obs.def.poles || 6, halfD = d / 2, step = d / (count - 1);
      ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(0, -halfD); ctx.lineTo(0, halfD); ctx.stroke();
      for (let i = 0; i < count; i++) {
        const y = -halfD + i * step;
        ctx.fillStyle = i % 2 === 0 ? '#8b5cf6' : '#ffffff';
        ctx.beginPath(); ctx.arc(0, y, 3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#4c1d95'; ctx.lineWidth = 1.5; ctx.stroke();
      }
    }

    static _renderPauseTable(ctx, obs, w, d) {
      ctx.fillStyle = '#ec4899'; ctx.fillRect(-w / 2, -d / 2, w, d);
      ctx.strokeStyle = '#831843'; ctx.lineWidth = 3; ctx.strokeRect(-w / 2, -d / 2, w, d);
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('TABLE', 0, 0);
    }

    static _renderStartFinish(ctx, obs, w, d) {
      const halfW = w / 2;
      ctx.strokeStyle = '#ef4444'; 
	  ctx.lineWidth = 4; 
	  ctx.setLineDash([6, 6]);
      
	  ctx.beginPath(); 
	  ctx.moveTo(-halfW, 0); 
	  ctx.lineTo(halfW, 0); 
	  ctx.stroke(); 
	  ctx.setLineDash([]);
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(-halfW - 6, -4, 6, 8); 
	  ctx.fillRect(halfW - 6, -4, 6, 8);
    }

    static _renderGenericBox(ctx, obs, w, d) {
      ctx.fillStyle = obs.def.color || '#64748b'; ctx.fillRect(-w / 2, -d / 2, w, d);
      ctx.strokeStyle = '#1e293b'; ctx.strokeRect(-w / 2, -d / 2, w, d);
    }

    static _renderWrapIndicator(ctx, obs, w, d) {
      if (!obs.wrap || obs.wrap === WRAP_DIRECTIONS.NONE) return;
      const halfW = w / 2;
      const isReverse = obs.wrap === WRAP_DIRECTIONS.REVERSE_LEFT || obs.wrap === WRAP_DIRECTIONS.REVERSE_RIGHT;
      const isLeft = obs.wrap === WRAP_DIRECTIONS.LEFT || obs.wrap === WRAP_DIRECTIONS.REVERSE_LEFT;
      const wingX = isLeft ? -halfW : halfW;

      ctx.save();
      ctx.translate(wingX, 0);
      ctx.fillStyle = isReverse ? '#ef4444' : '#3b82f6';
      ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.beginPath();
      const startAngle = isReverse ? (isLeft ? Math.PI / 4 : (3 * Math.PI) / 4) : (isLeft ? -Math.PI / 4 : (-3 * Math.PI) / 4);
      const endAngle = startAngle + (isLeft ? -Math.PI : Math.PI);
      ctx.arc(0, 0, 8, startAngle, endAngle, isLeft); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.font = '900 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(isReverse ? 'REV' : 'WRAP', 0, 0);
      ctx.restore();
    }

    static _renderSelectionHandles(ctx, px, py, w, d, rotationDeg) {
      ctx.save();
      ctx.translate(px, py); 
	  ctx.rotate(degToRad(rotationDeg));
      const halfW = w / 2 + 10, halfD = d / 2 + 10;
      ctx.strokeStyle = '#38bdf8'; 
	  ctx.lineWidth = 1.5; 
	  ctx.setLineDash([4, 4]);
      ctx.strokeRect(-halfW, -halfD, halfW * 2, halfD * 2); 
	  ctx.setLineDash([]);
      
	  const rotateHandleY = -halfD - 20;
      ctx.beginPath(); 
	  ctx.moveTo(0, -halfD); 
	  ctx.lineTo(0, rotateHandleY); 
	  ctx.strokeStyle = '#38bdf8'; 
	  ctx.stroke();
      ctx.fillStyle = '#0284c7'; 
	  ctx.strokeStyle = '#ffffff'; 
	  ctx.lineWidth = 1;
      ctx.beginPath(); 
	  ctx.arc(0, rotateHandleY, 7, 0, Math.PI * 2); 
	  ctx.fill(); 
	  ctx.stroke();
      ctx.restore();
    }
  }



  // --- 6. CANVAS ENGINE ---

  class CanvasEngine {
    constructor(canvasEl, field, pathModel, historyManager) {
      this.canvas = canvasEl;
      this.ctx = this.canvas.getContext('2d');
      this.field = field;
      this.pathModel = pathModel;
      this.historyManager = historyManager;

      this.obstacles = [];
      this.selectedObstacles = [];
      this.panX = 40; this.panY = 60; this.zoom = 1.0;
      this.mode = 'select';
      this.measureStart = null; this.measureEnd = null;
      this.isDragging = false; this.dragStartPoint = { x: 0, y: 0 };

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
    setObstacles(list) { this.obstacles = list; this.render(); }
    addObstacle(obs) {
      this.obstacles.push(obs);
      this.selectObstacle(obs);
      this.historyManager.push(this.getSnapshot());
      this.render();
    }
    selectObstacle(obs, addToSelection = false) {
      if (!addToSelection) {
        this.obstacles.forEach(o => o.isSelected = false);
        this.selectedObstacles = [];
      }
      if (obs) {
        obs.isSelected = true;
        if (!this.selectedObstacles.includes(obs)) this.selectedObstacles.push(obs);
      }
      if (typeof this.onSelectionChange === 'function') this.onSelectionChange(this.selectedObstacles);
      this.render();
    }
    clearSelection() {
      this.obstacles.forEach(o => o.isSelected = false);
      this.selectedObstacles = [];
      if (typeof this.onSelectionChange === 'function') this.onSelectionChange([]);
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
        dup.x += 1.5; dup.y += 1.5;
        if (dup.seq) dup.seq += 1;
        this.obstacles.push(dup);
        newItems.push(dup);
      });
      this.clearSelection();
      newItems.forEach(i => this.selectObstacle(i, true));
      this.historyManager.push(this.getSnapshot());
      this.render();
    }
    getSnapshot() {
      return {
        field: this.field.toJSON(),
        obstacles: this.obstacles.map(o => o.toJSON()),
        pathModel: this.pathModel.toJSON()
      };
    }
    loadSnapshot(s) {
      if (!s) return;
      this.field.fromJSON(s.field, () => this.render());
      this.obstacles = (s.obstacles || []).map(o => Obstacle.fromJSON(o));
      if (s.pathModel) {
        this.pathModel.fromJSON(s.pathModel);
      }
      this.clearSelection();
      this.render();
    }
    screenToField(sX, sY) {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: this.field.toMeters((sX - rect.left - this.panX) / this.zoom),
        y: this.field.toMeters((sY - rect.top - this.panY) / this.zoom)
      };
    }
    render() {
      const rect = this.canvas.getBoundingClientRect();
      const w = rect.width, h = rect.height;

      const fieldDimEl = document.getElementById('hud-field-dim');
      if (fieldDimEl) fieldDimEl.textContent = `${this.field.widthMeters}${this.field.unit} × ${this.field.lengthMeters}${this.field.unit} (${this.field.shape.toUpperCase()})`;

      const rulerTextEl = document.getElementById('scale-ruler-text');
      if (rulerTextEl) {
        const scaleMeterPx = this.field.toPixels(1) * this.zoom;
        rulerTextEl.textContent = `1 ${this.field.unit} = ${Math.round(scaleMeterPx)}px`;
        const rulerBar = document.querySelector('.ruler-bar');
        if (rulerBar) rulerBar.style.width = `${Math.min(120, Math.max(30, scaleMeterPx))}px`;
      }

      this.ctx.clearRect(0, 0, w, h);
      this.ctx.save();
      this.ctx.translate(this.panX, this.panY);
      this.ctx.scale(this.zoom, this.zoom);

      this._renderFieldSurface();
      if (this.field.showGrid) this._renderGrid();
      PathRenderer.render(this.ctx, this.pathModel, this.obstacles, this.field);
      this.obstacles.forEach(o => ObstacleRenderer.render(this.ctx, o, this.field));
      if (this.mode === 'measure' && this.measureStart && this.measureEnd) this._renderMeasuringTape();

      this.ctx.restore();
    }
    _renderFieldSurface() {
      const poly = this.field.getBoundaryPolygon();
      if (poly.length === 0) return;
      this.ctx.save();
      const fieldW = this.field.toPixels(this.field.widthMeters);
      const fieldH = this.field.toPixels(this.field.lengthMeters);
      const grad = this.ctx.createLinearGradient(0, 0, fieldW, fieldH);
      grad.addColorStop(0, '#064e3b'); grad.addColorStop(1, '#022c22');
      this.ctx.fillStyle = grad;
      this.ctx.beginPath();
      poly.forEach((pt, i) => {
        const px = this.field.toPixels(pt.x), py = this.field.toPixels(pt.y);
        if (i === 0) this.ctx.moveTo(px, py); else this.ctx.lineTo(px, py);
      });
      this.ctx.closePath(); this.ctx.fill();

      // Embedded Course PNG Background Overlay Layer
      if (this.field.showBgImage && this.field.bgImage && this.field.bgImage.complete && this.field.bgImage.naturalWidth > 0) {
        this.ctx.save();
        this.ctx.beginPath();
        poly.forEach((pt, i) => {
          const px = this.field.toPixels(pt.x), py = this.field.toPixels(pt.y);
          if (i === 0) this.ctx.moveTo(px, py); else this.ctx.lineTo(px, py);
        });
        this.ctx.closePath();
        this.ctx.clip();

        this.ctx.globalAlpha = this.field.bgImageOpacity !== undefined ? this.field.bgImageOpacity : 0.6;
        this.ctx.drawImage(this.field.bgImage, 0, 0, fieldW, fieldH);
        this.ctx.restore();
      }

      this.ctx.strokeStyle = '#facc15'; this.ctx.lineWidth = 3; this.ctx.setLineDash([12, 8]); this.ctx.stroke();
      this.ctx.restore();
    }
    _renderGrid() {
      const wPx = this.field.toPixels(this.field.widthMeters);
      const hPx = this.field.toPixels(this.field.lengthMeters);
      const gridStep = this.field.gridSizeMeters || 1.0;

      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      this.ctx.lineWidth = 1;

      const totalW = Math.round(this.field.widthMeters);
      const totalH = Math.round(this.field.lengthMeters);

      // Draw vertical grid lines and labels (Top & Bottom sides)
      for (let xM = 0; xM <= totalW; xM += gridStep) {
        const xPx = this.field.toPixels(xM);
        this.ctx.beginPath(); this.ctx.moveTo(xPx, 0); this.ctx.lineTo(xPx, hPx); this.ctx.stroke();

        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
        this.ctx.font = '10px sans-serif';
        this.ctx.textAlign = 'center';

        // Top side label
        this.ctx.fillText(`${xM}`, xPx, -6);
        // Bottom side label
        this.ctx.fillText(`${xM}`, xPx, hPx + 14);
      }

      // Draw horizontal grid lines and labels (Left & Right sides)
      for (let yM = 0; yM <= totalH; yM += gridStep) {
        const yPx = this.field.toPixels(yM);
        this.ctx.beginPath(); this.ctx.moveTo(0, yPx); this.ctx.lineTo(wPx, yPx); this.ctx.stroke();

        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
        this.ctx.font = '10px sans-serif';

        // Left side label
        this.ctx.textAlign = 'right';
        this.ctx.fillText(`${yM}`, -6, yPx + 4);
        // Right side label
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`${yM}`, wPx + 6, yPx + 4);
      }

      this.ctx.restore();
    }
    _renderMeasuringTape() {
      const p1 = { x: this.field.toPixels(this.measureStart.x), y: this.field.toPixels(this.measureStart.y) };
      const p2 = { x: this.field.toPixels(this.measureEnd.x), y: this.field.toPixels(this.measureEnd.y) };
      const distText = formatDistance(distance(this.measureStart, this.measureEnd), this.field.unit);

      this.ctx.save();
      this.ctx.strokeStyle = '#f43f5e'; this.ctx.lineWidth = 2.5; this.ctx.setLineDash([6, 4]);
      this.ctx.beginPath(); this.ctx.moveTo(p1.x, p1.y); this.ctx.lineTo(p2.x, p2.y); this.ctx.stroke();
      this.ctx.restore();
    }
    _initEvents() {
      window.addEventListener('resize', () => this.resizeCanvas());
      this.canvas.addEventListener('mousedown', e => this._onMouseDown(e));
      this.canvas.addEventListener('mousemove', e => this._onMouseMove(e));
      window.addEventListener('mouseup', e => this._onMouseUp(e));
      this.canvas.addEventListener('wheel', e => this._onWheel(e), { passive: false });

      // Touch events
      this.canvas.addEventListener('touchstart', e => {
        if (e.touches.length === 1) {
          const t = e.touches[0];
          this._onMouseDown({ clientX: t.clientX, clientY: t.clientY, button: 0 });
        }
      }, { passive: false });
      this.canvas.addEventListener('touchmove', e => {
        if (e.touches.length === 1) {
          const t = e.touches[0];
          this._onMouseMove({ clientX: t.clientX, clientY: t.clientY });
        }
      }, { passive: false });
      this.canvas.addEventListener('touchend', () => this._onMouseUp());
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

      // 0. Check if clicking any tunnel control node of selected tunnel
      if (this.selectedObstacles.length === 1) {
        const activeObs = this.selectedObstacles[0];
        const isTunnel = activeObs.type === OBSTACLE_TYPES.TUNNEL || (typeof activeObs.type === 'string' && activeObs.type.startsWith('tunnel'));
        if (isTunnel) {
          const worldNodes = activeObs.getTunnelWorldNodes();
          const hitIdx = worldNodes.findIndex(n => distance(pos, n) < 1.2);
          if (hitIdx !== -1) {
            this.isDraggingTunnelNode = true;
            this.draggedTunnelObs = activeObs;
            this.draggedTunnelNodeIdx = hitIdx;
            return;
          }
        }
      }

      // 1. Check if clicking rotation handle knob of selected obstacle
      if (this.selectedObstacles.length === 1) {
        const activeObs = this.selectedObstacles[0];
        const isTunnel = activeObs.type === OBSTACLE_TYPES.TUNNEL || (typeof activeObs.type === 'string' && activeObs.type.startsWith('tunnel'));
        const bbox = (isTunnel && typeof activeObs.getTunnelBoundingBox === 'function')
          ? activeObs.getTunnelBoundingBox()
          : { widthMeters: activeObs.widthMeters, depthMeters: activeObs.depthMeters };

        const dPx = this.field.toPixels(bbox.depthMeters);
        const halfD = dPx / 2 + 10;

        const handleLocalMeters = {
          x: 0,
          y: -this.field.toMeters(halfD + 20)
        };
        const handleWorldMeters = rotatePoint(
          { x: activeObs.x + handleLocalMeters.x, y: activeObs.y + handleLocalMeters.y },
          { x: activeObs.x, y: activeObs.y },
          activeObs.rotation
        );

        if (distance(pos, handleWorldMeters) < 1.2) {
          this.isRotating = true;
          this.rotatingObs = activeObs;
          return;
        }
      }

      // 2. OBSTACLE SELECTION & DRAG HAS FIRST PRIORITY!
      const hitObs = [...this.obstacles].reverse().find(o => {
        const effW = Math.max(o.widthMeters, 1.5);
        const effD = Math.max(o.depthMeters, 1.5);
        return o.containsPoint ? o.containsPoint(pos.x, pos.y) : isPointInOrientedRect(pos.x, pos.y, o.x, o.y, effW + 0.4, effD + 0.4, o.rotation);
      });

      if (hitObs) {
        if (!hitObs.isSelected && !e.shiftKey) {
          this.selectObstacle(hitObs);
        } else if (e.shiftKey) {
          this.selectObstacle(hitObs, true);
        }

        this.isDragging = true;
        this.dragStartPoint = pos;
        this.dragInitialPositions = this.selectedObstacles.map(o => ({
          obs: o,
          startX: o.x,
          startY: o.y
        }));
        return;
      }

      // 3. SEQUENCE BADGE POSITIONING (Checked if sequence numbers are shown)
      if (this.pathModel.showSequenceNumbers) {
        const hitBadgeObs = this.obstacles.find(o => {
          const hasSeq = typeof o.getSeqArray === 'function' ? o.getSeqArray().length > 0 : (o.seq !== null && o.seq !== undefined && o.seq > 0);
          if (!hasSeq) return false;
          const bPos = o.getBadgeWorldPosition();
          return distance(pos, bPos) < 1.2;
        });

        if (hitBadgeObs) {
          this.isDraggingBadge = true;
          this.draggedBadgeObs = hitBadgeObs;
          return;
        }
      }

      // 4. SEGMENT TRAJECTORY CONTROL NODES (Checked ONLY if showControlNodes is enabled)
      if (this.pathModel.showControlNodes) {
        const allSegNodes = this.pathModel.getAllSegmentControlNodes(this.obstacles);
        const hitSegNode = allSegNodes.find(node => distance(pos, node) < 1.2);
        if (hitSegNode) {
          this.isDraggingPathNode = true;
          this.draggedPathNode = hitSegNode;
          return;
        }
      }

      // 5. Clicked empty space -> clear obstacle selection
      if (!e.shiftKey) {
        this.clearSelection();
      }
    }

    _onMouseMove(e) {
      if (this.isPanning) {
        this.panX += e.clientX - this.lastMouse.x;
        this.panY += e.clientY - this.lastMouse.y;
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

      // Interactive dragging of tunnel control node
      if (this.isDraggingTunnelNode && this.draggedTunnelObs) {
        this.draggedTunnelObs.moveTunnelNode(this.draggedTunnelNodeIdx, pos.x, pos.y);
        if (typeof this.onObstacleChange === 'function') {
          this.onObstacleChange(this.draggedTunnelObs);
        }
        this.render();
        return;
      }

      // Interactive dragging of sequence number badges along orbital ellipse
      if (this.isDraggingBadge && this.draggedBadgeObs) {
        let deg = this.draggedBadgeObs.getBadgeAngleFromWorldPosition(pos.x, pos.y);
        if (this.field.snapToGrid) {
          deg = Math.round(deg / 15) * 15;
        }
        this.draggedBadgeObs.badgeAngleDeg = deg;
        this.render();
        return;
      }

      // Interactive dragging of trajectory path nodes
      if (this.isDraggingPathNode && this.draggedPathNode) {
        this.draggedPathNode.x = pos.x;
        this.draggedPathNode.y = pos.y;
        if (this.field.snapToGrid) {
          this.draggedPathNode.x = this.field.snap(this.draggedPathNode.x);
          this.draggedPathNode.y = this.field.snap(this.draggedPathNode.y);
        }
        this.render();
        return;
      }

      // Interactive rotation by dragging rotation handle
      if (this.isRotating && this.rotatingObs) {
        const dx = pos.x - this.rotatingObs.x;
        const dy = pos.y - this.rotatingObs.y;
        let angleDeg = Math.round(radToDeg(Math.atan2(dy, dx)) + 90);
        if (this.field.snapToGrid) {
          angleDeg = Math.round(angleDeg / 15) * 15; // Snap to 15 deg steps
        }
        this.rotatingObs.rotation = angleDeg;
        if (typeof this.onObstacleChange === 'function') {
          this.onObstacleChange(this.rotatingObs);
        }
        this.render();
        return;
      }

      // Smooth dragging using initial position offsets
      if (this.isDragging && this.dragInitialPositions && this.dragInitialPositions.length > 0) {
        const totalDx = pos.x - this.dragStartPoint.x;
        const totalDy = pos.y - this.dragStartPoint.y;

        this.dragInitialPositions.forEach(({ obs, startX, startY }) => {
          let newX = startX + totalDx;
          let newY = startY + totalDy;

          if (this.field.snapToGrid) {
            newX = this.field.snap(newX);
            newY = this.field.snap(newY);
          }

          obs.x = newX;
          obs.y = newY;
        });

        if (typeof this.onObstacleChange === 'function') {
          this.onObstacleChange(this.selectedObstacles[0]);
        }
        this.render();
      }

      // --- CURSOR HIGHLIGHT & POINTER FEEDBACK ---
      let isHoverInteractive = false;

      // 0. Check if hovering over tunnel control node
      if (this.selectedObstacles.length === 1) {
        const activeObs = this.selectedObstacles[0];
        const isTunnel = activeObs.type === OBSTACLE_TYPES.TUNNEL || (typeof activeObs.type === 'string' && activeObs.type.startsWith('tunnel'));
        if (isTunnel) {
          const worldNodes = activeObs.getTunnelWorldNodes();
          if (worldNodes.some(n => distance(pos, n) < 1.2)) {
            isHoverInteractive = true;
          }
        }
      }

      // 1. Check if hovering over any obstacle
      if (!isHoverInteractive) {
        const hoverObs = [...this.obstacles].reverse().find(o => {
          const effW = Math.max(o.widthMeters, 1.5);
          const effD = Math.max(o.depthMeters, 1.5);
          return o.containsPoint ? o.containsPoint(pos.x, pos.y) : isPointInOrientedRect(pos.x, pos.y, o.x, o.y, effW + 0.4, effD + 0.4, o.rotation);
        });
        if (hoverObs) isHoverInteractive = true;
      }

      // 2. Check if hovering over rotation handle knob
      if (!isHoverInteractive && this.selectedObstacles.length === 1) {
        const activeObs = this.selectedObstacles[0];
        const isTunnel = activeObs.type === OBSTACLE_TYPES.TUNNEL || (typeof activeObs.type === 'string' && activeObs.type.startsWith('tunnel'));
        const bbox = (isTunnel && typeof activeObs.getTunnelBoundingBox === 'function')
          ? activeObs.getTunnelBoundingBox()
          : { widthMeters: activeObs.widthMeters, depthMeters: activeObs.depthMeters };

        const dPx = this.field.toPixels(bbox.depthMeters);
        const halfD = dPx / 2 + 10;
        const handleLocalMeters = { x: 0, y: -this.field.toMeters(halfD + 20) };
        const handleWorldMeters = rotatePoint(
          { x: activeObs.x + handleLocalMeters.x, y: activeObs.y + handleLocalMeters.y },
          { x: activeObs.x, y: activeObs.y },
          activeObs.rotation
        );
        if (distance(pos, handleWorldMeters) < 1.2) isHoverInteractive = true;
      }

      // 3. Check if hovering over any movable trajectory node
      if (!isHoverInteractive && this.pathModel.showControlNodes) {
        const allSegNodes = this.pathModel.getAllSegmentControlNodes(this.obstacles);
        const hoverSegNode = allSegNodes.find(node => distance(pos, node) < 1.2);
        if (hoverSegNode) isHoverInteractive = true;
      }

      // 4. Check if hovering over any sequence badge
      if (!isHoverInteractive && this.pathModel.showSequenceNumbers) {
        const hoverBadgeObs = this.obstacles.find(o => {
          const hasSeq = typeof o.getSeqArray === 'function' ? o.getSeqArray().length > 0 : (o.seq !== null && o.seq !== undefined && o.seq > 0);
          if (!hasSeq) return false;
          return distance(pos, o.getBadgeWorldPosition()) < 1.2;
        });
        if (hoverBadgeObs) isHoverInteractive = true;
      }

      // Apply cursor style
      if (this.mode === 'measure') {
        this.canvas.style.cursor = 'crosshair';
      } else if (this.isDragging || this.isDraggingTunnelNode || this.isDraggingPathNode || this.isDraggingBadge || this.isRotating || this.isPanning) {
        this.canvas.style.cursor = 'grabbing';
      } else if (isHoverInteractive) {
        this.canvas.style.cursor = 'pointer';
      } else {
        this.canvas.style.cursor = 'default';
      }
    }

    _onMouseUp() {
      if (this.isPanning) {
        this.isPanning = false;
      }

      if (this.isDraggingTunnelNode) {
        this.isDraggingTunnelNode = false;
        this.draggedTunnelObs = null;
        this.historyManager.push(this.getSnapshot());
      }

      if (this.isDraggingBadge) {
        this.isDraggingBadge = false;
        this.draggedBadgeObs = null;
        this.historyManager.push(this.getSnapshot());
      }

      if (this.isDraggingPathNode) {
        this.isDraggingPathNode = false;
        this.draggedPathNode = null;
        this.historyManager.push(this.getSnapshot());
      }

      if (this.isRotating) {
        this.isRotating = false;
        this.rotatingObs = null;
        this.historyManager.push(this.getSnapshot());
      }

      if (this.isDragging) {
        this.isDragging = false;
        this.dragInitialPositions = null;
        this.historyManager.push(this.getSnapshot());
      }
    }
    _onWheel(e) {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.min(Math.max(0.3, this.zoom * zoomFactor), 4.0);
      const rect = this.canvas.getBoundingClientRect();
      const mX = e.clientX - rect.left, mY = e.clientY - rect.top;
      this.panX = mX - (mX - this.panX) * (newZoom / this.zoom);
      this.panY = mY - (mY - this.panY) * (newZoom / this.zoom);
      this.zoom = newZoom;
      this.render();
    }
  }

  // --- 7. UI COMPONENTS ---

  class Toolbar {
    constructor(containerEl, canvasEngine, field, historyManager) {
      this.container = containerEl;
      this.canvasEngine = canvasEngine;
      this.field = field;
      this.historyManager = historyManager;
      this.activeCategory = 'All';
      this.render();
    }
    render() {
      const categories = ['All', 'Jumps', 'Tunnels', 'Contact Equipment', 'Weaves', 'Other'];
      this.container.innerHTML = `
        <div class="palette-header">
          <div class="palette-title"><i class="fa-solid fa-dog"></i> <span>Agility Palette</span></div>
        </div>
        <div class="category-tabs">
          ${categories.map(c => `<button class="cat-tab ${c === this.activeCategory ? 'active' : ''}" data-cat="${c}">${c}</button>`).join('')}
        </div>
        <div class="obstacle-grid">
          ${Object.entries(OBSTACLE_DEFS)
            .filter(([_, def]) => this.activeCategory === 'All' || def.category === this.activeCategory)
            .map(([type, def]) => `
              <div class="obstacle-card" data-type="${type}">
                <div class="obs-icon" style="background-color: ${def.color}20; color: ${def.color};">
                  <i class="fa-solid ${def.icon}"></i>
                </div>
                <div class="obs-info">
                  <div class="obs-name">${def.name}</div>
                  <div class="obs-size">${def.widthMeters}m × ${def.lengthMeters || def.depthMeters}m</div>
                </div>
                <button class="add-btn"><i class="fa-solid fa-plus"></i></button>
              </div>
            `).join('')}
        </div>
      `;
      this._bindEvents();
    }
    _bindEvents() {
      this.container.querySelectorAll('.cat-tab').forEach(t => {
        t.addEventListener('click', e => { this.activeCategory = e.target.dataset.cat; this.render(); });
      });
      this.container.querySelectorAll('.obstacle-card').forEach(card => {
        card.addEventListener('click', () => {
          const obs = new Obstacle(card.dataset.type, this.field.widthMeters / 2, this.field.lengthMeters / 2);
          this.canvasEngine.addObstacle(obs);
        });
      });
    }
  }

  class PropertyPanel {
    constructor(containerEl, canvasEngine, historyManager) {
      this.container = containerEl;
      this.canvasEngine = canvasEngine;
      this.historyManager = historyManager;
      this.selectedObstacle = null;
      this.canvasEngine.onSelectionChange = sel => {
        this.selectedObstacle = sel.length === 1 ? sel[0] : null;
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
      const obs = this.selectedObstacle, def = obs.def;
      this.container.innerHTML = `
        <div class="panel-header">
          <div class="panel-title">
            <i class="fa-solid ${def.icon}" style="color: ${def.color}"></i> <span>${def.name}</span>
          </div>
          <button class="icon-btn danger-btn delete-btn" title="Delete Obstacle"><i class="fa-solid fa-trash-can"></i></button>
        </div>

        <div class="panel-section">
          <label class="panel-label">Course Sequence Number</label>
          <p class="panel-subtext">Enter sequence number(s), e.g. 1 or 1, 5</p>
          <div class="input-row" style="display: flex; gap: 6px;">
            <input type="text" id="prop-seq" value="${typeof obs.getSeqString === 'function' ? obs.getSeqString() : (obs.seq !== null ? obs.seq : '')}" placeholder="e.g. 1 or 1, 5" class="app-input">
            <button id="btn-clear-seq" class="sec-btn">Clear</button>
          </div>
        </div>

        <div class="panel-section highlight-section">
          <label class="panel-label"><i class="fa-solid fa-route"></i> Dog Direction & Wrap Mode</label>
          <p class="panel-subtext">Choose dog approach and wrap style (e.g. Backside / Reverse Wrap)</p>
          <div class="wrap-grid">
            <button class="wrap-btn ${obs.wrap === WRAP_DIRECTIONS.NONE ? 'active' : ''}" data-wrap="${WRAP_DIRECTIONS.NONE}">
              <i class="fa-solid fa-arrow-up"></i> <span>Straight</span>
            </button>
            <button class="wrap-btn ${obs.wrap === WRAP_DIRECTIONS.LEFT ? 'active' : ''}" data-wrap="${WRAP_DIRECTIONS.LEFT}">
              <i class="fa-solid fa-reply"></i> <span>Wrap Left</span>
            </button>
            <button class="wrap-btn ${obs.wrap === WRAP_DIRECTIONS.RIGHT ? 'active' : ''}" data-wrap="${WRAP_DIRECTIONS.RIGHT}">
              <i class="fa-solid fa-share"></i> <span>Wrap Right</span>
            </button>
            <button class="wrap-btn reverse-btn ${obs.wrap === WRAP_DIRECTIONS.REVERSE_LEFT ? 'active' : ''}" data-wrap="${WRAP_DIRECTIONS.REVERSE_LEFT}">
              <i class="fa-solid fa-rotate-left"></i> <span>Reverse Wrap (Push L)</span>
            </button>
            <button class="wrap-btn reverse-btn ${obs.wrap === WRAP_DIRECTIONS.REVERSE_RIGHT ? 'active' : ''}" data-wrap="${WRAP_DIRECTIONS.REVERSE_RIGHT}">
              <i class="fa-solid fa-rotate-right"></i> <span>Reverse Wrap (Push R)</span>
            </button>
          </div>
        </div>

        <div class="panel-section">
          <label class="panel-label">Rotation Angle (${obs.rotation}°)</label>
          <input type="range" id="prop-rotation" min="-180" max="180" value="${obs.rotation}" class="app-slider">
          <div class="quick-rot-row">
            <button class="rot-quick-btn" data-rot="0">0°</button>
            <button class="rot-quick-btn" data-rot="45">45°</button>
            <button class="rot-quick-btn" data-rot="90">90°</button>
            <button class="rot-quick-btn" data-rot="180">180°</button>
            <button class="rot-quick-btn" data-rot="-90">-90°</button>
          </div>
        </div>

        ${(obs.type === OBSTACLE_TYPES.TUNNEL || (typeof obs.type === 'string' && obs.type.startsWith('tunnel'))) ? `
          <div class="panel-section">
            <label class="panel-label">Tunnel Shape & Curve</label>
            <p class="panel-subtext">3 Movable Nodes (Entry, Center, Exit). Drag nodes directly on canvas to bend.</p>
            <button id="btn-straighten-tunnel" class="sec-btn" style="width: 100%; margin-top: 6px;">
              <i class="fa-solid fa-ruler-horizontal"></i> Reset to Straight Tunnel
            </button>
          </div>
        ` : ''}

        <div class="panel-actions" style="padding: 16px;">
          <button id="btn-duplicate" class="sec-btn width-full"><i class="fa-solid fa-copy"></i> Duplicate</button>
        </div>
      `;
      this._bindEvents();
    }
    _bindEvents() {
      if (!this.selectedObstacle) return;
      const obs = this.selectedObstacle;
      this.container.querySelector('.delete-btn')?.addEventListener('click', () => this.canvasEngine.deleteSelected());
      this.container.querySelector('#prop-seq')?.addEventListener('input', e => {
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
        obs.seq = null; this.render(); this.canvasEngine.render();
      });
      this.container.querySelectorAll('.wrap-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          obs.wrap = btn.dataset.wrap;
          this.render();
          this.historyManager.push(this.canvasEngine.getSnapshot());
          this.canvasEngine.render();
        });
      });
      this.container.querySelector('#prop-rotation')?.addEventListener('input', e => {
        obs.rotation = parseInt(e.target.value); this.canvasEngine.render();
      });
      this.container.querySelectorAll('.rot-quick-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          obs.rotation = parseInt(btn.dataset.rot); this.render(); this.canvasEngine.render();
        });
      });
      this.container.querySelector('#btn-straighten-tunnel')?.addEventListener('click', () => {
        obs.resetTunnelCurve();
        this.render();
        this.canvasEngine.render();
        this.historyManager.push(this.canvasEngine.getSnapshot());
      });
      this.container.querySelector('#btn-duplicate')?.addEventListener('click', () => this.canvasEngine.duplicateSelected());
    }
  }

  class FieldModal {
    constructor(modalEl, field, canvasEngine, historyManager) {
      this.modal = modalEl;
      this.field = field;
      this.canvasEngine = canvasEngine;
      this.historyManager = historyManager;
    }
    show() { this._render(); this.modal.classList.add('active'); }
    hide() { this.modal.classList.remove('active'); }
    _render() {
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
                  <div class="shape-box rect-box"></div> <span>Rectangle</span>
                </label>
                <label class="shape-option ${this.field.shape === FIELD_SHAPES.L_SHAPE ? 'selected' : ''}">
                  <input type="radio" name="f-shape" value="${FIELD_SHAPES.L_SHAPE}" ${this.field.shape === FIELD_SHAPES.L_SHAPE ? 'checked' : ''}>
                  <div class="shape-box l-box"></div> <span>L-Shaped</span>
                </label>
                <label class="shape-option ${this.field.shape === FIELD_SHAPES.OCTAGON ? 'selected' : ''}">
                  <input type="radio" name="f-shape" value="${FIELD_SHAPES.OCTAGON}" ${this.field.shape === FIELD_SHAPES.OCTAGON ? 'checked' : ''}>
                  <div class="shape-box oct-box"></div> <span>Octagon</span>
                </label>
              </div>
            </div>
            <div class="form-row grid-2">
              <div class="form-group">
                <label class="form-label">Length (X-Axis)</label>
                <div class="input-with-unit">
                  <input type="number" id="field-width" value="${this.field.widthMeters}" min="10" max="200" class="app-input">
                  <span class="unit-tag">${this.field.unit || 'm'}</span>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Width (Y-Axis)</label>
                <div class="input-with-unit">
                  <input type="number" id="field-length" value="${this.field.lengthMeters}" min="10" max="200" class="app-input">
                  <span class="unit-tag">${this.field.unit || 'm'}</span>
                </div>
              </div>
            </div>
            <div class="form-group" style="margin-top: 12px;">
              <label class="checkbox-label" style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; color: var(--text-secondary);">
                <input type="checkbox" id="field-scale-obstacles" checked>
                <span>Scale obstacle positions proportionally to new field dimensions</span>
              </label>
            </div>

            <div class="form-group bg-image-section" style="margin-top: 14px; border-top: 1px solid var(--panel-border); padding-top: 14px;">
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
                    <label class="checkbox-label" style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; color: var(--text-secondary);">
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
            <button id="save-field-btn" class="pri-btn"><i class="fa-solid fa-check"></i> Apply Settings</button>
          </div>
        </div>
      `;
      this.modal.querySelector('.close-modal-btn').addEventListener('click', () => this.hide());
      this.modal.querySelector('.modal-backdrop').addEventListener('click', () => this.hide());

      this.modal.querySelectorAll('.shape-option').forEach(opt => {
        opt.addEventListener('click', () => {
          this.modal.querySelectorAll('.shape-option').forEach(o => o.classList.remove('selected'));
          opt.classList.add('selected');
          const radio = opt.querySelector('input');
          if (radio) radio.checked = true;
        });
      });

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
                this.historyManager.push(this.canvasEngine.getSnapshot());
                this.canvasEngine.render();
                this._render();
              });
            };
            reader.readAsDataURL(file);
          }
        });
      }

      if (removeBtn) {
        removeBtn.addEventListener('click', () => {
          this.field.setBgImage(null, () => {
            this.historyManager.push(this.canvasEngine.getSnapshot());
            this.canvasEngine.render();
            this._render();
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
        const shape = this.modal.querySelector('input[name="f-shape"]:checked').value;
        const width = parseFloat(this.modal.querySelector('#field-width').value);
        const length = parseFloat(this.modal.querySelector('#field-length').value);
        const scaleObs = this.modal.querySelector('#field-scale-obstacles').checked;

        if (showBgCb) this.field.showBgImage = showBgCb.checked;
        if (opacitySlider) this.field.bgImageOpacity = parseFloat(opacitySlider.value);

        const oldW = this.field.widthMeters;
        const oldL = this.field.lengthMeters;

        if (width > 0 && length > 0) {
          this.field.updateDimensions(width, length, shape);

          if (scaleObs && oldW > 0 && oldL > 0 && (width !== oldW || length !== oldL)) {
            const scaleX = width / oldW;
            const scaleY = length / oldL;

            // Scale all obstacle layout positions proportionally
            this.canvasEngine.obstacles.forEach(obs => {
              obs.x *= scaleX;
              obs.y *= scaleY;
            });

            // Scale custom segment trajectory control nodes if pathModel exists
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
      });
    }
  }

  class ExportModal {
    constructor(modalEl, canvasEngine, pathModel, historyManager) {
      this.modal = modalEl;
      this.canvasEngine = canvasEngine;
      this.pathModel = pathModel;
      this.historyManager = historyManager;
    }
    show() { this._render(); this.modal.classList.add('active'); }
    hide() { this.modal.classList.remove('active'); }
    _render() {
      const totalDistStr = this.pathModel.getFormattedDistance(this.canvasEngine.obstacles, this.canvasEngine.field.unit);
      const obsCount = this.canvasEngine.obstacles.length;
      this.modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-dialog">
          <div class="modal-header">
            <h3><i class="fa-solid fa-file-export"></i> Course File Import & Export</h3>
            <button class="close-modal-btn">&times;</button>
          </div>
          <div class="modal-body">
            <div class="stats-summary-box">
              <div class="stat-item"><div class="stat-val">${obsCount}</div><div class="stat-lbl">Obstacles</div></div>
              <div class="stat-item"><div class="stat-val">${totalDistStr}</div><div class="stat-lbl">Run Distance</div></div>
            </div>
            <div class="export-options-grid">
              <div class="export-card" id="btn-export-png">
                <div class="export-icon"><i class="fa-solid fa-image"></i></div>
                <div class="export-title">Download PNG Map</div>
                <div class="export-desc">Export image for printing or sharing</div>
              </div>
              <div class="export-card" id="btn-export-json">
                <div class="export-icon"><i class="fa-solid fa-file-code"></i></div>
                <div class="export-title">Save JSON File</div>
                <div class="export-desc">Save editable course design file</div>
              </div>
              <div class="export-card" id="btn-modal-import-json">
                <div class="export-icon" style="color: var(--accent-emerald);"><i class="fa-solid fa-folder-open"></i></div>
                <div class="export-title">Import JSON File</div>
                <div class="export-desc">Open a previously saved course file</div>
                <input type="file" id="modal-json-input" accept=".json" style="display: none;">
              </div>
              <div class="export-card" id="btn-print-page">
                <div class="export-icon" style="color: var(--accent-amber);"><i class="fa-solid fa-print"></i></div>
                <div class="export-title">Print Map Sheet</div>
                <div class="export-desc">Print judge map format</div>
              </div>
            </div>
          </div>
          <div class="modal-footer"><button class="sec-btn close-modal-btn">Close</button></div>
        </div>
      `;
      this.modal.querySelector('.close-modal-btn').addEventListener('click', () => this.hide());
      this.modal.querySelector('.modal-backdrop').addEventListener('click', () => this.hide());

      this.modal.querySelector('#btn-export-png').addEventListener('click', () => {
        this.canvasEngine.render();
        const link = document.createElement('a');
        link.download = `Agility_Course_${Date.now()}.png`;
        link.href = this.canvasEngine.canvas.toDataURL('image/png');
        link.click();
      });

      this.modal.querySelector('#btn-export-json').addEventListener('click', () => {
        const jsonStr = JSON.stringify(this.canvasEngine.getSnapshot(), null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `Agility_Course_${Date.now()}.json`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
      });

      const importCard = this.modal.querySelector('#btn-modal-import-json');
      const fileInput = this.modal.querySelector('#modal-json-input');
      importCard.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = evt => {
          try {
            const snapshot = JSON.parse(evt.target.result);
            this.canvasEngine.loadSnapshot(snapshot);
            if (this.historyManager) this.historyManager.push(this.canvasEngine.getSnapshot());
            this.hide();
          } catch (err) {
            alert('Invalid agility course JSON file format.');
          }
        };
        reader.readAsText(file);
      });

      this.modal.querySelector('#btn-print-page').addEventListener('click', () => {
        window.print();
      });
    }
  }

  // --- 8. MAIN APP ORCHESTRATOR ---

  class AgilityApp {
    constructor() {
      this.field = new Field();
      this.pathModel = new CoursePath();
      this.historyManager = new HistoryManager();

      this.canvasElement = document.getElementById('agility-canvas');
      this.canvasEngine = new CanvasEngine(this.canvasElement, this.field, this.pathModel, this.historyManager);

      this.babylonCanvas = document.getElementById('babylon-canvas');
      this.babylonEngine = new BabylonEngine(this.babylonCanvas);

      this.toolbar = new Toolbar(document.getElementById('toolbar-palette'), this.canvasEngine, this.field, this.historyManager);
      this.propertyPanel = new PropertyPanel(document.getElementById('property-panel-container'), this.canvasEngine, this.historyManager);
      this.fieldModal = new FieldModal(document.getElementById('field-modal-container'), this.field, this.canvasEngine, this.historyManager);
      this.exportModal = new ExportModal(document.getElementById('export-modal-container'), this.canvasEngine, this.pathModel, this.historyManager);

      this._bindHeaderActions();
      
      const defaultObstacles = [
        new Obstacle(OBSTACLE_TYPES.START_FINISH, 4, 17, { rotation: 90, seq: 1 }),
        new Obstacle(OBSTACLE_TYPES.JUMP_SINGLE, 12, 17, { rotation: 90, seq: 2 }),
        new Obstacle(OBSTACLE_TYPES.JUMP_SINGLE, 21, 13, { rotation: 45, seq: 3 }),
        new Obstacle(OBSTACLE_TYPES.A_FRAME, 31, 10, { rotation: 45, seq: 4 })
      ];
      this.canvasEngine.setObstacles(defaultObstacles);
      this.historyManager.clear();
      this.historyManager.push(this.canvasEngine.getSnapshot());
    }
    _bindHeaderActions() {
      const undoBtn = document.getElementById('btn-undo');
      const redoBtn = document.getElementById('btn-redo');
      this.historyManager.setOnChange(({ canUndo, canRedo }) => {
        if (undoBtn) undoBtn.disabled = !canUndo;
        if (redoBtn) redoBtn.disabled = !canRedo;
      });
      undoBtn?.addEventListener('click', () => {
        const prev = this.historyManager.undo(this.canvasEngine.getSnapshot());
        if (prev) this.canvasEngine.loadSnapshot(prev);
      });
      redoBtn?.addEventListener('click', () => {
        const next = this.historyManager.redo(this.canvasEngine.getSnapshot());
        if (next) this.canvasEngine.loadSnapshot(next);
      });

      // 2D / 3D / ArUco View Mode Tab Switching
      const tab2D = document.getElementById('tab-btn-2d');
      const tab3D = document.getElementById('tab-btn-3d');
      const tabAruco = document.getElementById('tab-btn-aruco');

      const view2D = document.getElementById('view-2d-container');
      const view3D = document.getElementById('view-3d-container');
      const viewAruco = document.getElementById('view-aruco-container');
      const appRoot = document.getElementById('app-root');

      const switchTo2D = () => {
        tab2D?.classList.add('active');
        tab3D?.classList.remove('active');
        tabAruco?.classList.remove('active');
        view2D?.classList.add('active');
        view3D?.classList.remove('active');
        viewAruco?.classList.remove('active');
        appRoot?.classList.remove('aruco-active');
        this.canvasEngine.render();
      };

      const switchTo3D = () => {
        tab3D?.classList.add('active');
        tab2D?.classList.remove('active');
        tabAruco?.classList.remove('active');
        view3D?.classList.add('active');
        view2D?.classList.remove('active');
        viewAruco?.classList.remove('active');
        appRoot?.classList.remove('aruco-active');
        this.babylonEngine.updateScene(this.field, this.canvasEngine.obstacles, this.pathModel);
      };

      const switchToAruco = () => {
        tabAruco?.classList.add('active');
        tab2D?.classList.remove('active');
        tab3D?.classList.remove('active');
        viewAruco?.classList.add('active');
        view2D?.classList.remove('active');
        view3D?.classList.remove('active');
        appRoot?.classList.add('aruco-active');
      };

      tab2D?.addEventListener('click', switchTo2D);
      tab3D?.addEventListener('click', switchTo3D);
      tabAruco?.addEventListener('click', switchToAruco);

      document.getElementById('btn-reset-3d-cam')?.addEventListener('click', () => {
        this.babylonEngine.resetCamera();
      });

      const groundOpacitySlider = document.getElementById('slider-3d-ground-opacity');
      const groundOpacityVal = document.getElementById('val-3d-ground-opacity');
      groundOpacitySlider?.addEventListener('input', e => {
        const val = parseFloat(e.target.value);
        if (groundOpacityVal) groundOpacityVal.textContent = `${Math.round(val * 100)}%`;
        if (this.babylonEngine) {
          this.babylonEngine.setGroundOpacity(val);
        }
      });

      // Collapsible Left & Right Sidebars
      const leftSidebar = document.getElementById('toolbar-palette');
      const rightSidebar = document.getElementById('property-panel-container');
      const btnToggleLeft = document.getElementById('btn-toggle-left-sidebar');
      const btnToggleRight = document.getElementById('btn-toggle-right-sidebar');

      const triggerCanvasResize = () => {
        setTimeout(() => {
          this.canvasEngine.resizeCanvas();
          if (this.babylonEngine) this.babylonEngine.resize();
        }, 260);
      };

      btnToggleLeft?.addEventListener('click', () => {
        const isCollapsed = leftSidebar?.classList.toggle('collapsed');
        if (btnToggleLeft) {
          btnToggleLeft.innerHTML = isCollapsed ? '<i class="fa-solid fa-chevron-right"></i>' : '<i class="fa-solid fa-chevron-left"></i>';
          btnToggleLeft.title = isCollapsed ? 'Expand Equipment Palette' : 'Collapse Equipment Palette';
        }
        triggerCanvasResize();
      });

      btnToggleRight?.addEventListener('click', () => {
        const isCollapsed = rightSidebar?.classList.toggle('collapsed');
        if (btnToggleRight) {
          btnToggleRight.innerHTML = isCollapsed ? '<i class="fa-solid fa-chevron-left"></i>' : '<i class="fa-solid fa-chevron-right"></i>';
          btnToggleRight.title = isCollapsed ? 'Expand Property Inspector' : 'Collapse Property Inspector';
        }
        triggerCanvasResize();
      });
      document.getElementById('btn-clear')?.addEventListener('click', () => {
        if (confirm('Clear canvas obstacles?')) {
          this.canvasEngine.setObstacles([]);
          this.historyManager.push(this.canvasEngine.getSnapshot());
        }
      });
      document.getElementById('btn-field-settings')?.addEventListener('click', () => this.fieldModal.show());
      document.getElementById('btn-export')?.addEventListener('click', () => this.exportModal.show());

      // Header Course Background Image Button
      const bgImageHeaderBtn = document.getElementById('btn-bg-image');
      const bgImageFileInput = document.getElementById('bg-image-input');
      bgImageHeaderBtn?.addEventListener('click', () => {
        if (!this.field.bgImageDataUrl) {
          bgImageFileInput?.click();
        } else {
          this.fieldModal.show();
        }
      });
      bgImageFileInput?.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = evt => {
          this.field.setBgImage(evt.target.result, () => {
            this.historyManager.push(this.canvasEngine.getSnapshot());
            this.canvasEngine.render();
          });
        };
        reader.readAsDataURL(file);
      });

      // Header Import Button
      const importHeaderBtn = document.getElementById('btn-import-header');
      const headerFileInput = document.getElementById('header-json-input');
      importHeaderBtn?.addEventListener('click', () => headerFileInput?.click());
      headerFileInput?.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = evt => {
          try {
            const snapshot = JSON.parse(evt.target.result);
            this.canvasEngine.loadSnapshot(snapshot);
            this.historyManager.push(this.canvasEngine.getSnapshot());
          } catch (err) {
            alert('Invalid agility course JSON file format.');
          }
        };
        reader.readAsText(file);
      });

      const toggleNodesBtn = document.getElementById('btn-toggle-path-nodes');
      if (toggleNodesBtn) {
        toggleNodesBtn.classList.toggle('active', this.pathModel.showControlNodes);
        toggleNodesBtn.addEventListener('click', () => {
          this.pathModel.showControlNodes = !this.pathModel.showControlNodes;
          toggleNodesBtn.classList.toggle('active', this.pathModel.showControlNodes);
          this.canvasEngine.render();
        });
      }

      document.getElementById('btn-toggle-grid')?.addEventListener('click', () => {
        this.field.showGrid = !this.field.showGrid;
        document.getElementById('btn-toggle-grid').classList.toggle('active', this.field.showGrid);
        this.canvasEngine.render();
      });
      document.getElementById('btn-toggle-snap')?.addEventListener('click', () => {
        this.field.snapToGrid = !this.field.snapToGrid;
        document.getElementById('btn-toggle-snap').classList.toggle('active', this.field.snapToGrid);
      });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.app = new AgilityApp();
  });

})();
