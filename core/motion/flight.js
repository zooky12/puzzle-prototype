// core/motion/flight.js
// Flight resolution and fragile breaking
import { firstEntityAt, removeEntityAt } from '../state.js';
import { EntityTypes, isPushable } from '../entities.js';
import { isTrait } from '../tiles.js';
import { effectTileChanged } from '../engine/effects.js';

function inBounds(state, x, y) {
  return x >= 0 && x < state.size.cols && y >= 0 && y < state.size.rows;
}

function tileAt(state, x, y) {
  return state.base[y][x] || 'floor';
}

export function breakFragileEntityIfNeeded(state, x, y, effects) {
  const frag = firstEntityAt(state, x, y, (e) => e.type === EntityTypes.fragileWall);
  if (!frag) return;
  const fromTile = state.base[y][x] || 'floor';
  const hasUnder = Object.prototype.hasOwnProperty.call(frag, 'underTile');
  const under = hasUnder ? frag.underTile : fromTile;
  removeEntityAt(state, x, y, (e) => e === frag);
  if (hasUnder) {
    // Only change base if an explicit underTile was provided when placing the fragile entity
    if (under !== fromTile) effects.push(effectTileChanged({ x, y }, fromTile, under));
    state.base[y][x] = under;
  }
}

export function breakFragileTileIfNeeded(state, x, y, effects) {
  const t = tileAt(state, x, y);
  if (!isTrait(t, 'isFragile')) return;
  const fromTile = t;
  const toTile = 'floor';
  state.base[y][x] = toTile;
  effects.push(effectTileChanged({ x, y }, fromTile, toTile));
}

// Resolve flight scanning one input: returns { x, y, mode, entryDir?, effects[] }
export function resolveFlight(state, px, py, fdx, fdy) {
  const effects = [];
  let cx = px, cy = py;
  while (true) {
    const nx = cx + fdx, ny = cy + fdy;
    if (!inBounds(state, nx, ny)) return { x: cx, y: cy, mode: 'free', effects };

    const tPre = tileAt(state, nx, ny);
    const hasFragileEnt = firstEntityAt(state, nx, ny, (e) => e.type === EntityTypes.fragileWall);
    const hasFragileTile = isTrait(tPre, 'isFragile');
    if (hasFragileEnt || hasFragileTile) {
      breakFragileEntityIfNeeded(state, nx, ny, effects);
      breakFragileTileIfNeeded(state, nx, ny, effects);
      return { x: cx, y: cy, mode: 'free', effects };
    }

    const t = tileAt(state, nx, ny);
    if (isTrait(t, 'isNotFly')) return { x: cx, y: cy, mode: 'free', effects };

    const boxFront = firstEntityAt(state, nx, ny, isPushable);
    if (isTrait(t, 'isStickOnFly')) {
      if (boxFront) return { x: nx, y: ny, mode: 'inbox', entryDir: { dx: fdx, dy: fdy }, effects };
      return { x: nx, y: ny, mode: 'free', effects };
    }
    if (boxFront) {
      return { x: nx, y: ny, mode: 'inbox', entryDir: { dx: fdx, dy: fdy }, effects };
    }

    cx = nx; cy = ny;
  }
}
