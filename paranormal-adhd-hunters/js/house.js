/* ParanormalADHDhunters — 13 Wren Lane. The layout is described as rooms on a
   half-metre grid over three floors (basement, ground, upstairs). Walls,
   floors, ceilings, collisions, line of sight and the ghost's route finding
   are all generated from that description. */
import * as THREE from 'three';
import { buildProp, buildLamp, buildThrowable, M, mergeGeos, bakeGeo, compactGroup } from './props.js';
import { T, glowTexture, textureFromCanvas, drawSigil } from './textures.js';
import { clamp, closestOnSeg, segsCross, rng } from './util.js';

export const CELL = 0.5;
const GW = 28, GH = 24; // grid: 14 m × 12 m
const WT = 0.14; // wall thickness
export const LAYER = {
  [-1]: { floor: -2.8, top: 0, ceil: -0.2, name: 'Basement' },
  [0]: { floor: 0, top: 3, ceil: 2.8, name: 'Ground Floor' },
  [1]: { floor: 3, top: 5.8, ceil: 5.8, name: 'Upstairs' },
};
export function layerOfY(y) { return y < -1.0 ? -1 : y < 2.0 ? 0 : 1; }

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export const ROOMS = {
  living: { name: 'Living Room', layers: [0], rects: [[0, 5, 5, 12]], wall: 'damaskPurple', floor: 'planks', ghost: true,
    lamps: [[2.5, 8.5, 'chandelier']], sw: [4.93, 9.6, -1, 0] },
  hall: { name: 'Entrance Hall', layers: [0], rects: [[5, 5, 9, 12]], wall: 'stripesGreen', floor: 'planksDark',
    ceil: [[5, 5, 7.5, 12], [7.5, 5, 9, 6], [7.5, 11, 9, 12]], lamps: [[6.3, 8.6, 'pendant']], sw: [5.6, 11.93, 0, -1] },
  dining: { name: 'Dining Room', layers: [0], rects: [[9, 5, 14, 12]], wall: 'floralRed', floor: 'planks', ghost: true,
    lamps: [[11.5, 8.7, 'chandelier']], sw: [9.07, 6.5, 1, 0] },
  kitchen: { name: 'Kitchen', layers: [0], rects: [[9, 0, 14, 5]], wall: 'tileKitchen', floor: 'checker', ghost: true,
    lamps: [[11.4, 2.6, 'pendant']], sw: [12.4, 4.93, 0, -1] },
  study: { name: 'Study', layers: [0], rects: [[0, 0, 5, 5]], wall: 'woodPanel', floor: 'carpetRed', ghost: true,
    lamps: [[2.5, 2.6, 'pendant']], sw: [3.4, 4.93, 0, -1] },
  bath0: { name: 'Downstairs Bathroom', layers: [0], rects: [[6.5, 0, 9, 5]], wall: 'tileWhite', floor: 'bathFloor', ghost: true,
    lamps: [[7.75, 2.5, 'bulb']], sw: [7.0, 4.93, 0, -1] },
  cellar: { name: 'Cellar Stairs', layers: [0, -1], rects: [[5, 0, 6.5, 5]], wall: 'brick', floor: 'concrete',
    floors: { 0: [[5, 4.5, 6.5, 5]] }, ceil: { [-1]: [] }, lamps: [[5.75, 3.4, 'bulb', 0]], sw: [5.07, 4.65, 1, 0] },
  landing: { name: 'Upstairs Landing', layers: [1], rects: [[5, 0, 9, 6], [5, 6, 7.5, 12], [7.5, 11, 9, 12]], wall: 'stripesYellow', floor: 'carpetBlue',
    lamps: [[7.0, 2.8, 'pendant'], [6.25, 9.5, 'bulb']], sw: [5.07, 6.6, 1, 0] },
  master: { name: 'Master Bedroom', layers: [1], rects: [[0, 5, 5, 12]], wall: 'damaskBlue', floor: 'carpetBlue', ghost: true,
    lamps: [[2.6, 8.5, 'pendant']], sw: [4.93, 10.6, -1, 0] },
  nursery: { name: 'Ellie’s Bedroom', layers: [1], rects: [[9, 5, 14, 12]], wall: 'floralChild', floor: 'planks', ghost: true,
    lamps: [[11.5, 8.6, 'pendant']], sw: [9.07, 6.5, 1, 0] },
  bath1: { name: 'Upstairs Bathroom', layers: [1], rects: [[9, 0, 14, 5]], wall: 'tileWhite', floor: 'bathFloor', ghost: true,
    lamps: [[11.5, 2.5, 'bulb']], sw: [9.07, 3.4, 1, 0] },
  sewing: { name: 'Sewing Room', layers: [1], rects: [[0, 0, 5, 5]], wall: 'stripesYellow', floor: 'planksDark', ghost: true,
    lamps: [[2.5, 2.5, 'pendant']], sw: [4.93, 3.4, -1, 0] },
  basement: { name: 'Basement', layers: [-1], rects: [[6.5, 0, 11, 7]], wall: 'brick', floor: 'concrete', ghost: 'basement',
    lamps: [[8.2, 2.2, 'bulb'], [9.3, 5.3, 'bulb']], sw: [6.57, 1.6, 1, 0] },
  storage: { name: 'Old Storage Room', layers: [-1], rects: [[11, 0, 14, 7]], wall: 'brick', floor: 'concrete', ghost: 'basement',
    lamps: [[12.5, 3.5, 'bulb']], sw: [11.07, 4.7, 1, 0] },
  yard: { name: 'Front Yard', layers: [0], rects: [], outside: true, lamps: [], sw: null },
};

// line 'x' = a wall at x = at running along z; line 'z' = a wall at z = at running along x
const DOORS = [
  { id: 'front', layer: 0, line: 'z', at: 12, from: 6, to: 7, hinge: 'min', into: 'hall', rooms: ['hall', 'yard'], ext: true },
  { id: 'living', layer: 0, line: 'x', at: 5, from: 8, to: 9, hinge: 'min', into: 'living', rooms: ['hall', 'living'] },
  { id: 'dining', layer: 0, line: 'x', at: 9, from: 5, to: 6, hinge: 'min', into: 'dining', rooms: ['hall', 'dining'] },
  { id: 'bath0', layer: 0, line: 'z', at: 5, from: 7.5, to: 8.5, hinge: 'max', into: 'bath0', rooms: ['hall', 'bath0'] },
  { id: 'cellar', layer: 0, line: 'z', at: 5, from: 5.5, to: 6.5, hinge: 'min', into: 'hall', rooms: ['hall', 'cellar'], lock: 'cellar' },
  { id: 'study', layer: 0, line: 'z', at: 5, from: 2, to: 3, hinge: 'min', into: 'study', rooms: ['living', 'study'] },
  { id: 'kitchen', layer: 0, line: 'z', at: 5, from: 11, to: 12, hinge: 'min', into: 'kitchen', rooms: ['dining', 'kitchen'] },
  { id: 'back', layer: 0, line: 'z', at: 0, from: 12, to: 13, hinge: 'min', into: 'kitchen', rooms: ['kitchen', null], ext: true, lock: 'always' },
  { id: 'master', layer: 1, line: 'x', at: 5, from: 9, to: 10, hinge: 'max', into: 'master', rooms: ['landing', 'master'] },
  { id: 'sewing', layer: 1, line: 'x', at: 5, from: 2, to: 3, hinge: 'min', into: 'sewing', rooms: ['landing', 'sewing'] },
  { id: 'nursery', layer: 1, line: 'x', at: 9, from: 5, to: 6, hinge: 'min', into: 'nursery', rooms: ['landing', 'nursery'] },
  { id: 'bath1', layer: 1, line: 'x', at: 9, from: 2, to: 3, hinge: 'max', into: 'bath1', rooms: ['landing', 'bath1'] },
  { id: 'cellarBottom', layer: -1, line: 'x', at: 6.5, from: 0, to: 1, open: true, rooms: ['cellar', 'basement'] },
  { id: 'storage', layer: -1, line: 'x', at: 11, from: 3, to: 4, hinge: 'min', into: 'storage', rooms: ['basement', 'storage'] },
];
// Gaps with no wall and no door (the top of the main stairs).
const OPENINGS = [{ layer: 1, line: 'z', at: 6, from: 7.5, to: 9 }];
// The stairwell hole upstairs. Edges against the landing become railings.
const HOLE = { layer: 1, rect: [7.5, 6, 9, 11] };

const STAIRS = [
  { id: 'main', rect: [7.5, 6, 9, 11], z0: 11, y0: 0, z1: 6, y1: 3, steps: 15, tex: 'planksDark' },
  { id: 'cellar', rect: [5, 0.9, 6.5, 4.5], z0: 4.5, y0: 0, z1: 0.9, y1: -2.8, steps: 14, tex: 'woodDark' },
];

