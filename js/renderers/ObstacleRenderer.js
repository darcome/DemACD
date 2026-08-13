/**
 * Obstacle Renderer for Agility Course Designer
 * Draws realistic 2D top-view agility equipment with accurate contact zones, wings, and reverse-wrap badges.
 */
import { OBSTACLE_TYPES, WRAP_DIRECTIONS } from '../config.js';
import { rotatePoint, degToRad } from '../core/math.js';

export class ObstacleRenderer {
  /**
   * Main render function for an obstacle on the canvas
   */
  static render(ctx, obstacle, field) {
    const px = field.toPixels(obstacle.x);
    const py = field.toPixels(obstacle.y);
    const widthPx = field.toPixels(obstacle.widthMeters);
    const depthPx = field.toPixels(obstacle.depthMeters);

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(degToRad(obstacle.rotation));

    // Render specific equipment type
    switch (obstacle.type) {
      case OBSTACLE_TYPES.JUMP_SINGLE:
      case OBSTACLE_TYPES.JUMP_DOUBLE:
      case OBSTACLE_TYPES.JUMP_TRIPLE:
      case OBSTACLE_TYPES.JUMP_WALL:
      case OBSTACLE_TYPES.JUMP_TIRE:
        this._renderJump(ctx, obstacle, widthPx, depthPx);
        break;

      case OBSTACLE_TYPES.JUMP_LONG:
        this._renderLongJump(ctx, obstacle, widthPx, depthPx);
        break;

      case OBSTACLE_TYPES.TUNNEL:
        this._renderTunnel(ctx, obstacle, widthPx, depthPx, field);
        break;

      case OBSTACLE_TYPES.A_FRAME:
        this._renderAFrame(ctx, obstacle, widthPx, depthPx, field);
        break;

      case OBSTACLE_TYPES.DOG_WALK:
        this._renderDogWalk(ctx, obstacle, widthPx, depthPx, field);
        break;

      case OBSTACLE_TYPES.SEESAW:
        this._renderSeesaw(ctx, obstacle, widthPx, depthPx, field);
        break;

      case OBSTACLE_TYPES.WEAVE_6:
      case OBSTACLE_TYPES.WEAVE_12:
        this._renderWeavePoles(ctx, obstacle, widthPx, depthPx, field);
        break;

      case OBSTACLE_TYPES.PAUSE_TABLE:
        this._renderPauseTable(ctx, obstacle, widthPx, depthPx);
        break;

      case OBSTACLE_TYPES.START_FINISH:
        this._renderStartFinish(ctx, obstacle, widthPx, depthPx);
        break;

      default:
        this._renderGenericBox(ctx, obstacle, widthPx, depthPx);
        break;
    }

    // Render Direction & Reverse Wrap Badge Overlay
    this._renderWrapIndicator(ctx, obstacle, widthPx, depthPx);

    ctx.restore();

    // Render Selection Handles (Rotation & Resize controls)
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

  // --- Equipment Sub-Renderers ---

  static _renderJump(ctx, obs, w, d) {
    const halfW = w / 2;
    const wingSize = 12;

    // Upright Wings (Left & Right)
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = obs.def.color;
    ctx.lineWidth = 3;

    // Left Wing
    ctx.fillRect(-halfW - wingSize, -wingSize / 2, wingSize, wingSize);
    ctx.strokeRect(-halfW - wingSize, -wingSize / 2, wingSize, wingSize);

    // Right Wing
    ctx.fillRect(halfW, -wingSize / 2, wingSize, wingSize);
    ctx.strokeRect(halfW, -wingSize / 2, wingSize, wingSize);

    // Jump Bar(s)
    const barCount = obs.type === OBSTACLE_TYPES.JUMP_TRIPLE ? 3 : (obs.type === OBSTACLE_TYPES.JUMP_DOUBLE ? 2 : 1);
    const barSpacing = d / (barCount + 1);

    for (let i = 0; i < barCount; i++) {
      const yPos = -d / 2 + barSpacing * (i + 1);

      // Striped bar background
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#f8fafc';
      ctx.beginPath();
      ctx.moveTo(-halfW, yPos);
      ctx.lineTo(halfW, yPos);
      ctx.stroke();

      // Colored stripes
      ctx.lineWidth = 6;
      ctx.strokeStyle = obs.def.color;
      ctx.setLineDash([10, 10]);
      ctx.beginPath();
      ctx.moveTo(-halfW, yPos);
      ctx.lineTo(halfW, yPos);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Special rendering for Tire Jump
    if (obs.type === OBSTACLE_TYPES.JUMP_TIRE) {
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  static _renderLongJump(ctx, obs, w, d) {
    const halfW = w / 2;
    const plankCount = 4;
    const step = d / plankCount;

    for (let i = 0; i < plankCount; i++) {
      const y = -d / 2 + i * step;
      ctx.fillStyle = i % 2 === 0 ? '#0284c7' : '#e0f2fe';
      ctx.fillRect(-halfW, y, w, step - 2);
      ctx.strokeStyle = '#0369a1';
      ctx.strokeRect(-halfW, y, w, step - 2);
    }
  }

  static _renderTunnel(ctx, obs, w, d, field) {
    const localPts = (typeof obs.getTunnelLocalSplinePoints === 'function')
      ? obs.getTunnelLocalSplinePoints(30)
      : null;
    const wPx = field.toPixels(obs.widthMeters || 0.6);

    ctx.save();

    if (!localPts || localPts.length === 0) {
      const halfW = w / 2;
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(-halfW, -d / 2, w, d);
      ctx.restore();
      return;
    }

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
    const halfW = w / 2;
    const halfD = d / 2;
    const contactLenPx = field.toPixels(obs.def.contactLengthMeters || 1.06);

    // Main body (emerald ramp)
    ctx.fillStyle = '#10b981';
    ctx.fillRect(-halfW, -halfD, w, d);
    ctx.strokeStyle = '#065f46';
    ctx.lineWidth = 2;
    ctx.strokeRect(-halfW, -halfD, w, d);

    // Center apex ridge line
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-halfW, 0);
    ctx.lineTo(halfW, 0);
    ctx.stroke();

    // Yellow Contact Zones at Top & Bottom
    ctx.fillStyle = '#facc15'; // Agility yellow contact
    // Top contact zone
    ctx.fillRect(-halfW, -halfD, w, contactLenPx);
    // Bottom contact zone
    ctx.fillRect(-halfW, halfD - contactLenPx, w, contactLenPx);

    // Rubber slatted grips
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.lineWidth = 2;
    for (let y = -halfD + 10; y < halfD; y += 14) {
      ctx.beginPath();
      ctx.moveTo(-halfW + 2, y);
      ctx.lineTo(halfW - 2, y);
      ctx.stroke();
    }
  }

  static _renderDogWalk(ctx, obs, w, d, field) {
    const halfW = w / 2;
    const halfD = d / 2;
    const contactLenPx = field.toPixels(obs.def.contactLengthMeters || 0.9);

    // Main plank (emerald green)
    ctx.fillStyle = '#059669';
    ctx.fillRect(-halfW, -halfD, w, d);
    ctx.strokeStyle = '#064e3b';
    ctx.lineWidth = 2;
    ctx.strokeRect(-halfW, -halfD, w, d);

    // Plank seams (3 equal planks of 3.6m)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-halfW, -halfD + d / 3);
    ctx.lineTo(halfW, -halfD + d / 3);
    ctx.moveTo(-halfW, halfD - d / 3);
    ctx.lineTo(halfW, halfD - d / 3);
    ctx.stroke();

    // Yellow Contact Zones
    ctx.fillStyle = '#facc15';
    ctx.fillRect(-halfW, -halfD, w, contactLenPx);
    ctx.fillRect(-halfW, halfD - contactLenPx, w, contactLenPx);
  }

  static _renderSeesaw(ctx, obs, w, d, field) {
    const halfW = w / 2;
    const halfD = d / 2;
    const contactLenPx = field.toPixels(obs.def.contactLengthMeters || 0.9);

    // Plank
    ctx.fillStyle = '#047857';
    ctx.fillRect(-halfW, -halfD, w, d);
    ctx.strokeStyle = '#064e3b';
    ctx.lineWidth = 2;
    ctx.strokeRect(-halfW, -halfD, w, d);

    // Fulcrum Pivot line in center
    ctx.fillStyle = '#334155';
    ctx.fillRect(-halfW - 4, -4, w + 8, 8);

    // Yellow Contact Zones
    ctx.fillStyle = '#facc15';
    ctx.fillRect(-halfW, -halfD, w, contactLenPx);
    ctx.fillRect(-halfW, halfD - contactLenPx, w, contactLenPx);
  }

  static _renderWeavePoles(ctx, obs, w, d, field) {
    const count = obs.def.poles || 6;
    const halfD = d / 2;
    const poleStep = d / (count - 1);

    // Metal Base Strip
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, -halfD);
    ctx.lineTo(0, halfD);
    ctx.stroke();

    // Render individual weave poles (striped vertical caps)
    for (let i = 0; i < count; i++) {
      const y = -halfD + i * poleStep;

      ctx.fillStyle = i % 2 === 0 ? '#8b5cf6' : '#ffffff';
      ctx.beginPath();
      ctx.arc(0, y, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#4c1d95';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  static _renderPauseTable(ctx, obs, w, d) {
    ctx.fillStyle = '#ec4899';
    ctx.fillRect(-w / 2, -d / 2, w, d);
    ctx.strokeStyle = '#831843';
    ctx.lineWidth = 3;
    ctx.strokeRect(-w / 2, -d / 2, w, d);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TABLE', 0, 0);
  }

  static _renderStartFinish(ctx, obs, w, d) {
    const halfW = w / 2;
    // Checkered banner line
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 4;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(-halfW, 0);
    ctx.lineTo(halfW, 0);
    ctx.stroke();
    ctx.setLineDash([]);

    // Timing sensors / poles at sides
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(-halfW - 6, -8, 12, 16);
    ctx.fillRect(halfW - 6, -8, 12, 16);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(obs.type === OBSTACLE_TYPES.START_FINISH ? 'START/FINISH' : 'GATE', 0, -12);
  }

  static _renderGenericBox(ctx, obs, w, d) {
    ctx.fillStyle = obs.def.color || '#64748b';
    ctx.fillRect(-w / 2, -d / 2, w, d);
    ctx.strokeStyle = '#1e293b';
    ctx.strokeRect(-w / 2, -d / 2, w, d);
  }

  // --- Wrap & Direction Indicator Renderer ---

  static _renderWrapIndicator(ctx, obs, w, d) {
    if (!obs.wrap || obs.wrap === WRAP_DIRECTIONS.NONE) return;

    const halfW = w / 2;
    const isReverse = obs.wrap === WRAP_DIRECTIONS.REVERSE_LEFT || obs.wrap === WRAP_DIRECTIONS.REVERSE_RIGHT;
    const isLeft = obs.wrap === WRAP_DIRECTIONS.LEFT || obs.wrap === WRAP_DIRECTIONS.REVERSE_LEFT;

    const wingX = isLeft ? -halfW : halfW;

    ctx.save();
    // Render curved directional arrow Badge on wing
    ctx.translate(wingX, 0);

    // Badge Background Pill
    ctx.fillStyle = isReverse ? '#ef4444' : '#3b82f6'; // Red for Reverse/Backside Wrap, Blue for Standard
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();

    // Curved Arrow Graphic
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    const startAngle = isReverse ? (isLeft ? Math.PI / 4 : (3 * Math.PI) / 4) : (isLeft ? -Math.PI / 4 : (-3 * Math.PI) / 4);
    const endAngle = startAngle + (isLeft ? -Math.PI : Math.PI);
    ctx.arc(0, 0, 8, startAngle, endAngle, isLeft);
    ctx.stroke();

    // Text Label below (PUSH / REV / WRAP)
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isReverse ? 'REV' : 'WRAP', 0, 0);

    ctx.restore();
  }

  // --- Interactive Selection Handles (Rotate & Scale) ---

  static _renderSelectionHandles(ctx, px, py, w, d, rotationDeg) {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(degToRad(rotationDeg));

    const halfW = w / 2 + 10;
    const halfD = d / 2 + 10;

    // Bounding Box
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(-halfW, -halfD, halfW * 2, halfD * 2);
    ctx.setLineDash([]);

    // Top Rotation Handle Knob
    const rotateHandleY = -halfD - 20;
    ctx.beginPath();
    ctx.moveTo(0, -halfD);
    ctx.lineTo(0, rotateHandleY);
    ctx.strokeStyle = '#38bdf8';
    ctx.stroke();

    ctx.fillStyle = '#0284c7';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, rotateHandleY, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }
}
