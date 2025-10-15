// core/player/states/inboxHeavy.js
import { isTrait } from '../../tiles.js';
import { firstEntityAt, moveEntity, removeEntityAt } from '../../state.js';
import { EntityTypes, isPushable, isSolid } from '../../entities.js';
import { planPushChain, applyPushChain, applyPushChainWithFall } from '../../motion/push.js';
import { resolveFlight } from '../../motion/flight.js';
import { effectEntityMoved, effectBoxFell, effectPlayerLaunched, effectPlayerExitedBox, effectHeavyNeutral } from '../../engine/effects.js';

function inBounds(state, x, y) { return x >= 0 && x < state.size.cols && y >= 0 && y < state.size.rows; }
function tileAt(state, x, y) { return state.base[y][x] || 'floor'; }
function isSameDir(a, b) { return a && b && a.dx === b.dx && a.dy === b.dy && !(a.dx === 0 && a.dy === 0); }
function isZeroDir(d) { return !d || (d.dx === 0 && d.dy === 0); }

export function canHandle(state, player, under) {
  if (player.state?.mode !== 'inbox') return false;
  return !!under && under.type === EntityTypes.heavyBox;
}

export function handleInput(state, player, { dx, dy }) {
  const effects = [];
  const px = player.x, py = player.y;
  const tx = px + dx, ty = py + dy;
  if (!inBounds(state, tx, ty)) return { newState: state, effects, changed: false };
  const targetTile = tileAt(state, tx, ty);

  const under = firstEntityAt(state, px, py, isPushable);
  if (!under) {
    player.state = { mode: 'free', entryDir: { dx: 0, dy: 0 } };
    return { newState: state, effects, changed: false };
  }

  // Reverse -> flight (same condition as normal box)
  const solidFrontForFlight = firstEntityAt(state, tx, ty, isSolid);
  const pushableFrontForFlight = firstEntityAt(state, tx, ty, isPushable);
  if (
    !isZeroDir(player.state.entryDir) &&
    dx === -player.state.entryDir.dx &&
    dy === -player.state.entryDir.dy &&
    !isTrait(targetTile, 'isWallForPlayer') &&
    (!solidFrontForFlight || !!pushableFrontForFlight)
  ) {
    const res = resolveFlight(state, px, py, dx, dy);
    player.x = res.x; player.y = res.y;
    player.state = res.mode === 'inbox'
      ? { mode: 'inbox', entryDir: res.entryDir }
      : { mode: 'free', entryDir: { dx: 0, dy: 0 } };
    effects.push(effectEntityMoved({ type: 'player' }, { x: px, y: py }, { x: player.x, y: player.y }));
    const dist = Math.abs(player.x - px) + Math.abs(player.y - py);
    effects.push(effectPlayerLaunched({ x: px, y: py }, { x: player.x, y: player.y }, { dx, dy }, dist));
    if (player.state.mode === 'free') {
      effects.push(effectPlayerExitedBox(under.type, { x: player.x, y: player.y }, { dx, dy }));
    }
    effects.push(...(res.effects || []));
    return { newState: state, effects, changed: true };
  }

  const sameAsEntry = isSameDir({ dx, dy }, player.state.entryDir);
  const entryZero = isZeroDir(player.state.entryDir);
  const frontPushable = firstEntityAt(state, tx, ty, isPushable);
  const solidFrontBox = firstEntityAt(state, tx, ty, isSolid);
  const blockedForBox = isTrait(targetTile, 'isWallForBox') || (!!solidFrontBox && !frontPushable);

  // Case A: move in entryDir (non-neutral)
  if (sameAsEntry) {
    if (blockedForBox) return { newState: state, effects, changed: false };
    if (frontPushable) {
      const plan = planPushChain(state, tx, ty, dx, dy);
      if (!plan.ok) return { newState: state, effects, changed: false };
      if (plan.endIsHole) {
        effects.push(...applyPushChainWithFall(state, plan.chain, dx, dy));
      } else {
        effects.push(...applyPushChain(state, plan.chain, dx, dy));
      }

      const fromHb = { x: px, y: py }, toHb = { x: px + dx, y: py + dy };
      moveEntity(state, under, toHb.x, toHb.y);
      effects.push(effectEntityMoved(under, fromHb, toHb));

      const pFrom = { x: px, y: py }, pTo = { x: toHb.x, y: toHb.y };
      player.x = pTo.x; player.y = pTo.y; // entryDir unchanged
      effects.push(effectEntityMoved({ type: 'player' }, pFrom, pTo));
      return { newState: state, effects, changed: true };
    }

    // Front empty -> move heavy and neutralize entryDir
    if (isTrait(targetTile, 'isHoleForBox')) {
      const pFrom = { x: px, y: py };
      removeEntityAt(state, px, py, (e) => e === under);
      effects.push(effectBoxFell({ x: tx, y: ty }, { boxType: under.type, orient: under.state && under.state.orient, playerInside: true }));
      player.x = tx; player.y = ty;
      player.state.entryDir = { dx: 0, dy: 0 };
      effects.push(effectEntityMoved({ type: 'player' }, pFrom, { x: player.x, y: player.y }));
      return { newState: state, effects, changed: true };
    }

    const fromHb = { x: px, y: py }, toHb = { x: tx, y: ty };
    moveEntity(state, under, toHb.x, toHb.y);
    effects.push(effectEntityMoved(under, fromHb, toHb));
    const pFrom = { x: px, y: py }, pTo = { x: toHb.x, y: toHb.y };
    player.x = pTo.x; player.y = pTo.y;
    player.state.entryDir = { dx: 0, dy: 0 };
    effects.push(effectHeavyNeutral({ x: player.x, y: player.y }, true));
    effects.push(effectEntityMoved({ type: 'player' }, pFrom, pTo));
    return { newState: state, effects, changed: true };
  }

  // Case B: neutral -> set opposite(dir)
  if (entryZero) {
    // In neutral, heavy cannot push other boxes: treat a pushable in front as a wall
    if (frontPushable) return { newState: state, effects, changed: false };
    if (blockedForBox) return { newState: state, effects, changed: false };

    // No front pushable: set opposite and move heavy (or fall)
    player.state.entryDir = { dx: -dx, dy: -dy };
    effects.push(effectHeavyNeutral({ x: px, y: py }, false));
    if (isTrait(targetTile, 'isHoleForBox')) {
      removeEntityAt(state, px, py, (e) => e === under);
      effects.push(effectBoxFell({ x: tx, y: ty }, { boxType: under.type, orient: under.state && under.state.orient, playerInside: true }));
      const pFrom = { x: px, y: py };
      player.x = tx; player.y = ty;
      effects.push(effectEntityMoved({ type: 'player' }, pFrom, { x: player.x, y: player.y }));
      return { newState: state, effects, changed: true };
    }
    const fromHb = { x: px, y: py }, toHb = { x: tx, y: ty };
    moveEntity(state, under, toHb.x, toHb.y);
    effects.push(effectEntityMoved(under, fromHb, toHb));
    const pFrom = { x: px, y: py }, pTo = { x: toHb.x, y: toHb.y };
    player.x = pTo.x; player.y = pTo.y;
    effects.push(effectEntityMoved({ type: 'player' }, pFrom, pTo));
    return { newState: state, effects, changed: true };
  }

  // Case C: normal behavior (same as box state)
  if (blockedForBox) return { newState: state, effects, changed: false };
  if (frontPushable) {
    const plan = planPushChain(state, tx, ty, dx, dy);
    if (!plan.ok) return { newState: state, effects, changed: false };
    if (plan.endIsHole) {
      effects.push(...applyPushChainWithFall(state, plan.chain, dx, dy));
    } else {
      effects.push(...applyPushChain(state, plan.chain, dx, dy));
    }
    const fromB = { x: px, y: py }, toB = { x: px + dx, y: py + dy };
    moveEntity(state, under, toB.x, toB.y);
    effects.push(effectEntityMoved(under, fromB, toB));
    const pFrom = { x: px, y: py }, pTo = { x: toB.x, y: toB.y };
    player.x = pTo.x; player.y = pTo.y;
    effects.push(effectEntityMoved({ type: 'player' }, pFrom, pTo));
    return { newState: state, effects, changed: true };
  }

  if (isTrait(targetTile, 'isHoleForBox')) {
    removeEntityAt(state, px, py, (e) => e === under);
    effects.push(effectBoxFell({ x: tx, y: ty }));
    const pFrom = { x: px, y: py };
    player.x = tx; player.y = ty;
    effects.push(effectEntityMoved({ type: 'player' }, pFrom, { x: player.x, y: player.y }));
    return { newState: state, effects, changed: true };
  }

  const fromB = { x: px, y: py }, toB = { x: tx, y: ty };
  moveEntity(state, under, toB.x, toB.y);
  effects.push(effectEntityMoved(under, fromB, toB));
  const pFrom = { x: px, y: py }, pTo = { x: toB.x, y: toB.y };
  player.x = pTo.x; player.y = pTo.y;
  effects.push(effectEntityMoved({ type: 'player' }, pFrom, pTo));
  return { newState: state, effects, changed: true };
}
