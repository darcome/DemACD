/**
 * Config & Constants for Agility Course Designer
 */

export const WRAP_DIRECTIONS = {
  NONE: 'none',             // Straight through
  LEFT: 'left',             // Frontside wrap left
  RIGHT: 'right',           // Frontside wrap right
  REVERSE_LEFT: 'rev_left', // Reverse / Backside wrap left (push left)
  REVERSE_RIGHT: 'rev_right'// Reverse / Backside wrap right (push right)
};

export const FIELD_SHAPES = {
  RECTANGLE: 'rectangle',
  L_SHAPE: 'l_shape',
  OCTAGON: 'octagon',
  CUSTOM: 'custom'
};

export const OBSTACLE_TYPES = {
  JUMP_SINGLE: 'jump_single',
  JUMP_DOUBLE: 'jump_double',
  JUMP_TRIPLE: 'jump_triple',
  JUMP_LONG: 'jump_long',
  JUMP_TIRE: 'jump_tire',
  JUMP_WALL: 'jump_wall',
  TUNNEL: 'tunnel',
  A_FRAME: 'a_frame',
  DOG_WALK: 'dog_walk',
  SEESAW: 'seesaw',
  WEAVE_6: 'weave_6',
  WEAVE_12: 'weave_12',
  PAUSE_TABLE: 'pause_table',
  START_FINISH: 'start_finish'
};

