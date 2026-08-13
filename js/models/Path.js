/**
 * Path & Trajectory Model for Agility Course Designer
 * Manages sequence ordering, total course distance calculation, and dog trajectory splines.
 */
import { distance, formatDistance } from '../core/math.js';

export class CoursePath {
  constructor() {
    this.showPath = true;
    this.showSequenceNumbers = true;
    this.showDirectionArrows = true;
  }

  /**
   * Returns array of sequence steps [{ seq: 1, obstacle: obsA }, { seq: 2, obstacle: obsB }, { seq: 5, obstacle: obsA }] sorted by sequence number
   */
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

  /**
   * Returns unique obstacles that have sequence numbers assigned, sorted by their lowest sequence number
   */
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

  /**
   * Auto sequence obstacles based on creation or layout order
   */
  autoSequence(obstacles) {
    let num = 1;
    obstacles.forEach(obs => {
      obs.seq = num++;
    });
  }

  /**
   * Returns full sequence trajectory waypoints connecting all course steps
   */
  getAllWaypoints(obstacles) {
    const steps = this.getSequencedSteps(obstacles);
    if (steps.length === 0) return [];

    let allPoints = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const obs = step.obstacle;
      const prevPt = allPoints.length > 0 ? allPoints[allPoints.length - 1] : null;
      
      const v = typeof obs.getWaypoints === 'function' ? obs.getWaypoints(prevPt) : (() => {
        const approach = obs.getApproachVector();
        return [approach.entry, approach.exit];
      })();

      allPoints = allPoints.concat(v);
    }

    return allPoints;
  }

  /**
   * Calculate total course run length in meters across all sequence steps
   */
  calculateTotalDistance(obstacles) {
    const steps = this.getSequencedSteps(obstacles);
    if (steps.length < 2) return 0;

    let totalDist = 0;
    for (let i = 0; i < steps.length - 1; i++) {
      const o1 = steps[i].obstacle;
      const o2 = steps[i + 1].obstacle;
      const v1 = o1.getApproachVector();
      const v2 = o2.getApproachVector();

      const distBetween = distance(v1.exit, v2.entry);
      const o1Length = o1.depthMeters || 1.0;
      totalDist += distBetween + (i === 0 ? o1Length / 2 : o1Length);
    }
    return totalDist;
  }

  /**
   * Returns human readable string for total course length
   */
  getFormattedDistance(obstacles, unit = 'm') {
    const totalMeters = this.calculateTotalDistance(obstacles);
    return formatDistance(totalMeters, unit);
  }
}
