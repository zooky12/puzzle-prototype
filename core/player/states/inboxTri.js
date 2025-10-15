// core/player/states/inboxTri.js
import { isTrait } from '../../tiles.js';
import { firstEntityAt, moveEntity, removeEntityAt } from '../../state.js';
import { EntityTypes, isPushable, isSolid } from '../../entities.js';
import { planPushChain, applyPushChain, applyPushChainWithFall } from '../../motion/push.js';
import { resolveFlight } from '../../motion/flight.js';
import { effectEntityMoved, effectBoxFell, effectPlayerLaunched, effectPlayerExitedBox } from '../../engine/effects.js';

function inBounds(state, x, y) { return x >= 0 && x < state.size.cols && y >= 0 && y < state.size.rows; }
function tileAt(state, x, y) { return state.base[y][x] || 'floor'; }

function longDirsForOrient(orient) {
  // orient denotes the two SHORT sides: e.g., 'SE' means short legs on South and East.
  // The long (hypotenuse) is then opposite those legs; the two directions that "hit" the long side are:
  // NE -> {S, W}; NW -> {E, S}; SE -> {N, W}; SW -> {N, E}
  switch (orient) {
    case 'NE': return [{ dx: 0, dy: 1 }, { dx: -1, dy: 0 }];
    case 'NW': return [{ dx: 1, dy: 0 }, { dx: 0, dy: 1 }];
    case 'SE': return [{ dx: 0, dy: -1 }, { dx: -1, dy: 0 }];
    case 'SW': return [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }];
    default:   return [{ dx: 0, dy: 1 }, { dx: -1, dy: 0 }];
  }
}
function dirEq(a,b){ return !!a && !!b && a.dx===b.dx && a.dy===b.dy; }

export function canHandle(state, player, under) {
  if (player.state?.mode !== 'inbox') return false;
  return !!under && under.type === EntityTypes.triBox;
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

  // Generic reverse-flight (like other boxes): pressing opposite of entryDir glides if front allows
  const solidFrontForFlight = firstEntityAt(state, tx, ty, isSolid);
  const pushableFrontForFlight = firstEntityAt(state, tx, ty, isPushable);
  if (
    player.state?.entryDir &&
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

  // Triangular special: if entered from long side, then moving in either long-side direction triggers flight instead of push
  const orient = (under.state && under.state.orient) || 'NE';
  const longDirs = longDirsForOrient(orient);
  const enteredFromShort = longDirs.some(ld => dirEq(ld, player.state?.entryDir));
  const movingIntoLong = longDirs.some(ld => dirEq(ld, {dx,dy}));
  if (!enteredFromShort && movingIntoLong) {
    if (isTrait(targetTile, 'isWallForPlayer')) return { newState: state, effects, changed: false };
    const res = resolveFlight(state, px, py, dx, dy);
    player.x = res.x; player.y = res.y;
    player.state = res.mode === 'inbox'
      ? { mode: 'inbox', entryDir: res.entryDir }
      : { mode: 'free', entryDir: { dx: 0, dy: 0 } };
    effects.push(effectEntityMoved({ type: 'player' }, { x: px, y: py }, { x: player.x, y: player.y }));
    const dist2 = Math.abs(player.x - px) + Math.abs(player.y - py);
    effects.push(effectPlayerLaunched({ x: px, y: py }, { x: player.x, y: player.y }, { dx, dy }, dist2));
    if (player.state.mode === 'free') {
      effects.push(effectPlayerExitedBox(under.type, { x: player.x, y: player.y }, { dx, dy }));
    }
    effects.push(...(res.effects || []));
    return { newState: state, effects, changed: true };
  }

  // Otherwise behave like a normal box
  const frontPushable = firstEntityAt(state, tx, ty, isPushable);
  const solidFrontBox = firstEntityAt(state, tx, ty, isSolid);
  const blockedForBox = isTrait(targetTile, 'isWallForBox') || (!!solidFrontBox && !frontPushable);
  if (blockedForBox) return { newState: state, effects, changed: false };

  if (frontPushable) {
    const plan = planPushChain(state, tx, ty, dx, dy);
    if (!plan.ok) return { newState: state, effects, changed: false };
    if (plan.endIsHole) effects.push(...applyPushChainWithFall(state, plan.chain, dx, dy));
    else effects.push(...applyPushChain(state, plan.chain, dx, dy));
  }

  if (isTrait(targetTile, 'isHoleForBox')) {
    removeEntityAt(state, px, py, (e) => e === under);
    effects.push(effectBoxFell({ x: tx, y: ty }, { boxType: under.type, orient: under.state && under.state.orient, playerInside: true }));
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
