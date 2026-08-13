/**
 * Obstacle Model for Agility Course Designer
 * Represents an obstacle instance on the field.
 */
import { OBSTACLE_DEFS, OBSTACLE_TYPES, WRAP_DIRECTIONS } from '../config.js';
import { rotatePoint, isPointInOrientedRect } from '../core/math.js';

let idCounter = 1;

export class Obstacle {
  constructor(type, xMeters = 0, yMeters = 0, options = {}) {
    this.id = options.id || `obs_${Date.now()}_${idCounter++}`;
    this.type = type;
    this.def = OBSTACLE_DEFS[type] || OBSTACLE_DEFS[OBSTACLE_TYPES.JUMP_SINGLE];

    // Coordinates in real-world field meters
    this.x = xMeters;
    this.y = yMeters;
    this.rotation = options.rotation || 0; // degrees (0 = horizontal, left to right approach)

    // Dimensions in meters (overridable)
    this.widthMeters = options.widthMeters || this.def.widthMeters;
    this.depthMeters = options.depthMeters || this.def.lengthMeters || this.def.depthMeters || 0.6;
    
    // Agility Course Sequencing & Wrap Properties
    this.seq = options.seq !== undefined ? options.seq : null; // Sequence number (e.g. 1, 2, 3...)
    this.wrap = options.wrap || WRAP_DIRECTIONS.NONE; // Direction of dog jump / wrap
    
    // Tunnel bending parameters
    this.curve = options.curve || 0;

    const isTunnelType = type === OBSTACLE_TYPES.TUNNEL || (typeof type === 'string' && type.startsWith('tunnel'));
    if (options.tunnelNodes && Array.isArray(options.tunnelNodes) && options.tunnelNodes.length === 3) {
      this.tunnelNodes = options.tunnelNodes.map(n => ({ x: n.x, y: n.y }));
    } else if (isTunnelType) {
      this.initTunnelNodes();
    }

    // UI state
    this.isSelected = false;
    this.isDragging = false;
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
      rotatePoint(
        { x: this.x + node.x, y: this.y + node.y },
        { x: this.x, y: this.y },
        this.rotation
      )
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

    const worldNodes = this.getTunnelWorldNodes();
    worldNodes[nodeIdx] = { x: worldX, y: worldY };

    const fixDistance = (pFix, pAdj, reqDist) => {
      const distx = pAdj.x - pFix.x;
      const disty = pAdj.y - pFix.y;
      let d = Math.hypot(distx, disty);
      if (d < 0.0001) {
        return { x: pFix.x, y: pFix.y + reqDist };
      }
      return {
        x: pFix.x + (distx / d) * reqDist,
        y: pFix.y + (disty / d) * reqDist
      };
    };

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

    const rad = -(this.rotation || 0) * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const toLocal = (pt) => {
      const dx = pt.x - this.x;
      const dy = pt.y - this.y;
      return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
    };

    const N0_loc = toLocal(worldNodes[0]);
    const N1_loc = toLocal(worldNodes[1]);
    const N2_loc = toLocal(worldNodes[2]);

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

    const rawWorld = rawLocal.map(pt => rotatePoint({ x: this.x + pt.x, y: this.y + pt.y }, { x: this.x, y: this.y }, this.rotation));
    let minWX = Infinity, maxWX = -Infinity, minWY = Infinity, maxWY = -Infinity;
    rawWorld.forEach(pt => {
      if (pt.x < minWX) minWX = pt.x;
      if (pt.x > maxWX) maxWX = pt.x;
      if (pt.y < minWY) minWY = pt.y;
      if (pt.y > maxWY) maxWY = pt.y;
    });

    const newCenterX = (minWX + maxWX) / 2;
    const newCenterY = (minWY + maxWY) / 2;

    this.x = newCenterX;
    this.y = newCenterY;

    this.tunnelNodes = worldNodes.map(wn => {
      const dx = wn.x - this.x;
      const dy = wn.y - this.y;
      return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
    });

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
    return localPts.map(pt => rotatePoint(
      { x: this.x + pt.x, y: this.y + pt.y },
      { x: this.x, y: this.y },
      this.rotation
    ));
  }