/** Furniture: [type, room, x, z, quarterTurns, opts]. Quarter turns: 0 faces +z (south), 1 faces +x, 2 faces −z, 3 faces −x. */
const FURNITURE = [
  // Living room
  ['fireplace', 'living', 0.3, 8.5, 1, { w: 1.8 }],
  ['painting', 'living', 0.08, 8.5, 1, { tex: 'portrait1', y: 1.95 }],
  ['sofa', 'living', 2.95, 8.5, 3, { w: 2.0, fabric: 'fabricGreen' }],
  ['table', 'living', 1.75, 8.5, 1, { w: 1.0, d: 0.55, h: 0.45, wood: 'woodDark' }],
  ['armchair', 'living', 1.0, 6.05, 0, { fabric: 'fabricRed' }],
  ['bookshelf', 'living', 4.15, 5.25, 0, { w: 1.3 }],
  ['piano', 'living', 3.1, 11.55, 2, {}],
  ['rockingChair', 'living', 1.1, 10.9, 1, {}],
  ['table', 'living', 0.35, 11.6, 0, { w: 0.5, d: 0.5, h: 0.65, wood: 'woodDark' }],
  ['tableLamp', 'living', 0.35, 11.6, 0, { y: 0.65 }],
  ['sheeted', 'living', 4.4, 6.75, 0, { w: 0.8, d: 0.8, h: 1.0 }],
  ['rug', 'living', 2.1, 8.5, 0, { w: 2.4, d: 3.2, tex: 'rug' }],
  ['cobweb', 'living', 0.07, 5.07, 0, { s: 0.8, y: 2.78, corner: 'nw' }],
  // Hall
  ['clock', 'hall', 5.25, 6.9, 1, {}],
  ['table', 'hall', 5.24, 10.3, 1, { w: 1.0, d: 0.36, h: 0.8, wood: 'woodDark' }],
  ['mirror', 'hall', 5.08, 10.3, 1, { y: 1.6 }],
  ['coatRack', 'hall', 5.35, 11.55, 0, {}],
  ['rug', 'hall', 6.35, 8.6, 0, { w: 1.3, d: 5.2, tex: 'carpetRed' }],
  ['cobweb', 'hall', 8.93, 11.93, 0, { s: 0.6, y: 2.78, corner: 'se' }],
  // Dining room
  ['table', 'dining', 11.5, 8.7, 0, { w: 1.1, d: 2.3, h: 0.78 }],
  ['chair', 'dining', 10.7, 8.0, 1, {}], ['chair', 'dining', 10.7, 9.4, 1, {}],
  ['chair', 'dining', 12.3, 8.0, 3, {}], ['chair', 'dining', 12.3, 9.4, 3, {}],
  ['chair', 'dining', 11.5, 7.2, 0, {}], ['chair', 'dining', 11.5, 10.2, 2, {}],
  ['dresser', 'dining', 13.72, 8.7, 3, { w: 1.4, d: 0.45, h: 1.0 }],
  ['dresser', 'dining', 11.5, 11.72, 2, { w: 1.6, d: 0.45, h: 0.85 }],
  ['painting', 'dining', 11.5, 11.93, 2, { tex: 'portrait2', y: 1.9 }],
  ['plant', 'dining', 13.55, 11.5, 0, {}],
  ['rug', 'dining', 11.5, 8.7, 0, { w: 2.6, d: 3.6, tex: 'rug' }],
  ['cobweb', 'dining', 13.93, 5.07, 0, { s: 0.7, y: 2.78, corner: 'ne' }],
  // Kitchen
  ['counter', 'kitchen', 10.4, 0.32, 0, { w: 2.6, sink: true }],
  ['counter', 'kitchen', 9.32, 2.2, 1, { w: 1.4 }],
  ['stove', 'kitchen', 13.66, 0.95, 3, {}],
  ['fridge', 'kitchen', 13.64, 2.05, 3, {}],
  ['wardrobe', 'kitchen', 13.66, 3.9, 3, { w: 1.0, d: 0.6, h: 2.1, wood: 'woodLight', hideName: 'Pantry' }],
  ['table', 'kitchen', 11.3, 2.9, 0, { w: 1.2, d: 0.8, h: 0.76, wood: 'woodLight' }],
  ['chair', 'kitchen', 11.3, 3.75, 2, {}], ['chair', 'kitchen', 10.4, 2.9, 1, {}],
  // Study
  ['desk', 'study', 2.5, 0.42, 0, { w: 1.5, d: 0.7 }],
  ['chair', 'study', 2.5, 1.3, 2, { fabric: 'fabricRed' }],
  ['tableLamp', 'study', 1.95, 0.35, 0, { y: 0.77, shade: '#5a7a4a' }],
  ['bookshelf', 'study', 0.2, 1.65, 1, { w: 1.4 }],
  ['bookshelf', 'study', 0.2, 3.35, 1, { w: 1.4 }],
  ['wardrobe', 'study', 4.68, 1.0, 3, { w: 1.0, d: 0.6, h: 2.0, wood: 'woodDark', hideName: 'Cabinet' }],
  ['armchair', 'study', 4.15, 3.6, 3, { fabric: 'fabricGreen' }],
  ['globe', 'study', 1.3, 4.35, 0, {}],
  ['rug', 'study', 2.5, 2.6, 0, { w: 2.2, d: 1.8, tex: 'rug' }],
  // Downstairs bathroom
  ['bathtub', 'bath0', 7.75, 0.45, 0, {}],
  ['toilet', 'bath0', 8.66, 2.5, 3, {}],
  ['sink', 'bath0', 6.84, 2.7, 1, {}],
  // Cellar stairs
  ['cobweb', 'cellar', 5.07, 0.07, 0, { s: 0.7, y: -0.22, corner: 'nw' }],
  // Landing
  ['chest', 'landing', 7.0, 0.32, 0, { w: 1.2 }],
  ['table', 'landing', 5.27, 4.3, 1, { w: 0.6, d: 0.4, h: 0.8, wood: 'woodDark' }],
  ['painting', 'landing', 8.1, 0.08, 0, { tex: 'portrait3', y: 1.7 }],
  ['sheeted', 'landing', 8.5, 0.55, 0, { w: 0.7, d: 0.7, h: 1.1 }],
  ['table', 'landing', 5.27, 11.4, 1, { w: 0.6, d: 0.4, h: 0.8, wood: 'woodDark' }],
  ['rug', 'landing', 6.25, 8.5, 0, { w: 1.0, d: 6.2, tex: 'carpetRed' }],
  ['cobweb', 'landing', 5.07, 11.93, 0, { s: 0.7, y: 5.78, corner: 'sw' }],
  // Master bedroom
  ['bed', 'master', 1.1, 8.1, 1, { w: 1.6, d: 2.1, blanket: 'fabricBlue' }],
  ['nightstand', 'master', 0.3, 6.75, 1, {}],
  ['nightstand', 'master', 0.3, 9.45, 1, {}],
  ['tableLamp', 'master', 0.3, 6.75, 0, { y: 0.55 }],
  ['wardrobe', 'master', 2.7, 5.33, 0, { w: 1.3, d: 0.6, h: 2.1, hideName: 'Wardrobe' }],
  ['dresser', 'master', 2.4, 11.72, 2, { w: 1.4, d: 0.5, h: 0.9, mirror: true }],
  ['armchair', 'master', 4.2, 6.3, 3, { fabric: 'fabricBlue' }],
  ['sheeted', 'master', 0.55, 11.3, 0, { w: 0.8, d: 0.9, h: 1.2 }],
  ['rug', 'master', 2.6, 8.4, 0, { w: 2.0, d: 2.8, tex: 'rug' }],
  ['cobweb', 'master', 4.93, 5.07, 0, { s: 0.7, y: 5.78, corner: 'ne' }],
  // Ellie's bedroom
  ['bed', 'nursery', 13.05, 10.9, 3, { w: 1.0, d: 1.8, blanket: 'fabricPink' }],
  ['wardrobe', 'nursery', 13.66, 7.6, 3, { w: 1.2, d: 0.6, h: 1.9, wood: 'woodLight', hideName: 'Wardrobe' }],
  ['toyBox', 'nursery', 10.0, 11.65, 2, {}],
  ['rockingHorse', 'nursery', 11.7, 6.9, 1, {}],
  ['desk', 'nursery', 9.38, 9.2, 1, { w: 1.0, d: 0.55 }],
  ['chair', 'nursery', 10.05, 9.2, 3, {}],
  ['dresser', 'nursery', 11.4, 11.72, 2, { w: 0.9, d: 0.45, h: 0.8 }],
  ['musicBox', 'nursery', 11.4, 11.68, 0, { y: 0.8 }],
  ['rug', 'nursery', 11.5, 9.0, 0, { w: 2.4, d: 2.4, tex: 'rugChild' }],
  // Upstairs bathroom
  ['bathtub', 'bath1', 12.6, 0.48, 0, {}],
  ['toilet', 'bath1', 13.62, 3.1, 3, {}],
  ['sink', 'bath1', 10.4, 0.28, 0, {}],
  ['nightstand', 'bath1', 13.72, 4.45, 3, {}],
  // Sewing room
  ['sewingTable', 'sewing', 1.6, 0.4, 0, {}],
  ['chair', 'sewing', 1.6, 1.15, 2, {}],
  ['dressForm', 'sewing', 3.7, 1.0, 1, {}],
  ['wardrobe', 'sewing', 0.33, 3.4, 1, { w: 1.2, d: 0.6, h: 2.0, hideName: 'Wardrobe' }],
  ['shelves', 'sewing', 4.75, 4.3, 3, { w: 1.0, h: 1.7 }],
  ['boxes', 'sewing', 2.4, 4.5, 0, { n: 2 }],
  ['rockingChair', 'sewing', 2.6, 2.9, 0, {}],
  ['cobweb', 'sewing', 0.07, 0.07, 0, { s: 0.9, y: 5.78, corner: 'nw' }],
  // Basement
  ['boiler', 'basement', 10.35, 0.62, 0, {}],
  ['shelves', 'basement', 6.82, 4.4, 1, { w: 1.6 }],
  ['workbench', 'basement', 8.6, 6.65, 2, {}],
  ['boxes', 'basement', 10.4, 6.4, 0, { n: 3 }],
  ['boxes', 'basement', 10.5, 5.6, 0, { n: 1 }],
  ['cobweb', 'basement', 6.57, 6.93, 0, { s: 0.9, y: -0.22, corner: 'sw' }],
  // Storage
  ['sigil', 'storage', 12.5, 3.4, 0, { size: 2.9 }],
  ['candles', 'storage', 12.5, 3.4, 0, { r: 1.05 }],
  ['table', 'storage', 12.5, 6.55, 2, { w: 1.2, d: 0.6, h: 0.78, wood: 'woodDark' }],
  ['wardrobe', 'storage', 13.66, 1.0, 3, { w: 1.0, d: 0.6, h: 1.9, wood: 'woodDark', hideName: 'Old cabinet' }],
  ['sheeted', 'storage', 11.55, 0.55, 0, { w: 0.8, d: 0.8, h: 1.3 }],
  ['boxes', 'storage', 13.6, 5.2, 0, { n: 2 }],
  ['cobweb', 'storage', 13.93, 6.93, 0, { s: 0.9, y: -0.22, corner: 'se' }],
];

/** Small objects a ghost can throw: [kind, room, x, y (above floor), z]. */
const THROWABLES = [
  ['book', 'living', 1.65, 0.45, 8.3], ['cup', 'living', 1.85, 0.45, 8.75], ['vase', 'living', 0.35, 0.65, 11.45],
  ['cup', 'living', 3.3, 1.25, 11.5], ['book', 'living', 4.1, 1.0, 5.3],
  ['vase', 'hall', 5.24, 0.8, 10.05], ['candle', 'hall', 5.24, 0.8, 10.6],
  ['plate', 'dining', 11.5, 0.78, 8.1], ['plate', 'dining', 11.5, 0.78, 9.3], ['cup', 'dining', 11.25, 0.78, 8.6],
  ['candle', 'dining', 11.5, 0.78, 8.7], ['plate', 'dining', 13.72, 1.0, 8.4], ['vase', 'dining', 11.1, 0.85, 11.72],
  ['cup', 'kitchen', 9.6, 0.91, 0.3], ['bottle', 'kitchen', 11.2, 0.91, 0.3], ['bottle', 'kitchen', 9.3, 0.91, 2.5],
  ['pan', 'kitchen', 13.66, 0.92, 0.85], ['plate', 'kitchen', 11.1, 0.76, 2.8], ['cup', 'kitchen', 11.5, 0.76, 3.0],
  ['book', 'study', 2.9, 0.77, 0.4], ['book', 'study', 2.2, 0.77, 0.5], ['jar', 'study', 3.1, 0.77, 0.55],
  ['bottle', 'bath0', 6.84, 0.92, 2.55], ['cup', 'bath0', 6.84, 0.92, 2.85],
  ['vase', 'landing', 5.27, 0.8, 4.3], ['frame', 'landing', 5.27, 0.8, 11.4], ['teddy', 'landing', 7.0, 0.6, 0.32],
  ['book', 'master', 0.3, 0.55, 9.45], ['cup', 'master', 0.35, 0.55, 6.6], ['bottle', 'master', 2.0, 0.9, 11.72], ['frame', 'master', 2.8, 0.9, 11.75],
  ['teddy', 'nursery', 13.1, 0.64, 10.3], ['block', 'nursery', 11.0, 0, 9.6], ['block', 'nursery', 11.2, 0, 9.3], ['block', 'nursery', 12.0, 0, 8.4],
  ['ball', 'nursery', 10.6, 0, 8.0], ['book', 'nursery', 9.38, 0.77, 9.0],
  ['bottle', 'bath1', 10.4, 0.92, 0.28], ['cup', 'bath1', 13.72, 0.55, 4.45],
  ['book', 'sewing', 2.0, 0.75, 0.4], ['jar', 'sewing', 4.75, 0.6, 4.3], ['cup', 'sewing', 1.1, 0.75, 0.45],
  ['jar', 'basement', 6.82, 0.6, 4.0], ['jar', 'basement', 6.82, 0.6, 4.7], ['bottle', 'basement', 6.82, 1.1, 4.3], ['pan', 'basement', 8.3, 0.92, 6.6],
  ['candle', 'storage', 12.2, 0.78, 6.5], ['book', 'storage', 13.6, 0.97, 5.2],
];