export const OBSTACLE_DEFS = {
  [OBSTACLE_TYPES.JUMP_SINGLE]: {
    name: 'Single Jump',
    category: 'Jumps',
    widthMeters: 1.5,
    depthMeters: 0.5,
    icon: 'fa-grip-lines-vertical',
    color: '#3b82f6',
    hasWrap: true,
    description: 'Standard single bar jump with upright wings'
  },
  [OBSTACLE_TYPES.JUMP_DOUBLE]: {
    name: 'Double Jump',
    category: 'Jumps',
    widthMeters: 1.5,
    depthMeters: 0.8,
    icon: 'fa-align-justify',
    color: '#2563eb',
    hasWrap: true,
    description: 'Spread jump with two ascending bars'
  },
  [OBSTACLE_TYPES.JUMP_TRIPLE]: {
    name: 'Triple Jump',
    category: 'Jumps',
    widthMeters: 1.5,
    depthMeters: 1.2,
    icon: 'fa-bars',
    color: '#1d4ed8',
    hasWrap: true,
    description: 'Spread jump with three ascending bars'
  },
  [OBSTACLE_TYPES.JUMP_LONG]: {
    name: 'Long Jump',
    category: 'Jumps',
    widthMeters: 1.5,
    depthMeters: 1.5,
    icon: 'fa-equals',
    color: '#0284c7',
    hasWrap: false,
    description: 'Broad jump composed of 4-5 horizontal planks'
  },
  [OBSTACLE_TYPES.JUMP_TIRE]: {
    name: 'Tire Jump',
    category: 'Jumps',
    widthMeters: 1.4,
    depthMeters: 0.6,
    icon: 'fa-circle-notch',
    color: '#06b6d4',
    hasWrap: true,
    description: 'Circular tire mounted in a frame'
  },
  [OBSTACLE_TYPES.JUMP_WALL]: {
    name: 'Wall Jump',
    category: 'Jumps',
    widthMeters: 1.5,
    depthMeters: 0.6,
    icon: 'fa-monument',
    color: '#0891b2',
    hasWrap: true,
    description: 'Solid wall jump with removable towers'
  },
  [OBSTACLE_TYPES.TUNNEL]: {
    name: 'Flexible Tunnel',
    category: 'Tunnels',
    widthMeters: 0.6,
    lengthMeters: 5.0,
    icon: 'fa-ring',
    color: '#f59e0b',
    hasWrap: false,
    isFlexible: true,
    description: 'Flexible pipe tunnel bendable into curves'
  },
  [OBSTACLE_TYPES.A_FRAME]: {
    name: 'A-Frame',
    category: 'Contact Equipment',
    widthMeters: 0.9,
    lengthMeters: 5.4,
    icon: 'fa-caret-up',
    color: '#10b981',
    hasWrap: false,
    contactLengthMeters: 1.06,
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
  [OBSTACLE_TYPES.PAUSE_TABLE]: {
    name: 'Pause Table',
    category: 'Other',
    widthMeters: 1.0,
    depthMeters: 1.0,
    icon: 'fa-square',
    color: '#ec4899',
    hasWrap: false,
    description: '1m x 1m square elevated table'
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

export const DEFAULT_FIELD = {
  shape: FIELD_SHAPES.RECTANGLE,
  widthMeters: 40,
  lengthMeters: 20,
  gridSizeMeters: 1.0,
  showGrid: true,
  snapToGrid: true,
  unit: 'm' // 'm' or 'ft'
};

export const COURSE_PRESETS = [
  {
    name: 'Novice Agility Standard',
    description: 'Beginner-friendly course with clear lines, standard wraps and a simple tunnel curve.',
    field: { widthMeters: 40, lengthMeters: 20, shape: FIELD_SHAPES.RECTANGLE },
    obstacles: [
      { type: OBSTACLE_TYPES.START_FINISH, x: 5, y: 17, rotation: 0, seq: 1 },
      { type: OBSTACLE_TYPES.JUMP_SINGLE, x: 10, y: 17, rotation: 0, seq: 2, wrap: WRAP_DIRECTIONS.NONE },
      { type: OBSTACLE_TYPES.TUNNEL, x: 17, y: 14, rotation: 30, seq: 3, curve: 45 },
      { type: OBSTACLE_TYPES.A_FRAME, x: 25, y: 10, rotation: 90, seq: 4 },
      { type: OBSTACLE_TYPES.JUMP_SINGLE, x: 30, y: 16, rotation: -45, seq: 5, wrap: WRAP_DIRECTIONS.REVERSE_LEFT },
      { type: OBSTACLE_TYPES.WEAVE_6, x: 22, y: 17, rotation: 180, seq: 6 },
      { type: OBSTACLE_TYPES.DOG_WALK, x: 10, y: 6, rotation: 0, seq: 7 },
      { type: OBSTACLE_TYPES.JUMP_DOUBLE, x: 28, y: 5, rotation: 45, seq: 8, wrap: WRAP_DIRECTIONS.RIGHT },
      { type: OBSTACLE_TYPES.START_FINISH, x: 35, y: 5, rotation: 90, seq: 9 }
    ]
  },
  {
    name: 'Masters Jumpers (Reverse Wraps Focus)',
    description: 'Technical jumpers sequence featuring multiple reverse wraps (backside jumps) and tight handling choices.',
    field: { widthMeters: 45, lengthMeters: 25, shape: FIELD_SHAPES.RECTANGLE },
    obstacles: [
      { type: OBSTACLE_TYPES.START_FINISH, x: 6, y: 21, rotation: 0, seq: 1 },
      { type: OBSTACLE_TYPES.JUMP_SINGLE, x: 13, y: 21, rotation: 0, seq: 2, wrap: WRAP_DIRECTIONS.NONE },
      { type: OBSTACLE_TYPES.JUMP_SINGLE, x: 20, y: 16, rotation: 45, seq: 3, wrap: WRAP_DIRECTIONS.REVERSE_RIGHT },
      { type: OBSTACLE_TYPES.TUNNEL, x: 28, y: 19, rotation: -60, seq: 4, curve: -60 },
      { type: OBSTACLE_TYPES.WEAVE_12, x: 37, y: 13, rotation: 90, seq: 5 },
      { type: OBSTACLE_TYPES.JUMP_SINGLE, x: 30, y: 8, rotation: -30, seq: 6, wrap: WRAP_DIRECTIONS.REVERSE_LEFT },
      { type: OBSTACLE_TYPES.JUMP_TRIPLE, x: 21, y: 6, rotation: 0, seq: 7, wrap: WRAP_DIRECTIONS.LEFT },
      { type: OBSTACLE_TYPES.JUMP_SINGLE, x: 13, y: 8, rotation: 60, seq: 8, wrap: WRAP_DIRECTIONS.REVERSE_RIGHT },
      { type: OBSTACLE_TYPES.START_FINISH, x: 6, y: 8, rotation: 90, seq: 9 }
    ]
  },
  {
    name: 'Multi-Pass Loop Challenge (Repeated Obstacles)',
    description: 'Advanced agility course demonstrating multi-pass obstacle routing where the dog traverses Jump #2/6 and Tunnel #3/7 multiple times.',
    field: { widthMeters: 40, lengthMeters: 20, shape: FIELD_SHAPES.RECTANGLE },
    obstacles: [
      { type: OBSTACLE_TYPES.START_FINISH, x: 5, y: 15, rotation: 0, seq: 1 },
      { type: OBSTACLE_TYPES.JUMP_SINGLE, x: 13, y: 15, rotation: 0, seq: '2, 6', wrap: WRAP_DIRECTIONS.NONE },
      { type: OBSTACLE_TYPES.TUNNEL, x: 22, y: 12, rotation: 30, seq: '3, 7', curve: 45 },
      { type: OBSTACLE_TYPES.A_FRAME, x: 32, y: 8, rotation: 90, seq: 4 },
      { type: OBSTACLE_TYPES.WEAVE_6, x: 25, y: 17, rotation: 180, seq: 5 },
      { type: OBSTACLE_TYPES.START_FINISH, x: 5, y: 5, rotation: 90, seq: 8 }
    ]
  }
];
