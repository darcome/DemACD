/**
 * History Manager for Agility Course Designer (Undo / Redo Stack)
 */

export class HistoryManager {
  constructor(maxSize = 50) {
    this.undoStack = [];
    this.redoStack = [];
    this.maxSize = maxSize;
    this.onChangeCallback = null;
  }

  setOnChange(callback) {
    this.onChangeCallback = callback;
  }

  push(state) {
    // Clone state JSON
    const serialized = JSON.stringify(state);
    
    // Don't push identical consecutive states
    if (this.undoStack.length > 0 && this.undoStack[this.undoStack.length - 1] === serialized) {
      return;
    }

    this.undoStack.push(serialized);
    if (this.undoStack.length > this.maxSize) {
      this.undoStack.shift();
    }
    this.redoStack = []; // Clear redo stack on new action
    
    this._notify();
  }

  undo(currentState) {
    if (!this.canUndo()) return null;
    
    // Push current to redo stack
    this.redoStack.push(JSON.stringify(currentState));
    
    const previous = this.undoStack.pop();
    this._notify();
    return JSON.parse(previous);
  }

  redo(currentState) {
    if (!this.canRedo()) return null;

    // Push current to undo stack
    this.undoStack.push(JSON.stringify(currentState));
    
    const next = this.redoStack.pop();
    this._notify();
    return JSON.parse(next);
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this._notify();
  }

  _notify() {
    if (typeof this.onChangeCallback === 'function') {
      this.onChangeCallback({
        canUndo: this.canUndo(),
        canRedo: this.canRedo()
      });
    }
  }
}
