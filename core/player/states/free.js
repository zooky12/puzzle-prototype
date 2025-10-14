// core/player/states/free.js
import { isTrait } from '../../tiles.js';
import { firstEntityAt } from '../../state.js';
import { isPushable, isSolid } from '../../entities.js';
import { effectEntityMoved } from '../../engine/effects.js';

function inBounds(state, x, y) {
  return x >= 0 && x < state.size.cols && y >= 0 && y < state.size.rows;
}
function tileAt(state, x, y) { return state.base[y][x] || 'floor'; }

export function canHandle(state, player /*under unused*/) {
  return player.state?.mode === 'free';
}

export function handleInput(state, player, { dx, dy }) {
  const effects = [];
  const px = player.x, py = player.y;
  const tx = px + dx, ty = py + dy;
  if (!inBounds(state, tx, ty)) return { newState: state, effects, changed: false };
  const targetTile = tileAt(state, tx, ty);
  if (isTrait(targetTile, 'isWallForPlayer')) return { newState: state, effects, changed: false };

  const pushableFront = firstEntityAt(state, tx, ty, isPushable);
  if (pushableFront) {
    // enter inbox mode
    player.state = { mode: 'inbox', entryDir: { dx, dy } };
    const from = { x: px, y: py }, to = { x: tx, y: ty };
    player.x = to.x; player.y = to.y;
    effects.push(effectEntityMoved({ type: 'player' }, from, to));
    return { newState: state, effects, changed: true };
  }

  const solidFront = firstEntityAt(state, tx, ty, isSolid);
  if (solidFront) return { newState: state, effects, changed: false };

  const from = { x: px, y: py }, to = { x: tx, y: ty };
  player.x = to.x; player.y = to.y;
  effects.push(effectEntityMoved({ type: 'player' }, from, to));
  return { newState: state, effects, changed: true };
}

