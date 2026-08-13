/**
 * Path & Sequence Trajectory Renderer for Agility Course Designer
 */
import { distance } from '../core/math.js';

export class PathRenderer {
  static render(ctx, pathModel, obstacles, field) {
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
        this._renderSequenceBadge(ctx, obs, field);
      });
    }
  }

  static _renderSequenceBadge(ctx, obs, field) {
    const px = field.toPixels(obs.x);
    const py = field.toPixels(obs.y);
    const widthPx = field.toPixels(obs.widthMeters);
    const depthPx = field.toPixels(obs.depthMeters);

    const seqStr = typeof obs.getSeqString === 'function' ? obs.getSeqString() : (obs.seq ? obs.seq.toString() : '');
    if (!seqStr) return;

    // Position badge offset near the takeoff side of the obstacle
    const badgeX = px - widthPx / 2 - 18;
    const badgeY = py - depthPx / 2 - 18;
    const badgeRadius = Math.max(14, 10 + seqStr.length * 3);

    ctx.save();
    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;

    // Circle Badge background
    ctx.fillStyle = '#0f172a'; // Dark slate
    ctx.strokeStyle = '#38bdf8'; // Electric sky blue border
    ctx.lineWidth = 2.5;

    ctx.beginPath();
    if (seqStr.length <= 3) {
      ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
    } else {
      const boxW = badgeRadius * 2.2;
      const boxH = badgeRadius * 1.6;
      ctx.roundRect ? ctx.roundRect(badgeX - boxW / 2, badgeY - boxH / 2, boxW, boxH, 8) : ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();

    // Sequence Number Text
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 13px Outfit, Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(seqStr, badgeX, badgeY);

    ctx.restore();
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
