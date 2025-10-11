// core/state.js
import { EntityRegistry, EntityTypes } from './entities.js';

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