/** Where story clues lie: [x, y above floor, z, room, rotation]. */
export const CLUE_SPOTS = {
  drawing: [9.4, 0.775, 9.25, 'nursery', 0.3],
  letter: [2.6, 0.775, 0.45, 'study', 0.15],
  map: [12.5, 0.785, 6.5, 'storage', 3.0],
  // Sam's notebook pages turn up in one of these
  n1: [11.3, 0.765, 2.75, 'kitchen', 0.6],
  n2: [1.4, 0.755, 0.45, 'sewing', 0.2],
  n3: [8.9, 0.93, 6.65, 'basement', 1.2],
  n4: [0.3, 0.555, 9.35, 'master', 2.1],
  n5: [7.3, 0.605, 0.32, 'landing', 0.4],
  n6: [11.9, 0.855, 11.75, 'dining', 0.1],
};

export const SPAWN = { x: 6.5, y: 0, z: 23.4, yaw: 0 };
export const VAN_SPOT = { x: 7.65, z: 24.0, r: 2.8 };

/* ------------------------------------------------------------------ */
/* Builder                                                             */
/* ------------------------------------------------------------------ */

export class House {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.quality = opts.quality || 'med';
    this.grids = {};
    this.walls = [];      // collision segments {x1,z1,x2,z2,y0,y1,rail}
    this.boxes = [];      // furniture AABBs {x0,z0,x1,z1,y0,y1}
    this.surfaces = [];   // walkable floors
    this.rooms = {};
    this.doors = {};
    this.switches = [];
    this.hides = [];
    this.throwables = [];
    this.interact = [];   // raycast targets
    this.anims = [];
    this.clues = {};
    this.windows = [];
    this.layerGroups = { [-1]: new THREE.Group(), 0: new THREE.Group(), 1: new THREE.Group(), ext: new THREE.Group() };
    this.dynamic = new THREE.Group();
    this.static = new THREE.Group();
  }

  build(progress = () => {}) {
    this.makeRooms();
    this.rasterise();
    progress(0.1);
    this.buildShell();
    progress(0.35);
    this.buildStairs();
    this.buildDoors();
    this.buildFurniture();
    progress(0.55);
    this.buildLights();
    this.buildThrowables();
    this.buildClues();
    this.buildExterior();
    progress(0.75);
    this.buildNav();
    this.mergeAll();
    this.scene.add(this.dynamic);
    for (const k in this.layerGroups) this.scene.add(this.layerGroups[k]);
    progress(1);
    return this;
  }

  /* ---------- rooms & grid ---------- */

  makeRooms() {
    for (const id in ROOMS) {
      const d = ROOMS[id];
      this.rooms[id] = {
        id, def: d, name: d.name, layers: d.layers, rects: d.rects, layer: d.layers[0],
        on: false, flick: 0, flickUntil: 0, lamps: [], sw: null, temp: 12, outside: !!d.outside,
      };
    }
  }

  rasterise() {
    for (const L of [-1, 0, 1]) {
      const g = [];
      for (let j = 0; j < GH; j++) g.push(new Array(GW).fill(null));
      this.grids[L] = g;
    }
    const fill = (L, r, id) => {
      for (let j = Math.round(r[1] / CELL); j < Math.round(r[3] / CELL); j++)
        for (let i = Math.round(r[0] / CELL); i < Math.round(r[2] / CELL); i++) this.grids[L][j][i] = id;
    };
    for (const id in ROOMS) for (const L of ROOMS[id].layers) for (const r of ROOMS[id].rects) fill(L, r, id);
    fill(HOLE.layer, HOLE.rect, 'hole');
  }

  cell(L, x, z) {
    const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
    if (i < 0 || j < 0 || i >= GW || j >= GH) return undefined;
    return this.grids[L][j][i];
  }

  roomAt(x, y, z) {
    const L = layerOfY(y);
    if (z >= 12 || x < 0 || x >= 14 || z < 0) return (z >= 12 && L === 0) ? 'yard' : null;
    const c = this.cell(L, x, z);
    if (c === 'hole') return 'hall';
    return c || null;
  }

  /* ---------- walls, floors, ceilings ---------- */

  edgeCovered(L, line, at, a, b) {
    const hit = (o) => o.layer === L && o.line === line && Math.abs(o.at - at) < 1e-6 && a >= o.from - 1e-6 && b <= o.to + 1e-6;
    return DOORS.some(hit) || OPENINGS.some(hit);
  }

  buildShell() {
    const segs = [];
    for (const L of [-1, 0, 1]) {
      const g = this.grids[L];
      // vertical lines (x = const)
      for (let i = 0; i <= GW; i++) {
        let run = null;
        for (let j = 0; j <= GH; j++) {
          let key = null, a = null, b = null;
          if (j < GH) {
            a = i > 0 ? g[j][i - 1] : null;
            b = i < GW ? g[j][i] : null;
            if (a !== b && !this.edgeCovered(L, 'x', i * CELL, j * CELL, (j + 1) * CELL)) key = `${a}|${b}`;
          }
          if (run && run.key !== key) { segs.push(run); run = null; }
          if (key && !run) run = { key, a, b, L, line: 'x', at: i * CELL, from: j * CELL };
          if (run) run.to = (j + 1) * CELL;
        }
      }
      // horizontal lines (z = const)
      for (let j = 0; j <= GH; j++) {
        let run = null;
        for (let i = 0; i <= GW; i++) {
          let key = null, a = null, b = null;
          if (i < GW) {
            a = j > 0 ? g[j - 1][i] : null;
            b = j < GH ? g[j][i] : null;
            if (a !== b && !this.edgeCovered(L, 'z', j * CELL, i * CELL, (i + 1) * CELL)) key = `${a}|${b}`;
          }
          if (run && run.key !== key) { segs.push(run); run = null; }
          if (key && !run) run = { key, a, b, L, line: 'z', at: j * CELL, from: i * CELL };
          if (run) run.to = (i + 1) * CELL;
        }
      }
    }

    // door spans are also wall lines with a lintel above
    const quads = [];
    for (const s of segs) {
      const lay = LAYER[s.L];
      const isRail = (s.a === 'hole' && s.b === 'landing') || (s.a === 'landing' && s.b === 'hole');
      const y0 = lay.floor, y1 = isRail ? lay.floor + 1.0 : lay.top;
      const [x1, z1, x2, z2] = s.line === 'x' ? [s.at, s.from, s.at, s.to] : [s.from, s.at, s.to, s.at];
      this.walls.push({ x1, z1, x2, z2, y0, y1, rail: isRail });
      if (isRail) { this.buildRail(x1, z1, x2, z2, lay.floor); continue; }
      for (const side of ['a', 'b']) {
        const room = s[side];
        const roomId = room === 'hole' ? 'hall' : room;
        if (!roomId && s.L === -1) continue; // underground
        const matKey = roomId ? ROOMS[roomId].wall : 'siding';
        const sign = side === 'a' ? -1 : 1; // a is the min side
        quads.push({ line: s.line, at: s.at + sign * WT / 2, from: s.from, to: s.to, y0: roomId ? y0 : (s.L === 0 ? -0.35 : y0), y1, facing: sign, mat: matKey, L: roomId ? s.L : 'ext' });
      }
    }
    // door frames and lintels
    for (const d of DOORS) {
      const lay = LAYER[d.layer];
      const top = d.layer === -1 ? lay.top : lay.top;
      const head = lay.floor + 2.1;
      const [ra, rb] = this.sidesOf(d);
      for (const [room, sign] of [[ra, -1], [rb, 1]]) {
        const roomId = room === 'hole' ? 'hall' : room;
        if (!roomId && d.layer === -1) continue;
        const matKey = roomId ? ROOMS[roomId].wall : 'siding';
        quads.push({ line: d.line, at: d.at + sign * WT / 2, from: d.from, to: d.to, y0: head, y1: top, facing: sign, mat: matKey, L: roomId ? d.layer : 'ext' });
      }
      // underside of the lintel
      this.addFrame(d, head);
    }
    this.emitQuads(quads);
    this.buildFloorsCeilings();
    this.buildWindows(segs);
    // exterior corner posts close the gaps where facades meet
    for (const [x, z] of [[0, 0], [14, 0], [0, 12], [14, 12]]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.24, 6.2, 0.24), M('#3a3f48'));
      post.position.set(x, 2.75, z);
      post.userData.layer = 'ext';
      this.static.add(post);
    }
  }

  sidesOf(d) {
    const L = d.layer;
    if (d.line === 'x') {
      const j = Math.floor((d.from + 0.01) / CELL), i = Math.round(d.at / CELL);
      return [i > 0 ? this.grids[L][j][i - 1] : null, i < GW ? this.grids[L][j][i] : null];
    }
    const i = Math.floor((d.from + 0.01) / CELL), j = Math.round(d.at / CELL);
    return [j > 0 ? this.grids[L][j - 1][i] : null, j < GH ? this.grids[L][j][i] : null];
  }

  emitQuads(quads) {
    // group by material + layer so each becomes one mesh
    const groups = new Map();
    for (const q of quads) {
      const k = q.mat + '#' + q.L;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(q);
    }
    for (const [k, list] of groups) {
      const [matKey, L] = k.split('#');
      const pos = [], nor = [], uv = [];
      const S = matKey === 'siding' ? 2.0 : matKey === 'brick' ? 1.4 : 1.6;
      for (const q of list) {
        let p0, p1, n;
        if (q.line === 'x') {
          p0 = [q.at, q.from]; p1 = [q.at, q.to]; n = [q.facing, 0];
        } else {
          p0 = [q.from, q.at]; p1 = [q.to, q.at]; n = [0, q.facing];
        }
        // Triangles (B0, A0, A1) face along (−(A−B).z, (A−B).x); swap ends so that matches n.
        let A = p0, Bp = p1;
        const ex = A[0] - Bp[0], ez = A[1] - Bp[1];
        if (-ez * n[0] + ex * n[1] < 0) { const t = A; A = Bp; Bp = t; }
        // u runs left to right as seen from the front (B is on the left)
        const ca = q.line === 'x' ? A[1] : A[0], cb = q.line === 'x' ? Bp[1] : Bp[0];
        const su = ca >= cb ? 1 : -1;
        const ua = (su * ca) / S, ub = (su * cb) / S;
        const v0 = q.y0 / S, v1 = q.y1 / S;
        // two triangles: A0, B0, B1 / A0, B1, A1 (counter-clockwise seen from the normal side)
        const P = (pt, y) => pos.push(pt[0], y, pt[1]);
        P(Bp, q.y0); P(A, q.y0); P(A, q.y1);
        P(Bp, q.y0); P(A, q.y1); P(Bp, q.y1);
        for (let i = 0; i < 6; i++) nor.push(n[0], 0, n[1]);
        uv.push(ub, v0, ua, v0, ua, v1, ub, v0, ua, v1, ub, v1);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      const mesh = new THREE.Mesh(geo, M(matKey));
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      mesh.userData.layer = L;
      mesh.userData.arch = true;
      this.static.add(mesh);
    }
  }

  floorQuad(x0, z0, x1, z1, y, matKey, up, L, S = 1.6) {
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, (x0 + uv.getX(i) * (x1 - x0)) / S, (z0 + (1 - uv.getY(i)) * (z1 - z0)) / S);
    }
    const m = new THREE.Mesh(geo, M(matKey));
    m.rotation.x = up ? -Math.PI / 2 : Math.PI / 2;
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    m.receiveShadow = true;
    m.castShadow = !up;
    m.userData.layer = L;
    m.userData.arch = true;
    this.static.add(m);
    return m;
  }

  buildFloorsCeilings() {
    for (const id in ROOMS) {
      const d = ROOMS[id];
      if (d.outside) continue;
      for (const L of d.layers) {
        const lay = LAYER[L];
        const floors = (d.floors && d.floors[L]) || d.rects;
        const ceils = (d.ceil && !Array.isArray(d.ceil) && d.ceil[L]) || (Array.isArray(d.ceil) ? d.ceil : d.rects);
        for (const r of floors) {
          this.floorQuad(r[0], r[1], r[2], r[3], lay.floor, d.floor, true, L, d.floor.startsWith('carpet') ? 2 : 1.6);
          this.surfaces.push({ x0: r[0], z0: r[1], x1: r[2], z1: r[3], y: lay.floor });
        }
        for (const r of ceils) this.floorQuad(r[0], r[1], r[2], r[3], lay.ceil, 'ceiling', false, L, 2);
        // slab underside thickness, seen from the stairwell
      }
    }
    // the stairwell hole gets a ceiling upstairs
    const h = HOLE.rect;
    this.floorQuad(h[0], h[1], h[2], h[3], LAYER[1].ceil, 'ceiling', false, 1, 2);
    // slab edges around the stairwell hole
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 5), M('#3a3a40'));
    e.position.set(7.5, 2.9, 8.5);
    const e2 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.2, 0.06), M('#3a3a40'));
    e2.position.set(8.25, 2.9, 11);
    e.userData.layer = e2.userData.layer = 1;
    this.static.add(e, e2);
    // outdoors
    this.surfaces.push({ x0: -3, z0: 12, x1: 17, z1: 28.6, y: 0 });
  }

  buildRail(x1, z1, x2, z2, y) {
    const g = new THREE.Group();
    const len = Math.hypot(x2 - x1, z2 - z1);
    const along = x1 === x2 ? 'z' : 'x';
    const wood = M('woodDark');
    const top = new THREE.Mesh(new THREE.BoxGeometry(along === 'x' ? len : 0.07, 0.06, along === 'z' ? len : 0.07), wood);
    top.position.set((x1 + x2) / 2, y + 1.0, (z1 + z2) / 2);
    g.add(top);
    const n = Math.max(2, Math.round(len / 0.14));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const thick = i === 0 || i === n ? 0.08 : 0.025;
      const p = new THREE.Mesh(new THREE.BoxGeometry(thick, 1.0, thick), wood);
      p.position.set(x1 + (x2 - x1) * t, y + 0.5, z1 + (z2 - z1) * t);
      g.add(p);
    }
    g.traverse((o) => { if (o.isMesh) o.userData.layer = layerOfY(y + 0.1); });
    this.static.add(g);
  }

  addFrame(d, head) {
    const g = new THREE.Group();
    const wood = M('woodDark');
    const fl = LAYER[d.layer].floor;
    const w = d.to - d.from;
    const along = d.line === 'z' ? 'x' : 'z';
    const mk = (sx, sy, sz, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), wood);
      m.position.set(x, y, z);
      g.add(m);
    };
    const T2 = WT + 0.06;
    if (along === 'x') {
      mk(0.09, 2.1, T2, d.from + 0.045, fl + 1.05, d.at);
      mk(0.09, 2.1, T2, d.to - 0.045, fl + 1.05, d.at);
      mk(w, 0.09, T2, (d.from + d.to) / 2, head - 0.045, d.at);
    } else {
      mk(T2, 2.1, 0.09, d.at, fl + 1.05, d.from + 0.045);
      mk(T2, 2.1, 0.09, d.at, fl + 1.05, d.to - 0.045);
      mk(T2, 0.09, w, d.at, head - 0.045, (d.from + d.to) / 2);
    }
    g.traverse((o) => { if (o.isMesh) o.userData.layer = d.ext ? 'ext' : d.layer; });
    this.static.add(g);
  }

  buildWindows(segs) {
    const frameM = M('#2a2420');
    const insideGlass = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.07, 0.1, 0.2, THREE.SRGBColorSpace) });
    const barM = M('#2a2420');
    for (const s of segs) {
      if (s.L === -1) continue;
      const out = s.a === null ? 'a' : s.b === null ? 'b' : null;
      if (!out) continue;
      const roomId = out === 'a' ? s.b : s.a;
      if (!roomId || roomId === 'hole' || roomId === 'cellar') continue;
      const len = s.to - s.from;
      if (len < 1.8) continue;
      const count = Math.max(1, Math.floor(len / 3));
      const room = this.rooms[roomId];
      if (!room.windowMat) room.windowMat = new THREE.MeshBasicMaterial({ color: 0x0b0f1c });
      for (let k = 0; k < count; k++) {
        const c = s.from + (len * (k + 0.5)) / count;
        // keep clear of doors on this line
        if (DOORS.some((d) => d.layer === s.L && d.line === s.line && Math.abs(d.at - s.at) < 0.01 && c > d.from - 0.9 && c < d.to + 0.9)) continue;
        const fl = LAYER[s.L].floor;
        const outSign = out === 'a' ? -1 : 1;
        for (const sideSign of [-1, 1]) {
          const isOut = sideSign === outSign;
          const g = new THREE.Group();
          const w = 0.95, hgt = 1.25;
          const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, hgt), isOut ? room.windowMat : insideGlass);
          g.add(glass);
          const fr = (sx, sy, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, 0.05), frameM); m.position.set(x, y, 0.02); g.add(m); };
          fr(w + 0.12, 0.08, 0, hgt / 2); fr(w + 0.12, 0.1, 0, -hgt / 2); fr(0.07, hgt, -w / 2, 0); fr(0.07, hgt, w / 2, 0);
          const bar1 = new THREE.Mesh(new THREE.BoxGeometry(0.035, hgt, 0.03), barM); bar1.position.z = 0.015; g.add(bar1);
          const bar2 = new THREE.Mesh(new THREE.BoxGeometry(w, 0.035, 0.03), barM); bar2.position.z = 0.015; g.add(bar2);
          if (!isOut) {
            // old boards nailed across from the inside
            const bd = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.12, 0.03), M('woodLight'));
            bd.position.set(0, -0.1, 0.05); bd.rotation.z = 0.25; g.add(bd);
          }
          const off = sideSign * (WT / 2 + 0.006);
          if (s.line === 'x') {
            g.position.set(s.at + off, fl + 1.55, c);
            g.rotation.y = sideSign > 0 ? Math.PI / 2 : -Math.PI / 2;
          } else {
            g.position.set(c, fl + 1.55, s.at + off);
            g.rotation.y = sideSign > 0 ? 0 : Math.PI;
          }
          g.traverse((o) => { if (o.isMesh) o.userData.layer = isOut ? 'ext' : s.L; });
          this.static.add(g);
        }
      }
    }
  }

  /* ---------- stairs ---------- */

  buildStairs() {
    for (const s of STAIRS) {
      const [x0, z0r, x1, z1r] = s.rect;
      const n = s.steps;
      const dir = Math.sign(s.z1 - s.z0); // −1: climbing toward −z
      const run = Math.abs(s.z1 - s.z0) / n;
      const rise = (s.y1 - s.y0) / n;
      const base = Math.min(s.y0, s.y1);
      for (let i = 0; i < n; i++) {
        // each step is a solid block from the lowest point up to its tread
        const top = s.y0 + rise * (i + 1);
        const za = s.z0 + dir * run * i, zb = s.z0 + dir * run * (i + 1);
        const h = Math.max(0.05, top - base);
        const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 - 0.02, h, Math.abs(zb - za)), M(s.tex));
        m.position.set((x0 + x1) / 2, base + h / 2, (za + zb) / 2);
        m.castShadow = m.receiveShadow = true;
        m.userData.layer = layerOfY(top - 0.5);
        this.static.add(m);
        const nose = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.03, 0.05), M('woodDark'));
        nose.position.set((x0 + x1) / 2, top - 0.015, za);
        nose.userData.layer = m.userData.layer;
        this.static.add(nose);
      }
      this.surfaces.push({ x0, z0: z0r, x1, z1: z1r, ramp: s });
    }
    // banister on the open side of the main stairs
    const wood = M('woodDark');
    const s = STAIRS[0];
    const g = new THREE.Group();
    const zA = 10.6, zB = 6.0;
    const yAt = (z) => s.y0 + (s.y1 - s.y0) * ((s.z0 - z) / (s.z0 - s.z1));
    for (let z = zA; z >= zB - 0.01; z -= 0.28) {
      const yb = yAt(z);
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.95, 0.035), wood);
      p.position.set(7.52, yb + 0.47, z);
      g.add(p);
    }
    const len = Math.hypot(zA - zB, yAt(zB) - yAt(zA));
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, len), wood);
    hand.position.set(7.52, (yAt(zA) + yAt(zB)) / 2 + 0.95, (zA + zB) / 2);
    hand.rotation.x = Math.atan2(yAt(zB) - yAt(zA), zA - zB);
    g.add(hand);
    const newel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.12), wood);
    newel.position.set(7.52, 0.6, zA);
    g.add(newel);
    g.traverse((o) => { if (o.isMesh) o.userData.layer = 0; });
    this.static.add(g);
    this.walls.push({ x1: 7.5, z1: 6.0, x2: 7.5, z2: 10.55, y0: 0, y1: 4.2, rail: true });
  }

  /* ---------- doors ---------- */

  buildDoors() {
    for (const d of DOORS) {
      const fl = LAYER[d.layer].floor;
      const door = { id: d.id, def: d, angle: 0, target: 0, locked: !!d.lock, layer: d.layer, pivot: null, open: !!d.open };
      const cx = d.line === 'z' ? (d.from + d.to) / 2 : d.at;
      const cz = d.line === 'z' ? d.at : (d.from + d.to) / 2;
      door.center = { x: cx, y: fl, z: cz };
      door.rooms = d.rooms;
      if (d.open) { this.doors[d.id] = door; continue; }
      const w = d.to - d.from - 0.1;
      // base angle: panel runs from hinge toward the other jamb
      let base;
      if (d.line === 'z') base = d.hinge === 'min' ? 0 : Math.PI;
      else base = d.hinge === 'min' ? -Math.PI / 2 : Math.PI / 2;
      const hx = d.line === 'z' ? (d.hinge === 'min' ? d.from + 0.05 : d.to - 0.05) : d.at;
      const hz = d.line === 'z' ? d.at : (d.hinge === 'min' ? d.from + 0.05 : d.to - 0.05);
      // which way it swings: toward the room it opens into
      const intoRoom = this.rooms[d.into];
      const ir = intoRoom.rects[0];
      const tx = (ir[0] + ir[2]) / 2 - cx, tz = (ir[1] + ir[3]) / 2 - cz;
      const tipAt = (a) => [Math.cos(a), -Math.sin(a)];
      let sign = 1;
      const t1 = tipAt(base + Math.PI / 2);
      if (d.line === 'z') sign = Math.sign(t1[1]) === Math.sign(tz) ? 1 : -1;
      else sign = Math.sign(t1[0]) === Math.sign(tx) ? 1 : -1;
      const pivot = new THREE.Group();
      pivot.position.set(hx, fl, hz);
      pivot.rotation.y = base;
      const isExt = !!d.ext;
      const panelMat = isExt ? M('#2a1a2e') : M('woodLight');
      const panel = new THREE.Mesh(new THREE.BoxGeometry(w, 2.02, 0.05), panelMat);
      panel.position.set(w / 2, 1.02, 0);
      panel.castShadow = panel.receiveShadow = true;
      pivot.add(panel);
      for (const zz of [-0.03, 0.03]) {
        for (const yy of [0.55, 1.5]) {
          const inset = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.6, 0.012), M(isExt ? '#1e1222' : 'wood'));
          inset.position.set(w / 2, yy, zz);
          pivot.add(inset);
        }
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), M('#b89a5a'));
        knob.position.set(w - 0.09, 1.0, zz * 2.2);
        pivot.add(knob);
      }
      if (d.id === 'front') {
        // the lantern mark, carved into the door
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const x = c.getContext('2d');
        drawSigil(x, 64, 64, 28, 'rgba(160,140,190,0.8)', 4);
        const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), new THREE.MeshLambertMaterial({ map: textureFromCanvas(c, { repeat: false }), transparent: true }));
        mark.position.set(w / 2, 1.72, 0.031);
        pivot.add(mark);
      }
      if (d.id === 'cellar') {
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const x = c.getContext('2d');
        x.translate(64, 64); x.rotate(Math.PI); x.translate(-64, -64);
        drawSigil(x, 64, 64, 30, 'rgba(235,235,225,0.85)', 4);
        const chalk = new THREE.MeshLambertMaterial({ map: textureFromCanvas(c, { repeat: false }), transparent: true });
        door.chalk = chalk;
        for (const zz of [0.031, -0.031]) {
          const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), chalk);
          mark.position.set(w / 2, 1.35, zz);
          if (zz < 0) mark.rotation.y = Math.PI;
          pivot.add(mark);
        }
        const lock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.04), M('#6a6a70'));
        lock.position.set(w - 0.09, 1.15, 0.05 * sign);
        lock.userData.keep = true;
        pivot.add(lock);
        door.padlock = lock;
      }
      // invisible hit box for tapping
      const hit = new THREE.Mesh(new THREE.BoxGeometry(w, 2.0, 0.3), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.copy(panel.position);
      pivot.add(hit);
      hit.userData.interact = { type: 'door', id: d.id };
      this.interact.push(hit);
      door.pivot = pivot;
      door.base = base;
      door.sign = sign;
      door.width = w;
      door.hinge = { x: hx, z: hz };
      compactGroup(pivot);
      (d.ext ? this.layerGroups.ext : this.layerGroups[d.layer]).add(pivot);
      this.doors[d.id] = door;
    }
  }

  setDoor(id, open, instant = false) {
    const d = this.doors[id];
    if (!d || d.def.open) return;
    d.target = open ? 1 : 0;
    if (instant) { d.angle = d.target; this.poseDoor(d); }
  }

  poseDoor(d) {
    d.pivot.rotation.y = d.base + d.sign * d.angle * 1.55;
  }

  doorClosed(d) { return !d.def.open && d.angle < 0.22; }

  /* ---------- furniture ---------- */

  buildFurniture() {
    for (const [type, roomId, x, z, rot, opts] of FURNITURE) {
      const room = this.rooms[roomId];
      const floorY = LAYER[roomId === 'cellar' ? -1 : room.layer].floor;
      const p = buildProp(type, opts);
      const g = p.g;
      g.position.set(x, floorY + (opts.y || 0), z);
      g.rotation.y = rot * Math.PI / 2;
      if (type === 'cobweb') {
        // hang in a ceiling corner, angled down into the room
        const yawFor = { nw: Math.PI / 4, ne: (3 * Math.PI) / 4, se: (-3 * Math.PI) / 4, sw: -Math.PI / 4 }[opts.corner] || 0;
        g.position.set(x, opts.y, z);
        g.rotation.set(0, yawFor, 0);
        g.children[0].rotation.x = -0.6;
      }
      for (const b of p.boxes) {
        const pts = [[b[0], b[1]], [b[2], b[3]]].map(([lx, lz]) => {
          const a = rot * Math.PI / 2;
          return [x + lx * Math.cos(a) + lz * Math.sin(a), z - lx * Math.sin(a) + lz * Math.cos(a)];
        });
        this.boxes.push({
          x0: Math.min(pts[0][0], pts[1][0]), z0: Math.min(pts[0][1], pts[1][1]),
          x1: Math.max(pts[0][0], pts[1][0]), z1: Math.max(pts[0][1], pts[1][1]),
          y0: floorY, y1: floorY + b[4], room: roomId,
        });
      }
      if (p.hide) {
        const a = rot * Math.PI / 2;
        const fx = Math.sin(a), fz = Math.cos(a);
        // peek out through the gap between the doors: forward is (fx, fz)
        const spot = {
          id: `hide-${this.hides.length}`, room: roomId, name: opts.hideName || 'Wardrobe',
          x: x + fx * p.hide.z, z: z + fz * p.hide.z, y: floorY, yaw: Math.atan2(-fx, -fz),
          out: { x: x + fx * ((opts.d || 0.6) / 2 + 0.45), z: z + fz * ((opts.d || 0.6) / 2 + 0.45) },
        };
        this.hides.push(spot);
        const hit = new THREE.Mesh(new THREE.BoxGeometry(opts.w || 1.2, 1.8, 0.2), new THREE.MeshBasicMaterial({ visible: false }));
        hit.position.set(x + fx * ((opts.d || 0.6) / 2 + 0.05), floorY + 1.0, z + fz * ((opts.d || 0.6) / 2 + 0.05));
        hit.rotation.y = a;
        hit.userData.interact = { type: 'hide', id: spot.id };
        this.interact.push(hit);
        this.dynamic.add(hit);
      }
      if (p.anim) {
        if (p.anim.pendulum) this.anims.push({ kind: 'pendulum', obj: p.anim.pendulum, room: roomId, stopped: false });
        if (p.anim.flames) for (const f of p.anim.flames) this.anims.push({ kind: 'flame', obj: f });
        if (p.anim.sigil) this.sigilMat = p.anim.sigil;
      }
      if (type === 'musicBox') this.musicBox = { x, y: floorY + (opts.y || 0) + 0.15, z };
      if (type === 'clock') this.clock = { x, y: floorY + 1.7, z };
      if (type === 'rockingChair' || type === 'rockingHorse') {
        g.userData.noMerge = true;
        g.rotation.order = 'YXZ';
        this.anims.push({ kind: 'rock', obj: g, amp: 0, phase: 0, room: roomId, base: g.rotation.clone() });
        this.layerGroups[room.layer].add(g);
        continue;
      }
      if (type === 'candles' || type === 'sigil') g.userData.storyProp = true;
      g.traverse((o) => { if (o.isMesh) { o.userData.layer = roomId === 'cellar' ? -1 : room.layer; o.castShadow = true; o.receiveShadow = true; } });
      this.static.add(g);
    }
  }

  /* ---------- lights ---------- */

  buildLights() {
    for (const id in this.rooms) {
      const room = this.rooms[id];
      const d = room.def;
      for (const l of d.lamps) {
        const L = l[3] !== undefined ? l[3] : room.layer;
        const lay = LAYER[L];
        const lamp = buildLamp(l[2]);
        lamp.g.traverse((o) => { o.castShadow = false; });
        lamp.g.position.set(l[0], lay.ceil, l[1]);
        this.layerGroups[L].add(lamp.g);
        const drop = l[2] === 'chandelier' ? 0.45 : l[2] === 'pendant' ? 0.68 : 0.42;
        room.lamps.push({ x: l[0], y: lay.ceil - drop, z: l[1], bulb: lamp.bulb, shade: lamp.shade, kind: l[2], layer: L });
      }
      if (d.sw) {
        const [x, z, nx, nz] = d.sw;
        const L = id === 'cellar' ? 0 : room.layer;
        const y = LAYER[L].floor + 1.3;
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.015), M('#cfc6b0'));
        const toggle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.025), M('#8a7a5a'));
        const g = new THREE.Group();
        g.add(plate);
        toggle.position.z = 0.012;
        g.add(toggle);
        g.position.set(x, y, z);
        g.rotation.y = Math.atan2(nx, nz);
        this.layerGroups[L].add(g);
        const hit = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.35, 0.15), new THREE.MeshBasicMaterial({ visible: false }));
        g.add(hit);
        hit.userData.interact = { type: 'switch', id };
        this.interact.push(hit);
        room.sw = { x, y, z, toggle };
        this.switches.push(room.sw);
      }
    }
    // the pool of real lights shared by whichever lamps are on nearby
    const n = this.quality === 'high' ? 6 : this.quality === 'low' ? 3 : 5;
    this.pool = [];
    for (let i = 0; i < n; i++) {
      const pl = new THREE.PointLight(0xffd29a, 0, 7.5, 2);
      this.scene.add(pl);
      this.pool.push(pl);
    }
    this.poolTimer = 0;
  }

  setLight(id, on) {
    const room = this.rooms[id];
    if (!room || room.outside) return;
    room.on = on;
    if (room.sw) room.sw.toggle.rotation.x = on ? -0.5 : 0.5;
  }

  flicker(id, dur, now) {
    const room = this.rooms[id];
    if (!room) return;
    room.flickUntil = Math.max(room.flickUntil, now + dur);
  }

  /* ---------- small objects ---------- */

  buildThrowables() {
    for (const [kind, roomId, x, y, z] of THROWABLES) {
      const room = this.rooms[roomId];
      const fl = LAYER[room.layer].floor;
      const t = buildThrowable(kind);
      t.g.position.set(x, fl + y, z);
      t.g.rotation.y = (x * 7 + z * 3) % 6.28;
      t.g.traverse((o) => { o.castShadow = false; });
      this.layerGroups[room.layer].add(t.g);
      this.throwables.push({
        id: this.throwables.length, kind, room: roomId, obj: t.g, r: t.r, h: t.h, ball: !!t.ball,
        home: { x, y: fl + y, z, ry: t.g.rotation.y },
        vel: new THREE.Vector3(), spin: new THREE.Vector3(), flying: false, movedAt: -1e9, rest: true,
      });
    }
  }

  resetThrowables() {
    for (const t of this.throwables) {
      t.obj.position.set(t.home.x, t.home.y, t.home.z);
      t.obj.rotation.set(0, t.home.ry, 0);
      t.flying = false; t.vel.set(0, 0, 0); t.spin.set(0, 0, 0); t.movedAt = -1e9;
    }
  }

  launch(id, v, spin) {
    const t = this.throwables[id];
    if (!t) return;
    t.vel.set(v[0], v[1], v[2]);
    t.spin.set(spin[0], spin[1], spin[2]);
    t.flying = true;
    t.bounces = 0;
    return t;
  }

  /* ---------- story clues ---------- */

  buildClues() {
    const texFor = { drawing: 'paperDrawing', letter: 'paperLetter', map: 'paperMap' };
    for (const key in CLUE_SPOTS) {
      const [x, y, z, roomId, rot] = CLUE_SPOTS[key];
      const room = this.rooms[roomId];
      const fl = LAYER[room.layer].floor;
      const g = new THREE.Group();
      const tex = texFor[key] || 'paperNote';
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.3), new THREE.MeshLambertMaterial({ map: T(tex), emissive: 0x15121a }));
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = rot;
      m.position.y = 0.004;
      g.add(m);
      const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('190,170,255'), color: 0xc8b8ff, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
      glint.scale.set(0.5, 0.5, 1);
      glint.position.y = 0.05;
      g.add(glint);
      g.position.set(x, fl + y, z);
      g.visible = false;
      this.layerGroups[room.layer].add(g);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.5), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.y = 0.1;
      g.add(hit);
      hit.userData.interact = { type: 'clue', id: key };
      this.interact.push(hit);
      this.clues[key] = { group: g, glint, room: roomId, x, y: fl + y, z, page: null };
    }
  }

  /* ---------- outside ---------- */

  buildExterior() {
    const add = (m) => { m.userData.layer = 'ext'; this.static.add(m); return m; };
    // ground around (not under) the house
    const ground = (x0, z0, x1, z1, tex, y = -0.01, S = 4) => {
      const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (x0 + uv.getX(i) * (x1 - x0)) / S, (z0 + (1 - uv.getY(i)) * (z1 - z0)) / S);
      const m = new THREE.Mesh(geo, M(tex));
      m.rotation.x = -Math.PI / 2;
      m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
      m.receiveShadow = true;
      return add(m);
    };
    ground(-60, -60, 80, 0, 'grass');
    ground(-60, 0, 0, 12, 'grass');
    ground(14, 0, 80, 12, 'grass');
    ground(-60, 12, 80, 23.2, 'grass');
    ground(-60, 23.2, 80, 23.7, 'path', 0.0, 1.2);
    ground(-60, 23.7, 80, 29.2, 'asphalt', 0.0, 3);
    ground(-60, 29.2, 80, 90, 'grass');
    ground(5.9, 13.6, 7.1, 23.2, 'path', 0.004, 1.2);
    // foundation
    const fnd = new THREE.Mesh(new THREE.BoxGeometry(14.3, 0.5, 12.3), M('concrete'));
    fnd.position.set(7, -0.2, 6);
    add(fnd);
    // porch
    const deck = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.1, 1.6), M('planksDark'));
    deck.position.set(7, -0.03, 12.85);
    add(deck);
    for (const x of [5.0, 9.0]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.8, 0.14), M('woodLight'));
      post.position.set(x, 1.4, 13.55);
      add(post);
    }
    const proof = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.12, 1.9), M('roof'));
    proof.position.set(7, 2.85, 12.9);
    proof.rotation.x = -0.12;
    add(proof);
    // roof
    const roofMat = M('roof', { side: THREE.DoubleSide });
    const ridgeY = 10.2;
    for (const side of [-1, 1]) {
      const zEave = side < 0 ? -0.5 : 12.5;
      const run = Math.abs(6 - zEave), rise = ridgeY - 5.75;
      const len = Math.hypot(run, rise);
      const geo = new THREE.PlaneGeometry(15.2, len);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 3);
      // tilt the plane so its local +Y runs up the slope from the eave to the ridge
      const r = new THREE.Mesh(geo, roofMat);
      r.position.set(7, (ridgeY + 5.75) / 2, (6 + zEave) / 2);
      r.rotation.x = side < 0 ? Math.atan2(run, rise) : -Math.atan2(run, rise);
      add(r);
    }
    // gable ends
    for (const x of [0, 14]) {
      const shape = new THREE.Shape();
      shape.moveTo(-0.07, 5.8); shape.lineTo(12.07, 5.8); shape.lineTo(6, ridgeY); shape.lineTo(-0.07, 5.8);
      const geo = new THREE.ShapeGeometry(shape);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2, uv.getY(i) / 2);
      const m = new THREE.Mesh(geo, M('siding', { side: THREE.DoubleSide }));
      m.rotation.y = -Math.PI / 2;
      m.position.set(x, 0, 0);
      add(m);
    }
    // chimney
    const ch = new THREE.Mesh(new THREE.BoxGeometry(0.9, 3.4, 0.9), M('brick'));
    ch.position.set(0.6, 7.6, 8.5);
    add(ch);
    // picket fence
    const picket = M('#8a8a82');
    const fenceLine = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.floor(len / 0.22);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        if (Math.sin(i * 12.9898 + x0) > 0.93) continue; // a few missing pickets
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.95 + Math.sin(i * 3.1) * 0.05, 0.03), picket);
        p.position.set(x0 + (x1 - x0) * t, 0.47, z0 + (z1 - z0) * t);
        p.rotation.y = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
        p.rotation.z = Math.sin(i * 5.3 + z0) * 0.06;
        add(p);
      }
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.04), picket);
      rail.position.set((x0 + x1) / 2, 0.7, (z0 + z1) / 2);
      rail.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
      add(rail);
    };
    fenceLine(-3, 23.1, 5.7, 23.1);
    fenceLine(7.3, 23.1, 17, 23.1);
    fenceLine(-3, 12.2, -3, 23.1);
    fenceLine(17, 12.2, 17, 23.1);
    fenceLine(-3, 12.2, 0, 12.2);
    fenceLine(14, 12.2, 17, 12.2);
    // dead trees
    const bark = M('#2a2420');
    const tree = (x, z, h, seed) => {
      const r = rng(seed);
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.28, h, 7), bark);
      trunk.position.y = h / 2;
      g.add(trunk);
      const branch = (px, py, pz, len, ang, tilt, depth) => {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.02 + depth * 0.02, 0.04 + depth * 0.03, len, 5), bark);
        const dir = new THREE.Vector3(Math.cos(ang) * Math.sin(tilt), Math.cos(tilt), Math.sin(ang) * Math.sin(tilt));
        b.position.set(px + dir.x * len / 2, py + dir.y * len / 2, pz + dir.z * len / 2);
        b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        g.add(b);
        if (depth > 0) {
          const ex = px + dir.x * len, ey = py + dir.y * len, ez = pz + dir.z * len;
          for (let k = 0; k < 2; k++) branch(ex, ey, ez, len * 0.65, ang + (r() - 0.5) * 1.6, tilt + (r() - 0.3) * 0.5, depth - 1);
        }
      };
      for (let k = 0; k < 4; k++) branch(0, h * (0.55 + r() * 0.35), 0, h * 0.35, r() * 6.28, 0.6 + r() * 0.5, 2);
      g.position.set(x, 0, z);
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.layer = 'ext'; } });
      this.static.add(g);
      return g;
    };
    tree(-1.6, 15.6, 5.5, 1); tree(15.3, 17.4, 6.2, 2); tree(1.4, 20.6, 4.6, 3); tree(13.0, 21.2, 5.0, 4);
    tree(-4.5, 31, 7, 5); tree(9.5, 32, 6, 6); tree(20, 30, 7.5, 7); tree(-8, 18, 6.5, 8); tree(22, 14, 6, 9);
    tree(-6, 4, 7, 10); tree(19, 3, 6.5, 11); tree(3, -5, 7.5, 12); tree(12, -6, 6, 13);
    // tire swing on the big tree
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 2.6, 4), M('#6a5a40'));
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.1, 6, 14), M('#151515'));
    const swing = new THREE.Group();
    rope.position.y = -1.3;
    tire.position.y = -2.7;
    swing.add(rope, tire);
    swing.position.set(14.4, 4.2, 17.4);
    swing.userData.noMerge = true;
    this.dynamic.add(swing);
    this.swing = swing;
    // mailbox
    const mb = new THREE.Group();
    const mpost = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.08), M('woodDark'));
    mpost.position.y = 0.55;
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.45), M('#2a3a4a'));
    box.position.y = 1.2;
    mb.add(mpost, box);
    mb.position.set(5.2, 0, 22.7);
    mb.rotation.y = 0.15;
    mb.traverse((o) => { if (o.isMesh) o.userData.layer = 'ext'; });
    this.static.add(mb);
    // street lamp
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 4.6, 8), M('#2a2c30'));
    pole.position.set(11.2, 2.3, 23.55);
    add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.9), M('#2a2c30'));
    arm.position.set(11.2, 4.55, 23.95);
    add(arm);
    this.streetBulb = new THREE.MeshBasicMaterial({ color: 0xffc070 });
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 0.2, 8), this.streetBulb);
    head.position.set(11.2, 4.45, 24.35);
    head.userData.noMerge = true;
    this.dynamic.add(head);
    this.streetGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('255,190,110'), color: 0xffb060, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.streetGlow.scale.set(2.2, 2.2, 1);
    this.streetGlow.position.set(11.2, 4.35, 24.35);
    this.dynamic.add(this.streetGlow);
    this.rooms.yard.lamps.push({ x: 11.2, y: 4.2, z: 24.3, bulb: this.streetBulb, kind: 'street', layer: 0, power: 26, dist: 13 });
    this.rooms.yard.on = true;
    this.buildVan();
    this.buildSky();
  }

  buildVan() {
    const g = new THREE.Group();
    const body = M('#141a3a');
    const L = 5.4, W = 2.1, H = 2.35;
    const b = new THREE.Mesh(new THREE.BoxGeometry(L, H - 0.45, W), body);
    b.position.y = 0.45 + (H - 0.45) / 2;
    g.add(b);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, W - 0.02), body);
    cab.position.set(L / 2 + 0.5, 1.05, 0);
    g.add(cab);
    const ws = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.3, 0.7), new THREE.MeshBasicMaterial({ color: 0x0c1830 }));
    ws.rotation.y = Math.PI / 2;
    ws.position.set(L / 2 + 1.105, 1.35, 0);
    g.add(ws);
    for (const wx of [-1.7, 2.9]) for (const sz of [-1, 1]) {
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.28, 14), M('#111'));
      wh.rotation.x = Math.PI / 2;
      wh.position.set(wx, 0.4, sz * (W / 2 - 0.05));
      g.add(wh);
    }
    // the ParanormalADHDhunters livery, on the back half of each side
    const LW = 3.3, LH = (H - 0.45) * 0.88;
    const c = document.createElement('canvas');
    c.width = 1024; c.height = Math.round(1024 * LH / LW);
    const x = c.getContext('2d');
    const grd = x.createLinearGradient(0, 0, 1024, 0);
    grd.addColorStop(0, '#141a3a'); grd.addColorStop(1, '#2a1650');
    x.fillStyle = grd; x.fillRect(0, 0, 1024, c.height);
    const base = c.height - 70;
    x.fillStyle = 'rgba(155,107,255,0.9)'; x.fillRect(0, base, 1024, 16);
    x.fillStyle = 'rgba(127,227,255,0.8)'; x.fillRect(0, base + 24, 1024, 6);
    x.shadowColor = '#9b6bff'; x.shadowBlur = 20;
    drawSigilGhost(x, 165, base / 2 + 10, 105);
    x.shadowBlur = 12;
    x.textBaseline = 'alphabetic';
    x.font = '700 76px Cinzel, Georgia, serif';
    x.fillStyle = '#e9f0ff';
    x.fillText('Paranormal', 320, base / 2 - 20);
    x.font = '900 96px Cinzel, Georgia, serif';
    x.fillStyle = '#b388ff';
    x.fillText('ADHD', 320, base / 2 + 82);
    const adhdW = x.measureText('ADHD').width;
    x.font = '700 76px Cinzel, Georgia, serif';
    x.fillStyle = '#e9f0ff';
    x.fillText('hunters', 320 + adhdW + 6, base / 2 + 82);
    x.shadowBlur = 0;
    x.font = 'italic 32px Georgia, serif';
    x.fillStyle = '#aab4e8';
    x.fillText('Hyperfocused on the unexplained', 320, base - 22);
    const livery = new THREE.MeshLambertMaterial({ map: textureFromCanvas(c, { repeat: false }), emissive: 0x1a1430 });
    const side = new THREE.Mesh(new THREE.PlaneGeometry(LW, LH), livery);
    side.position.set(-0.85, 0.45 + (H - 0.45) / 2, -W / 2 - 0.006);
    side.rotation.y = Math.PI;
    g.add(side);
    const side2 = new THREE.Mesh(new THREE.PlaneGeometry(LW, LH), livery);
    side2.position.set(-0.85, side.position.y, W / 2 + 0.006);
    g.add(side2);
    // open sliding door, just behind the cab, with glowing monitors inside
    const opening = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.65), new THREE.MeshBasicMaterial({ color: 0x05060c }));
    opening.position.set(1.65, 1.3, -W / 2 - 0.012);
    opening.rotation.y = Math.PI;
    g.add(opening);
    const cc = document.createElement('canvas');
    cc.width = 256; cc.height = 128;
    const xx = cc.getContext('2d');
    xx.fillStyle = '#04121a'; xx.fillRect(0, 0, 256, 128);
    xx.strokeStyle = '#7fe3ff'; xx.lineWidth = 2;
    xx.beginPath();
    for (let i = 0; i < 256; i += 4) xx.lineTo(i, 64 + Math.sin(i * 0.12) * 20 + Math.sin(i * 0.5) * 6);
    xx.stroke();
    xx.fillStyle = '#b388ff'; xx.fillRect(10, 10, 60, 8); xx.fillRect(10, 24, 40, 6);
    const screenMat = new THREE.MeshBasicMaterial({ map: textureFromCanvas(cc, { repeat: false }) });
    for (const [sx, sy] of [[1.43, 1.62], [1.87, 1.62], [1.65, 1.17]]) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.24), screenMat);
      s.position.set(sx, sy, -W / 2 - 0.016);
      s.rotation.y = Math.PI;
      g.add(s);
    }
    const roofbar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.3), M('#222'));
    roofbar.position.set(1.2, H + 0.06, 0);
    g.add(roofbar);
    this.vanBeacon = new THREE.MeshBasicMaterial({ color: 0x9b6bff });
    const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.2), this.vanBeacon);
    beacon.position.set(1.2, H + 0.16, 0);
    beacon.userData.noMerge = true;
    g.add(beacon);
    g.position.set(6.0, 0, 25.6);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.layer = 'ext'; } });
    this.static.add(g);
    // collision for the van
    this.boxes.push({ x0: 6.0 - L / 2, z0: 25.6 - W / 2, x1: 6.0 + L / 2 + 1.1, z1: 25.6 + W / 2, y0: 0, y1: 2.5, room: 'yard' });
    // tap the van's open door to rest or end the investigation
    const hit = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.2, 0.6), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(VAN_SPOT.x, 1.2, 24.45);
    hit.userData.interact = { type: 'van', id: 'van' };
    this.interact.push(hit);
    this.dynamic.add(hit);
    this.vanLight = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('120,200,255'), color: 0x7fe3ff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.vanLight.scale.set(2.2, 2.2, 1);
    this.vanLight.position.set(VAN_SPOT.x, 1.3, 24.35);
    this.dynamic.add(this.vanLight);
  }

  buildSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(180, 24, 12),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: {},
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `varying vec3 vP;
          float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
          void main(){
            float y = clamp(vP.y, -0.2, 1.0);
            vec3 top = vec3(0.012, 0.016, 0.05);
            vec3 mid = vec3(0.05, 0.035, 0.12);
            vec3 hor = vec3(0.13, 0.09, 0.22);
            vec3 c = mix(hor, mid, smoothstep(0.0, 0.25, y));
            c = mix(c, top, smoothstep(0.25, 0.9, y));
            vec3 cell = floor(vP * 260.0);
            float s = h(cell);
            if (s > 0.9965 && y > 0.08) c += vec3(0.75, 0.8, 1.0) * (s - 0.9965) * 220.0 * smoothstep(0.08, 0.3, y);
            gl_FragColor = vec4(c, 1.0);
          }`,
      })
    );
    sky.renderOrder = -10;
    sky.userData.noMerge = true;
    this.sky = sky;
    this.dynamic.add(sky);
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('225,232,255'), color: 0xe8eeff, transparent: true, depthWrite: false, fog: false }));
    moon.scale.set(34, 34, 1);
    moon.position.set(-60, 80, 120);
    this.dynamic.add(moon);
    const moonCore = new THREE.Mesh(new THREE.CircleGeometry(5, 32), new THREE.MeshBasicMaterial({ color: 0xf2f4ff, fog: false }));
    moonCore.position.copy(moon.position);
    moonCore.lookAt(7, 0, 12);
    this.dynamic.add(moonCore);
    this.moonPos = moon.position.clone();
    // drifting ground fog
    this.fogSheets = [];
    const fogMat = new THREE.MeshBasicMaterial({ map: T('fog'), transparent: true, opacity: 0.4, depthWrite: false, color: 0x8a96c8, side: THREE.DoubleSide });
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), fogMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(-4 + (i % 4) * 7, 0.12 + (i % 3) * 0.12, 13 + Math.floor(i / 4) * 6);
      m.userData.drift = 0.1 + (i % 5) * 0.05;
      m.renderOrder = 2;
      this.fogSheets.push(m);
      this.dynamic.add(m);
    }
  }

  /* ---------- navigation for the ghost ---------- */

  buildNav() {
    const nodes = [];
    for (const id in this.doors) {
      const d = this.doors[id];
      if (d.def.lock === 'always') continue;
      nodes.push({ x: d.center.x, y: d.center.y, z: d.center.z, rooms: d.rooms.filter(Boolean), door: id });
    }
    const bottom = { x: 8.25, y: 0, z: 11.5, rooms: ['hall'], stair: true };
    const top = { x: 8.25, y: 3, z: 5.6, rooms: ['landing'], stair: true };
    nodes.push(bottom, top);
    nodes.forEach((n, i) => { n.i = i; n.edges = []; });
    const link = (a, b) => {
      const w = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      a.edges.push([b, w]); b.edges.push([a, w]);
    };
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      if (a.rooms.some((r) => b.rooms.includes(r))) link(a, b);
    }
    link(bottom, top);
    this.nav = nodes;
  }

  /** Route through doorways from p (in room ra) to q (in room rb). Returns waypoints ending at q. */
  route(p, ra, q, rb) {
    if (!ra || !rb || ra === rb) return [q];
    const starts = this.nav.filter((n) => n.rooms.includes(ra));
    const ends = new Set(this.nav.filter((n) => n.rooms.includes(rb)));
    if (!starts.length || !ends.size) return [q];
    const dist = new Map(), prev = new Map();
    const open = [];
    for (const s of starts) { const d = Math.hypot(s.x - p.x, s.y - p.y, s.z - p.z); dist.set(s, d); open.push(s); }
    let best = null, bestD = Infinity;
    while (open.length) {
      open.sort((a, b) => dist.get(a) - dist.get(b));
      const n = open.shift();
      const dn = dist.get(n);
      if (ends.has(n)) {
        const total = dn + Math.hypot(n.x - q.x, n.y - q.y, n.z - q.z);
        if (total < bestD) { bestD = total; best = n; }
      }
      if (dn > bestD) break;
      for (const [m, w] of n.edges) {
        const nd = dn + w;
        if (nd < (dist.has(m) ? dist.get(m) : Infinity)) {
          dist.set(m, nd); prev.set(m, n);
          if (!open.includes(m)) open.push(m);
        }
      }
    }
    if (!best) return [q];
    const path = [];
    for (let n = best; n; n = prev.get(n)) path.unshift({ x: n.x, y: n.y, z: n.z });
    path.push(q);
    return path;
  }

  randomPoint(roomId, r = Math.random, inset = 0.6) {
    const room = this.rooms[roomId];
    if (!room || !room.rects.length) return null;
    const rect = room.rects[Math.floor(r() * room.rects.length)];
    const L = roomId === 'cellar' ? -1 : room.layer;
    return {
      x: rect[0] + inset + r() * Math.max(0.01, rect[2] - rect[0] - inset * 2),
      y: LAYER[L].floor,
      z: rect[1] + inset + r() * Math.max(0.01, rect[3] - rect[1] - inset * 2),
    };
  }

  roomCenter(roomId) {
    const room = this.rooms[roomId];
    const r = room.rects[0];
    return { x: (r[0] + r[2]) / 2, y: LAYER[room.layer].floor, z: (r[1] + r[3]) / 2 };
  }

  /* ---------- physics queries ---------- */

  heightAt(x, z, y, step = 0.5) {
    let best = -Infinity;
    for (const s of this.surfaces) {
      if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
      let h;
      if (s.ramp) {
        const r = s.ramp;
        const t = clamp((z - r.z0) / (r.z1 - r.z0), 0, 1);
        h = r.y0 + (r.y1 - r.y0) * t;
      } else h = s.y;
      if (h <= y + step && h > best) best = h;
    }
    return best;
  }

  /** Push a circle at pos (feet at pos.y) out of walls, closed doors and furniture. */
  collide(pos, rad, height = 1.7) {
    const y0 = pos.y + 0.3, y1 = pos.y + height;
    for (let iter = 0; iter < 3; iter++) {
      for (const w of this.walls) {
        if (w.y1 <= y0 || w.y0 >= y1) continue;
        this.pushSeg(pos, rad + WT / 2, w.x1, w.z1, w.x2, w.z2);
      }
      for (const id in this.doors) {
        const d = this.doors[id];
        if (d.def.open) continue;
        const fl = LAYER[d.layer].floor;
        if (fl + 2.1 <= y0 || fl >= y1) continue;
        if (this.doorClosed(d)) {
          const df = d.def;
          const [x1, z1, x2, z2] = df.line === 'x' ? [df.at, df.from, df.at, df.to] : [df.from, df.at, df.to, df.at];
          this.pushSeg(pos, rad + 0.04, x1, z1, x2, z2);
        } else if (d.angle > 0.5) {
          // the open panel itself
          const a = d.pivot.rotation.y;
          const tx = d.hinge.x + Math.cos(a) * d.width, tz = d.hinge.z - Math.sin(a) * d.width;
          this.pushSeg(pos, rad + 0.03, d.hinge.x, d.hinge.z, tx, tz);
        }
      }
      for (const b of this.boxes) {
        if (b.y1 <= pos.y + 0.25 || b.y0 >= y1) continue;
        const cx = clamp(pos.x, b.x0, b.x1), cz = clamp(pos.z, b.z0, b.z1);
        const dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < rad * rad) {
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            pos.x = cx + (dx / d) * rad;
            pos.z = cz + (dz / d) * rad;
          } else {
            // centre inside the box: push out the nearest side
            const opts = [[pos.x - b.x0, -1, 0], [b.x1 - pos.x, 1, 0], [pos.z - b.z0, 0, -1], [b.z1 - pos.z, 0, 1]];
            opts.sort((p, q) => p[0] - q[0]);
            const o = opts[0];
            if (o[1]) pos.x = o[1] < 0 ? b.x0 - rad : b.x1 + rad;
            else pos.z = o[2] < 0 ? b.z0 - rad : b.z1 + rad;
          }
        }
      }
    }
  }

  pushSeg(pos, r, x1, z1, x2, z2) {
    const c = closestOnSeg(pos.x, pos.z, x1, z1, x2, z2);
    const dx = pos.x - c.x, dz = pos.z - c.z;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return;
    const d = Math.sqrt(d2) || 1e-6;
    let nx = dx / d, nz = dz / d;
    if (d2 < 1e-10) { nx = z2 - z1; nz = x1 - x2; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l; }
    pos.x = c.x + nx * r;
    pos.z = c.z + nz * r;
  }

  /** Can a point at a see b? Walls and closed doors block; different floors can't see each other. */
  los(a, b) {
    const La = layerOfY(a.y), Lb = layerOfY(b.y);
    const inStairwell = (p) => p.x > 5 && p.x < 9.2 && p.z > 5 && p.z < 12.2;
    if (La !== Lb && !(inStairwell(a) && inStairwell(b))) return false;
    const ylo = Math.min(a.y, b.y) - 0.1, yhi = Math.max(a.y, b.y) + 0.1;
    for (const w of this.walls) {
      if (w.rail) continue;
      if (w.y1 <= ylo || w.y0 >= yhi) continue;
      if (segsCross(a.x, a.z, b.x, b.z, w.x1, w.z1, w.x2, w.z2)) return false;
    }
    for (const id in this.doors) {
      const d = this.doors[id];
      if (d.def.open || !this.doorClosed(d)) continue;
      const fl = LAYER[d.layer].floor;
      if (fl + 2.1 <= ylo || fl >= yhi) continue;
      const df = d.def;
      const [x1, z1, x2, z2] = df.line === 'x' ? [df.at, df.from, df.at, df.to] : [df.from, df.at, df.to, df.at];
      if (segsCross(a.x, a.z, b.x, b.z, x1, z1, x2, z2)) return false;
    }
    return true;
  }

  /* ---------- merging static geometry ---------- */

  mergeAll() {
    this.static.updateMatrixWorld(true);
    const buckets = new Map();
    const keep = [];
    const noMerge = (o) => { for (let p = o; p && p !== this.static; p = p.parent) if (p.userData.noMerge) return true; return false; };
    const layerOf = (o) => { for (let p = o; p && p !== this.static; p = p.parent) if (p.userData.layer !== undefined) return p.userData.layer; return 'ext'; };
    const archOf = (o) => !!o.userData.arch || layerOf(o) === 'ext';
    this.static.traverse((o) => {
      if (!o.isMesh && !o.isSprite) return;
      if (o.isSprite || noMerge(o) || o.material.transparent) { keep.push(o); return; }
      const g = bakeGeo(o, o.matrixWorld);
      const L = layerOf(o);
      const arch = archOf(o);
      const key = o.material.uuid + '|' + L + '|' + arch;
      if (!buckets.has(key)) buckets.set(key, { mat: o.material, L, arch, geos: [] });
      buckets.get(key).geos.push(g);
    });
    for (const o of keep) {
      const L = layerOf(o);
      const grp = this.layerGroups[L] || this.layerGroups.ext;
      grp.attach(o);
    }
    this.arch = [];
    for (const { mat, L, arch, geos } of buckets.values()) {
      const merged = mergeGeos(geos);
      const m = new THREE.Mesh(merged, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      if (arch) this.arch.push(m);
      (this.layerGroups[L] || this.layerGroups.ext).add(m);
    }
    this.static.clear();
  }

  /** The moonlight's shadow is drawn once. After that, walls, floors and the
      yard only need to receive shadows, which keeps the flashlight's shadow
      pass down to the furniture. */
  afterShadowBake() {
    for (const m of this.arch) m.castShadow = false;
  }

  /** Draw only what the player could possibly see from where they are. */
  setVisibleFor(L, room) {
    const out = !room || room === 'yard';
    const cellarOpen = this.doors.cellar && this.doors.cellar.target > 0.3;
    const g = this.layerGroups;
    if (out) {
      // from outside only the hall shows, and only through the open front door
      g[-1].visible = false; g[1].visible = false; g.ext.visible = true;
      g[0].visible = this.doors.front.target > 0.3;
      return;
    }
    // the stairwells are the only places you can see between floors
    g[-1].visible = L === -1 || room === 'cellar' || (room === 'hall' && cellarOpen);
    g[0].visible = L === 0 || room === 'hall' || room === 'landing' || room === 'cellar';
    g[1].visible = L === 1 || room === 'hall';
    // outside is only visible through the front door
    g.ext.visible = room === 'hall' && this.doors.front.target > 0.3;
  }

  /* ---------- per-frame ---------- */

  update(dt, now, cam, opts = {}) {
    // doors swing toward their targets
    for (const id in this.doors) {
      const d = this.doors[id];
      if (d.def.open || !d.pivot) continue;
      if (Math.abs(d.angle - d.target) > 0.001) {
        const speed = d.slam ? 5.5 : 2.2;
        d.angle += Math.sign(d.target - d.angle) * Math.min(Math.abs(d.target - d.angle), speed * dt);
        if (Math.abs(d.angle - d.target) <= 0.001) d.slam = false;
        this.poseDoor(d);
      }
    }
    // throwables
    for (const t of this.throwables) {
      if (!t.flying) continue;
      const p = t.obj.position;
      t.vel.y -= 9.8 * dt;
      p.addScaledVector(t.vel, dt);
      t.obj.rotation.x += t.spin.x * dt;
      t.obj.rotation.y += t.spin.y * dt;
      t.obj.rotation.z += t.spin.z * dt;
      // stay inside the room
      const room = this.rooms[t.room];
      const rr = room.rects.find((r) => p.x >= r[0] - 0.3 && p.x <= r[2] + 0.3 && p.z >= r[1] - 0.3 && p.z <= r[3] + 0.3) || room.rects[0];
      if (p.x < rr[0] + t.r) { p.x = rr[0] + t.r; t.vel.x = Math.abs(t.vel.x) * 0.4; }
      if (p.x > rr[2] - t.r) { p.x = rr[2] - t.r; t.vel.x = -Math.abs(t.vel.x) * 0.4; }
      if (p.z < rr[1] + t.r) { p.z = rr[1] + t.r; t.vel.z = Math.abs(t.vel.z) * 0.4; }
      if (p.z > rr[3] - t.r) { p.z = rr[3] - t.r; t.vel.z = -Math.abs(t.vel.z) * 0.4; }
      const fl = LAYER[room.layer].floor;
      if (p.y <= fl) {
        p.y = fl;
        if (Math.abs(t.vel.y) > 1.2 && (t.bounces || 0) < 3) {
          t.vel.y = -t.vel.y * (t.ball ? 0.6 : 0.3);
          t.vel.x *= 0.6; t.vel.z *= 0.6;
          t.spin.multiplyScalar(0.5);
          t.bounces = (t.bounces || 0) + 1;
          if (opts.onLand) opts.onLand(t, t.bounces === 1);
        } else {
          t.vel.set(0, 0, 0);
          t.flying = false;
          t.obj.rotation.x = t.ball ? t.obj.rotation.x : (Math.abs(Math.sin(t.obj.rotation.x)) > 0.5 ? Math.PI / 2 : 0);
          t.obj.rotation.z = t.ball ? t.obj.rotation.z : 0;
          if (opts.onLand) opts.onLand(t, false);
        }
      }
    }
    // the pendulum, rocking chairs, candles, swing
    for (const a of this.anims) {
      if (a.kind === 'pendulum') { if (!a.stopped) a.obj.rotation.z = Math.sin(now * Math.PI) * 0.18; }
      else if (a.kind === 'flame') { a.obj.scale.set(0.12 + Math.sin(now * 23) * 0.01, 0.18 + Math.sin(now * 17) * 0.03, 1); }
      else if (a.kind === 'rock') {
        a.amp = Math.max(0, a.amp - dt * 0.08);
        a.phase += dt * 3.2;
        a.obj.rotation.x = Math.sin(a.phase) * a.amp;
      }
    }
    if (this.swing) {
      this.swingAmp = Math.max(0.05, (this.swingAmp || 0.05) - dt * 0.03);
      this.swing.rotation.x = Math.sin(now * 1.6) * this.swingAmp;
    }
    if (this.sigilMat) this.sigilMat.opacity = (opts.sigilGlow || 0.25) + Math.sin(now * 2) * 0.05;
    for (const f of this.fogSheets) {
      f.position.x += f.userData.drift * dt;
      if (f.position.x > 26) f.position.x = -8;
      f.rotation.z += dt * 0.01;
    }
    // street lamp buzz
    const sl = 0.85 + (Math.sin(now * 37) > 0.97 ? -0.6 : 0) + Math.sin(now * 3.1) * 0.05;
    this.streetLevel = sl;
    this.streetGlow.material.opacity = 0.55 * sl;
    this.vanBeacon.color.setHSL(0.73, 0.9, 0.45 + Math.sin(now * 4) * 0.2);
    this.updateLights(dt, now, cam, opts);
  }

  lampLevel(room, now, lamp) {
    if (lamp && lamp.kind === 'street') return this.streetLevel || 1;
    let lvl = room.on ? 1 : 0;
    if (now < room.flickUntil) {
      const f = Math.sin(now * 31 + room.id.length) * Math.sin(now * 13.7);
      const gentle = this.reduceFlashing;
      if (gentle) lvl = room.on ? 0.55 + 0.25 * Math.sin(now * 3) : 0.2;
      else lvl = f > 0.1 ? (room.on ? 1 : 0.7) : (f > -0.4 ? 0.25 : 0);
    }
    if (this.blackout) lvl = 0;
    return lvl;
  }

  updateLights(dt, now, cam, opts) {
    const cands = [];
    const camL = layerOfY(cam.y - 1.5);
    for (const id in this.rooms) {
      const room = this.rooms[id];
      for (const l of room.lamps) {
        const lvl = this.lampLevel(room, now, l);
        // bulbs and shades glow
        if (l.kind !== 'street') {
          l.bulb.color.setRGB(0.16 + lvl * 0.84, 0.14 + lvl * 0.8, 0.11 + lvl * 0.6, THREE.SRGBColorSpace);
          if (l.shade) l.shade.emissive.setRGB(lvl * 0.5, lvl * 0.38, lvl * 0.2);
        }
        if (lvl <= 0.01) continue;
        let d = Math.hypot(l.x - cam.x, l.y - cam.y, l.z - cam.z);
        if (l.layer !== camL) d += 7;
        cands.push({ l, lvl, d });
      }
      if (room.windowMat) {
        const lvl = this.lampLevel(room, now);
        room.windowMat.color.setRGB(0.05 + lvl * 0.85, 0.06 + lvl * 0.62, 0.12 + lvl * 0.3, THREE.SRGBColorSpace);
      }
    }
    cands.sort((a, b) => a.d - b.d);
    for (let i = 0; i < this.pool.length; i++) {
      const pl = this.pool[i];
      const c = cands[i];
      if (!c) { pl.intensity = 0; continue; }
      pl.position.set(c.l.x, c.l.y, c.l.z);
      pl.intensity = (c.l.power || 7) * c.lvl;
      pl.distance = c.l.dist || 7.5;
      pl.color.setHex(c.l.kind === 'street' ? 0xffb066 : 0xffd29a);
    }
  }
}

