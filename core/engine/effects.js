// core/engine/effects.js
// Centralized effect builders to keep shapes consistent across modules

export function effectEntityMoved(entity, from, to) {
  return { type: 'entityMoved', entityType: entity.type, from, to };
}

export function effectTileChanged(pos, from, to) {
  return { type: 'tileChanged', pos, from, to };
}

export function effectBoxFell(pos) {
  return { type: 'boxFell', pos };
}

