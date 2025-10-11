// core/tiles.js
export const TileRegistry = {
  floor: { name:'floor' },

  wall: { name:'wall', isWallForPlayer:true, isWallForBox:true, isNotFly:true },

  hole: { name:'hole', isHoleForPlayer:true, isHoleForBox:true },

  exit: { name:'exit', isEnd:true },

  spikes: { name:'spikes', isWallForBox:true, isStickOnFly:true }, // jugador enganxa/frena vol

  grile: { name:'grile', isHoleForPlayer:true, isHoleForBox:false },

  pressurePlate: { name:'pressurePlate', requiresBox:true },

  holeSpikes: { name:'holeSpikes', isWallForBox:true, isStickOnFly:true, isHoleForPlayer:true },

  slimPathFloor: { name:'slimPathFloor', isWallForBox:true },

  slimPathHole: { name:'slimPathHole', isWallForBox:true, isHoleForPlayer:true },

  // Fragile wall as a tile: blocks player and boxes like a wall, but is breakable when flying
  fragileWall: { name:'fragileWall', isWallForPlayer:true, isWallForBox:true, isFragile:true }
};

export function getTileTraits(type) {
  return TileRegistry[type] || TileRegistry.floor;
}
export function isTrait(type, key) {
  const t = getTileTraits(type);
  return !!t[key];
}
