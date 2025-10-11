// core/state.js
import { EntityRegistry, EntityTypes, isSolid } from './entities.js';
import { isTrait } from './tiles.js';

export function createEmptyState(rows, cols) {
  return {
    size: { rows, cols },
    base: Array.from({length:rows}, ()=> Array.from({length:cols}, ()=> 'floor')),
    entities: [], // [{type,x,y,state?}]
  };
}

export function cloneState(s) {
  return {
    size: { ...s.size },
    base: s.base.map(r => r.slice()),
    entities: s.entities.map(e => ({ type:e.type, x:e.x, y:e.y, state: e.state ? JSON.parse(JSON.stringify(e.state)) : undefined }))
  };
}

function cloneEntityState(state) {
  if (!state) return undefined;
  try {
    return JSON.parse(JSON.stringify(state));
  } catch {
    return undefined;
  }
}

function shiftEntity(entity, dx, dy) {
  entity.x += dx;
  entity.y += dy;
  if (entity.state) {
    if (typeof entity.state.x === 'number') entity.state.x += dx;
    if (typeof entity.state.y === 'number') entity.state.y += dy;
  }
}

function pruneOutOfBounds(state) {
  state.entities = state.entities.filter(e =>
    e.x >= 0 && e.x < state.size.cols &&
    e.y >= 0 && e.y < state.size.rows
  );
}

function mutateAddRow(state, position) {
  const row = Array.from({ length: state.size.cols }, () => 'floor');
  if (position === 'top') {
    state.base.unshift(row);
    state.size.rows += 1;
    state.entities.forEach(e => shiftEntity(e, 0, 1));
  } else {
    state.base.push(row);
    state.size.rows += 1;
  }
}

function mutateAddColumn(state, position) {
  if (position === 'left') {
    state.base.forEach(r => r.unshift('floor'));
    state.size.cols += 1;
    state.entities.forEach(e => shiftEntity(e, 1, 0));
  } else {
    state.base.forEach(r => r.push('floor'));
    state.size.cols += 1;
  }
}

function mutateRemoveRow(state, position) {
  if (state.size.rows <= 1) return false;
  if (position === 'top') {
    state.base.shift();
    state.size.rows -= 1;
    state.entities = state.entities.filter(e => e.y > 0);
    state.entities.forEach(e => shiftEntity(e, 0, -1));
  } else {
    state.base.pop();
    state.size.rows -= 1;
    state.entities = state.entities.filter(e => e.y < state.size.rows);
  }
  pruneOutOfBounds(state);
  return true;
}

function mutateRemoveColumn(state, position) {
  if (state.size.cols <= 1) return false;
  if (position === 'left') {
    state.base.forEach(r => r.shift());
    state.size.cols -= 1;
    state.entities = state.entities.filter(e => e.x > 0);
    state.entities.forEach(e => shiftEntity(e, -1, 0));
  } else {
    state.base.forEach(r => r.pop());
    state.size.cols -= 1;
    state.entities = state.entities.filter(e => e.x < state.size.cols);
  }
  pruneOutOfBounds(state);
  return true;
}

function isRowRemovable(state, index) {
  if (index < 0 || index >= state.size.rows) return false;
  const row = state.base[index];
  if (!row) return false;
  if (row.some(tile => tile !== 'floor')) return false;
  if (state.entities.some(e => e.y === index)) return false;
  return true;
}

function isColumnRemovable(state, index) {
  if (index < 0 || index >= state.size.cols) return false;
  for (let y = 0; y < state.size.rows; y++) {
    const tile = state.base[y] ? state.base[y][index] : undefined;
    if (tile !== 'floor') return false;
  }
  if (state.entities.some(e => e.x === index)) return false;
  return true;
}

function cloneForResize(state) {
  const cloned = cloneState(state);
  // Ensure entity state references are unique
  cloned.entities = cloned.entities.map(e => ({
    ...e,
    state: cloneEntityState(e.state)
  }));
  return cloned;
}

export function addRow(state, position = 'bottom') {
  const next = cloneForResize(state);
  mutateAddRow(next, position);
  return next;
}

export function removeRow(state, position = 'bottom') {
  const next = cloneForResize(state);
  if (!mutateRemoveRow(next, position)) return null;
  return next;
}

export function addColumn(state, position = 'right') {
  const next = cloneForResize(state);
  mutateAddColumn(next, position);
  return next;
}

export function removeColumn(state, position = 'right') {
  const next = cloneForResize(state);
  if (!mutateRemoveColumn(next, position)) return null;
  return next;
}

