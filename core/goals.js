// core/goals.js
import { entitiesAt, anyBoxAt, findPlayer } from './state.js';
import { isTrait } from './tiles.js';

export function computeExitActive(state) {
  const rows = state.size.rows, cols = state.size.cols;
  const plates = [];
  for (let y=0;y<rows;y++)
    for (let x=0;x<cols;x++)
      if (state.base[y][x] === 'pressurePlate') plates.push({x,y});
  if (plates.length === 0) return true;

  let pressed = 0;
  for (const p of plates) if (anyBoxAt(state, p.x, p.y)) pressed++;
  return pressed === plates.length;
}

export function isWinningState(state) {
  const player = findPlayer(state);
  if (!player || player.state?.mode !== 'free') return false;
  const t = state.base[player.y][player.x] || 'floor';
  return !!isTrait(t, 'isEnd') && computeExitActive(state);
}

export function isLosingState(state) {
  const player = findPlayer(state);
  if (!player) return false;
  const t = state.base[player.y][player.x];
  if (player.state.mode === 'free' && isTrait(t,'isHoleForPlayer')) return true;
  if (player.state.mode === 'inbox' && isTrait(t,'isHoleForBox')) return true;

  // també per caiguda de caixes està gestionat en moviment (efecte), però
  // mantenim aquesta funció simple per coherència amb l’antic codi.
  return false;
}
