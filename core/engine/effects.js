// core/engine/effects.js
// Centralized effect builders to keep shapes consistent across modules

export function effectEntityMoved(entity, from, to) {
  const orient = entity && entity.state && entity.state.orient ? entity.state.orient : undefined;
  return { type: 'entityMoved', entityType: entity.type, from, to, orient };
}

export function effectTileChanged(pos, from, to) {
  return { type: 'tileChanged', pos, from, to };
}

export function effectBoxFell(pos, info = {}) {
  // info can include: { boxType, orient, playerInside }
  return { type: 'boxFell', pos, ...info };
}

// Heavy box: entering/exiting neutral state visual cue
export function effectHeavyNeutral(pos, neutral) {
  return { type: 'heavyNeutral', pos, neutral: !!neutral };
}

// Player enters any box (box | heavyBox | triBox)
export function effectPlayerEnteredBox(boxType, pos, entryDir) {
  return { type: 'playerEnteredBox', boxType, pos, entryDir };
}

// Player exits a box (typically via launch/flight)
export function effectPlayerExitedBox(boxType, pos, exitDir) {
  return { type: 'playerExitedBox', boxType, pos, exitDir };
}

// Player launch/glide across potentially multiple tiles
export function effectPlayerLaunched(from, to, dir, distance) {
  return { type: 'playerLaunched', from, to, dir, distance };
}

// Visual bump feedback for blocked movement
export function effectBump(pos, dir) {
  return { type: 'bump', pos, dir };
}
