// core/entities.js
// Entitats: player, box, heavyBox, fragileWall (com entitat amb underTile configurable)
export const EntityTypes = {
  player: 'player',
  box: 'box',
  heavyBox: 'heavyBox',
  fragileWall: 'fragileWall',
  triBox: 'triBox'
};

export const EntityRegistry = {
  [EntityTypes.player]: {
    drawColor: '#4c3ce7',
    initState() { return { mode:'free', entryDir:{dx:0,dy:0} }; }
  },
  [EntityTypes.box]: {
    drawColor: '#f39c12',
    solid: true,
    pushable: true
  },
  [EntityTypes.heavyBox]: {
    drawColor: '#b76b1e',
    solid: true,
    pushable: true,
    heavy: true // activa la lògica especial al motor
  },
  [EntityTypes.triBox]: {
    drawColor: '#00a7a7',
    solid: true,
    pushable: true,
    triangular: true // triangle-shaped mechanics (orientation in entity.state.orient)
  },
  [EntityTypes.fragileWall]: {
    drawColor: '#777777',
    solid: true,
    fragile: true,
    underTile: 'floor' // es pot canviar per nivell
  }
};

// Helpers
export function isPushable(ent) { return !!EntityRegistry[ent.type]?.pushable; }
export function isSolid(ent)    { return !!EntityRegistry[ent.type]?.solid; }
export function isHeavy(ent)    { return !!EntityRegistry[ent.type]?.heavy; }
export function isFragile(ent)  { return !!EntityRegistry[ent.type]?.fragile; }