  /**
   * Returns sequence numbers assigned to this obstacle as an array of numbers (e.g. [1, 5])
   */
  getSeqArray() {
    if (this.seq === null || this.seq === undefined || this.seq === '') return [];
    if (Array.isArray(this.seq)) {
      return this.seq
        .map(n => parseInt(n))
        .filter(n => !isNaN(n) && n > 0);
    }
    if (typeof this.seq === 'number') {
      return this.seq > 0 ? [this.seq] : [];
    }
    if (typeof this.seq === 'string') {
      return this.seq
        .split(',')
        .map(s => parseInt(s.trim()))
        .filter(n => !isNaN(n) && n > 0);
    }
    return [];
  }

  /**
   * Returns sequence numbers as a comma-separated string (e.g. "1, 5")
   */
  getSeqString() {
    return this.getSeqArray().join(', ');
  }

  /**
   * Check if a specific sequence number belongs to this obstacle
   */
  hasSeq(num) {
    return this.getSeqArray().includes(num);
  }

  /**
   * Calculate dog approach takeoff point and landing point based on obstacle orientation & wrap direction
   */
  getApproachVector() {
    const angleRad = (this.rotation * Math.PI) / 180;
    const perpRad = angleRad + Math.PI / 2;

    // Normal approach: perpendicular to jump bar / obstacle axis
    const normalEntry = {
      x: this.x - Math.cos(perpRad) * 1.5,
      y: this.y - Math.sin(perpRad) * 1.5
    };

    const normalExit = {
      x: this.x + Math.cos(perpRad) * 1.5,
      y: this.y + Math.sin(perpRad) * 1.5
    };

    // If Backside / Reverse Wrap is enabled, dog approaches from back or wraps around wing!
    if (this.wrap === WRAP_DIRECTIONS.REVERSE_LEFT || this.wrap === WRAP_DIRECTIONS.REVERSE_RIGHT) {
      const wingOffset = (this.widthMeters / 2 + 0.6) * (this.wrap === WRAP_DIRECTIONS.REVERSE_LEFT ? -1 : 1);
      const wingPoint = rotatePoint(
        { x: this.x + wingOffset, y: this.y },
        { x: this.x, y: this.y },
        this.rotation
      );

      return {
        entry: normalExit, // Approaches from opposite side
        wrapPoint: wingPoint,
        exit: normalEntry,
        isReverseWrap: true
      };
    }

    if (this.wrap === WRAP_DIRECTIONS.LEFT || this.wrap === WRAP_DIRECTIONS.RIGHT) {
      const wingOffset = (this.widthMeters / 2 + 0.4) * (this.wrap === WRAP_DIRECTIONS.LEFT ? -1 : 1);
      const wingPoint = rotatePoint(
        { x: this.x + wingOffset, y: this.y },
        { x: this.x, y: this.y },
        this.rotation
      );

      return {
        entry: normalEntry,
        wrapPoint: wingPoint,
        exit: normalEntry, // Wraps back to same side or turns
        isReverseWrap: false
      };
    }

    return {
      entry: normalEntry,
      exit: normalExit,
      isReverseWrap: false
    };
  }

  /**
   * Check if a field coordinate (px, py in meters) hits this obstacle
   */
  containsPoint(px, py) {
    const extraPadding = 0.3; // touch hit tolerance
    return isPointInOrientedRect(
      px, py,
      this.x, this.y,
      this.widthMeters + extraPadding,
      this.depthMeters + extraPadding,
      this.rotation
    );
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      x: this.x,
      y: this.y,
      rotation: this.rotation,
      widthMeters: this.widthMeters,
      depthMeters: this.depthMeters,
      seq: this.seq,
      wrap: this.wrap,
      curve: this.curve
    };
  }

  static fromJSON(json) {
    return new Obstacle(json.type, json.x, json.y, {
      id: json.id,
      rotation: json.rotation,
      widthMeters: json.widthMeters,
      depthMeters: json.depthMeters,
      seq: json.seq,
      wrap: json.wrap,
      curve: json.curve
    });
  }
}