/* ------------------------------------------------------------------ */

/** The team emblem on the van: a ghost in a magnifying glass, with EMF waves. */
function drawSigilGhost(x, cx, cy, r) {
  x.save();
  x.lineCap = 'round';
  x.strokeStyle = '#9b6bff';
  x.lineWidth = r * 0.2;
  x.beginPath(); x.moveTo(cx + r * 0.72, cy + r * 0.72); x.lineTo(cx + r * 1.15, cy + r * 1.15); x.stroke();
  x.fillStyle = '#1e1650';
  x.lineWidth = r * 0.12;
  x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); x.stroke();
  x.strokeStyle = 'rgba(127,227,255,0.8)';
  x.lineWidth = r * 0.06;
  for (const k of [1.25, 1.45]) { x.beginPath(); x.arc(cx, cy, r * k, Math.PI * 1.08, Math.PI * 1.42); x.stroke(); }
  const w = r * 0.42;
  x.fillStyle = '#e9f0ff';
  x.beginPath();
  x.moveTo(cx - w, cy + r * 0.55);
  x.lineTo(cx - w, cy - r * 0.05);
  x.arc(cx, cy - r * 0.05, w, Math.PI, 0);
  x.lineTo(cx + w, cy + r * 0.55);
  for (let i = 0; i < 4; i++) {
    const xx = cx + w - (i + 0.5) * (w * 2 / 4);
    x.lineTo(xx, cy + r * 0.42);
    x.lineTo(xx - w / 4, cy + r * 0.55);
  }
  x.fill();
  x.fillStyle = '#141a3a';
  x.beginPath(); x.ellipse(cx - r * 0.15, cy - r * 0.06, r * 0.07, r * 0.11, 0, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.ellipse(cx + r * 0.15, cy - r * 0.06, r * 0.07, r * 0.11, 0, 0, Math.PI * 2); x.fill();
  x.restore();
}
