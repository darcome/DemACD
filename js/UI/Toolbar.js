/**
 * Toolbar & Equipment Palette Component for Agility Course Designer
 */
import { OBSTACLE_DEFS, COURSE_PRESETS } from '../config.js';
import { Obstacle } from '../models/Obstacle.js';

export class Toolbar {
  constructor(containerEl, canvasEngine, field, historyManager) {
    this.container = containerEl;
    this.canvasEngine = canvasEngine;
    this.field = field;
    this.historyManager = historyManager;

    this.activeCategory = 'All';
    this.render();
  }

  render() {
    // Categorize obstacles
    const categories = ['All', 'Jumps', 'Tunnels', 'Contact Equipment', 'Weaves', 'Other'];

    this.container.innerHTML = `
      <div class="palette-header">
        <div class="palette-title">
          <i class="fa-solid fa-dog"></i>
          <span>Agility Palette</span>
        </div>
      </div>

      <div class="category-tabs">
        ${categories
          .map(
            cat => `
          <button class="cat-tab ${cat === this.activeCategory ? 'active' : ''}" data-cat="${cat}">
            ${cat}
          </button>
        `
          )
          .join('')}
      </div>

      <div class="obstacle-grid">
        ${Object.entries(OBSTACLE_DEFS)
          .filter(([_, def]) => this.activeCategory === 'All' || def.category === this.activeCategory)
          .map(
            ([type, def]) => `
          <div class="obstacle-card" data-type="${type}" draggable="true">
            <div class="obs-icon" style="background-color: ${def.color}20; color: ${def.color};">
              <i class="fa-solid ${def.icon}"></i>
            </div>
            <div class="obs-info">
              <div class="obs-name">${def.name}</div>
              <div class="obs-size">${def.widthMeters}m × ${def.lengthMeters || def.depthMeters}m</div>
            </div>
            <button class="add-btn" title="Add to Center">
              <i class="fa-solid fa-plus"></i>
            </button>
          </div>
        `
          )
          .join('')}
      </div>
    `;

    this._bindEvents();
  }

  _bindEvents() {
    // Category tab switching
    this.container.querySelectorAll('.cat-tab').forEach(tab => {
      tab.addEventListener('click', e => {
        this.activeCategory = e.target.dataset.cat;
        this.render();
      });
    });

    // Add obstacle on click or drag
    this.container.querySelectorAll('.obstacle-card').forEach(card => {
      const type = card.dataset.type;

      card.addEventListener('click', () => {
        this._addObstacleToCenter(type);
      });

      card.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', type);
      });
    });
  }

  _addObstacleToCenter(type) {
    const centerFieldX = this.field.widthMeters / 2;
    const centerFieldY = this.field.lengthMeters / 2;

    const obs = new Obstacle(type, centerFieldX, centerFieldY);
    this.canvasEngine.addObstacle(obs);
  }
}
