/**
 * Path & Sequence Trajectory Renderer for Agility Course Designer
 */
import { distance } from '../core/math.js';

export class PathRenderer {
  static render(ctx, pathModel, obstacles, field, activeDrag = null) {
    if (!pathModel.showPath && !pathModel.showSequenceNumbers) return;

    const sequencedList = pathModel.getSequencedObstacles(obstacles);
    const steps = typeof pathModel.getSequencedSteps === 'function' ? pathModel.getSequencedSteps(obstacles) : sequencedList.map(o => ({ seq: o.seq, obstacle: o }));
    if (steps.length === 0) return;

    // 1. Draw Dog Path Trajectory Lines & Splines
    if (pathModel.showPath && steps.length >= 2) {
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.shadowColor = 'rgba(56, 189, 248, 0.4)';
      ctx.shadowBlur = 8;

      ctx.beginPath();
      for (let i = 0; i < steps.length - 1; i++) {
        const obs1 = steps[i].obstacle;
        const obs2 = steps[i + 1].obstacle;

        const vec1 = obs1.getApproachVector();
        const vec2 = obs2.getApproachVector();

        const p1 = { x: field.toPixels(vec1.exit.x), y: field.toPixels(vec1.exit.y) };
        const p2 = { x: field.toPixels(vec2.entry.x), y: field.toPixels(vec2.entry.y) };

        if (i === 0) {
          ctx.moveTo(field.toPixels(vec1.entry.x), field.toPixels(vec1.entry.y));
          ctx.lineTo(p1.x, p1.y);
        }

        // Draw curved spline or line between exit of obs1 and entry of obs2
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;

        ctx.quadraticCurveTo(midX, midY, p2.x, p2.y);

        // Draw directional arrow on path midpoint
        if (pathModel.showDirectionArrows) {
          this._renderPathArrow(ctx, p1, p2);
        }
      }
      ctx.stroke();
      ctx.restore();
    }

    // 2. Render Sequence Number Badges (1, 2, 3...)
    if (pathModel.showSequenceNumbers) {
      sequencedList.forEach(obs => {
        this._renderSequenceBadge(ctx, obs, field, pathModel.showBadgePosMode, activeDrag);
      });
    }
  }

  static _renderSequenceBadge(ctx, obs, field, isPosModeActive = false, activeDrag = null) {
    const seqArr = typeof obs.getSeqArray === 'function' ? obs.getSeqArray() : (obs.seq ? [obs.seq] : []);
    if (!seqArr || seqArr.length === 0) return;

    const obsPx = field.toPixels(obs.x);
    const obsPy = field.toPixels(obs.y);
    const rxPx = field.toPixels(Math.max(obs.widthMeters / 2 + 0.8, 1.4));
    const ryPx = field.toPixels(Math.max(obs.depthMeters / 2 + 0.8, 1.4));
    const obsRotRad = (obs.rotation * Math.PI) / 180;

    const isThisObsDragged = !!(activeDrag && activeDrag.obs === obs);

    // Render orbital ellipse guide line rotated to match obstacle orientation!
    if (isPosModeActive || obs.isSelected || isThisObsDragged) {
      ctx.save();
      ctx.strokeStyle = (isPosModeActive || isThisObsDragged) ? '#f59e0b' : '#38bdf8';
      ctx.lineWidth = (isPosModeActive || isThisObsDragged) ? 1.8 : 1.2;
      ctx.setLineDash([5, 5]);
      ctx.shadowColor = (isPosModeActive || isThisObsDragged) ? 'rgba(245, 158, 11, 0.4)' : 'rgba(56, 189, 248, 0.3)';
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

    // Render each sequence badge independently
    seqArr.forEach(seq => {
      const bPos = typeof obs.getBadgeWorldPosition === 'function' ? obs.getBadgeWorldPosition(seq) : { x: obs.x, y: obs.y };
      const badgeX = field.toPixels(bPos.x);
      const badgeY = field.toPixels(bPos.y);
      const seqStr = seq.toString();
      const isDraggedSeq = isThisObsDragged && activeDrag.seq === seq;

      ctx.save();
      const baseRadius = 11;
      const badgeRadius = Math.max(baseRadius, 6 + seqStr.length * 2.5);

      // Render Sequence Badge Circle / Pill
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = isDraggedSeq ? '#f59e0b' : (obs.isSelected ? '#38bdf8' : '#38bdf8');
      ctx.lineWidth = isDraggedSeq ? 2.8 : (obs.isSelected ? 2.2 : 1.8);
      ctx.shadowColor = isDraggedSeq ? 'rgba(245, 158, 11, 0.8)' : 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = isDraggedSeq ? 8 : 5;

      ctx.beginPath();
      if (seqStr.length <= 2) {
        ctx.arc(badgeX, badgeY, baseRadius, 0, Math.PI * 2);
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
      ctx.fillStyle = isDraggedSeq ? '#fbbf24' : '#f8fafc';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(seqStr, badgeX, badgeY);
      ctx.restore();
    });
  }

  static _renderPathArrow(ctx, p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len < 30) return;

    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    const angle = Math.atan2(dy, dx);
    const arrowSize = 9;

    ctx.save();
    ctx.translate(midX, midY);
    ctx.rotate(angle);

    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-arrowSize, -arrowSize / 1.8);
    ctx.lineTo(-arrowSize * 0.7, 0);
    ctx.lineTo(-arrowSize, arrowSize / 1.8);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}
