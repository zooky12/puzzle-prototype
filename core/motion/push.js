// core/motion/push.js
// Push-chain planning and application
import { firstEntityAt, moveEntity, removeEntityAt } from '../state.js';
import { isPushable } from '../entities.js';
import { isTrait } from '../tiles.js';
import { effectEntityMoved, effectBoxFell } from '../engine/effects.js';

function inBounds(state, x, y) {
  return x >= 0 && x < state.size.cols && y >= 0 && y < state.size.rows;
}

function tileAt(state, x, y) {
  return state.base[y][x] || 'floor';
}

// Plan a push chain from (x,y) in direction (dx,dy)
export function planPushChain(state, x, y, dx, dy) {
  const chain = [];
  let cx = x, cy = y;
  while (true) {
    const ent = firstEntityAt(state, cx, cy, isPushable);
    if (!ent) break;
    chain.push(ent);
    cx += dx; cy += dy;
    if (!inBounds(state, cx, cy)) return { ok: false };
    const t = tileAt(state, cx, cy);
    // a box cannot enter walls-for-box; solid entity blocks unless it is pushable
    const isWallForBox = isTrait(t, 'isWallForBox');
    const nextPushable = firstEntityAt(state, cx, cy, isPushable);
    const solidFront = firstEntityAt(state, cx, cy, (e) => !isPushable(e));
    if (isWallForBox) return { ok: false };
    if (solidFront && !nextPushable) return { ok: false };
    if (!nextPushable) break;
  }

  const endX = chain.length ? chain[chain.length - 1].x + dx : x;
  const endY = chain.length ? chain[chain.length - 1].y + dy : y;
  const t = tileAt(state, endX, endY);
  return { ok: true, chain, end: { x: endX, y: endY }, endIsHole: isTrait(t, 'isHoleForBox') };
}

// Apply a planned chain (without removing tail for holes). Returns effects.
export function applyPushChain(state, chain, dx, dy) {
  const effects = [];
  for (let i = chain.length - 1; i >= 0; i--) {
    const e = chain[i];
    const from = { x: e.x, y: e.y };
    const to = { x: e.x + dx, y: e.y + dy };
    moveEntity(state, e, to.x, to.y);
    effects.push(effectEntityMoved(e, from, to));
  }
  return effects;
}

// Remove last entity of chain (it fell in a hole) and push the rest
export function applyPushChainWithFall(state, chain, dx, dy) {
  if (!chain.length) return [];
  const effects = [];
  const last = chain[chain.length - 1];
  const lastFrom = { x: last.x, y: last.y };
  removeEntityAt(state, last.x, last.y, (e) => e === last);
  effects.push(effectBoxFell({ x: lastFrom.x + dx, y: lastFrom.y + dy }));
  const before = chain.slice(0, -1);
  effects.push(...applyPushChain(state, before, dx, dy));
  return effects;
}