export function compactState(state) {
  const next = cloneForResize(state);

  let changedAny = false;
  let changed = true;
  while (changed) {
    changed = false;
    while (next.size.rows > 1 && isRowRemovable(next, 0) && mutateRemoveRow(next, 'top')) { changed = true; changedAny = true; }
    while (next.size.rows > 1 && isRowRemovable(next, next.size.rows - 1) && mutateRemoveRow(next, 'bottom')) { changed = true; changedAny = true; }
    while (next.size.cols > 1 && isColumnRemovable(next, 0) && mutateRemoveColumn(next, 'left')) { changed = true; changedAny = true; }
    while (next.size.cols > 1 && isColumnRemovable(next, next.size.cols - 1) && mutateRemoveColumn(next, 'right')) { changed = true; changedAny = true; }
  }

  if (!changedAny) return null;
  return next;
}

// Entities accessors
export function findPlayer(state) {
  return state.entities.find(e => e.type === EntityTypes.player) || null;
}
export function entitiesAt(state, x, y) {
  return state.entities.filter(e => e.x===x && e.y===y);
}
export function firstEntityAt(state, x, y, predicate) {
  return state.entities.find(e => e.x===x && e.y===y && (!predicate || predicate(e))) || null;
}
export function anyBoxAt(state, x, y) {
  const e = state.entities.find(e => e.x===x && e.y===y && (e.type===EntityTypes.box||e.type===EntityTypes.heavyBox));
  return e ? { type:e.type } : null;
}
export function removeEntityAt(state, x, y, predicate) {
  const idx = state.entities.findIndex(e => e.x===x && e.y===y && (!predicate || predicate(e)));
  if (idx >= 0) state.entities.splice(idx, 1);
}
export function moveEntity(state, entity, toX, toY) {
  entity.x = toX; entity.y = toY;
}

export function serializeState(state) {
  return JSON.stringify(state, null, 2);
}

export function deserializeState(json) {
  let data = typeof json === 'string' ? JSON.parse(json) : json;

  if (!data || !data.base) throw new Error('Invalid level: base missing');
  if (!data.size || !data.size.rows || !data.size.cols) {
    // infer
    data.size = { rows: data.base.length, cols: data.base[0]?.length || 0 };
  }

  // back-compat amb formats antics
  if (!data.entities) {
    const dyn = data.dynamic || {};
    data.entities = [];
    (dyn.boxes || data.boxes || []).forEach(b => data.entities.push({ type:EntityTypes.box, x:b.x, y:b.y }));
    (dyn.heavyBoxes || data.heavyBoxes || []).forEach(h => data.entities.push({ type:EntityTypes.heavyBox, x:h.x, y:h.y }));
    (dyn.fragiles || data.fragiles || []).forEach(f => data.entities.push({ type:EntityTypes.fragileWall, x:f.x, y:f.y }));
    const p = dyn.player || data.player;
    if (p) data.entities.push({ type:EntityTypes.player, x:p.x, y:p.y, state: p });
  }

  // default state per player si cal
  data.entities = data.entities.map(e => {
    if (e.type === EntityTypes.player) {
      const st = e.state && e.state.mode ? e.state : { mode:'free', entryDir:{dx:0,dy:0}, x:e.x, y:e.y };
      return { ...e, state: st };
    }
    return e;
  });

  return data;
}

// Ensure player is not placed on illegal tiles or on occupied cells.
// Mutates the provided state in place. If the current player position is invalid,
// moves the player to the first valid cell found when scanning rows top-to-bottom.
export function ensurePlayerValidPosition(state) {
  const idx = state.entities.findIndex(e => e.type === EntityTypes.player);
  if (idx < 0) return state;
  const p = state.entities[idx];
  const tileAt = (x, y) => (state.base[y][x] || 'floor');
  const isBlocked = (x, y) => {
    const t = tileAt(x, y);
    if (isTrait(t, 'isWallForPlayer') || isTrait(t, 'isHoleForPlayer')) return true;
    // Do not allow starting over any entity (box, heavyBox, fragileWall, or another player)
    const anyHere = state.entities.some(e => e.x === x && e.y === y && e !== p);
    return anyHere;
  };
  if (!isBlocked(p.x, p.y)) return state;
  for (let y = 0; y < state.size.rows; y++) {
    for (let x = 0; x < state.size.cols; x++) {
      if (!isBlocked(x, y)) { p.x = x; p.y = y; return state; }
    }
  }
  return state;
}
