// solver/zobrist.js
let table = null;

function rndBig() {
  const n = Math.floor(Math.random()*2**30);
  const m = Math.floor(Math.random()*2**23);
  return (BigInt(n)<<23n) ^ BigInt(m);
}

export function initZobrist(rows, cols, entityTypes = []) {
  table = {
    salt: rndBig(),
    rows, cols,
    tiles: Array.from({length:rows}, ()=> Array.from({length:cols}, ()=> rndBig())),
    entities: {}
  };
  for (const t of entityTypes) table.entities[t] = Array.from({length:rows}, ()=> Array.from({length:cols}, ()=> rndBig()));
  table.playerModes = {
    free: Array.from({length:rows}, ()=> Array.from({length:cols}, ()=> rndBig())),
    inbox: {
      r: Array.from({length:rows}, ()=> Array.from({length:cols}, ()=> rndBig())),
      l: Array.from({length:rows}, ()=> Array.from({length:cols}, ()=> rndBig())),
      u: Array.from({length:rows}, ()=> Array.from({length:cols}, ()=> rndBig())),
      d: Array.from({length:rows}, ()=> Array.from({length:cols}, ()=> rndBig())),
      z: Array.from({length:rows}, ()=> Array.from({length:cols}, ()=> rndBig())) // neutral (0,0)
    }
  };
  table.triOrient = {
    NE: Array.from({length:rows}, ()=> Array.from({length:cols}, ()=> rndBig())),
    NW: Array.from({length:rows}, ()=> Array.from({length:cols}, ()=> rndBig())),
    SE: Array.from({length:rows}, ()=> Array.from({length:cols}, ()=> rndBig())),
    SW: Array.from({length:rows}, ()=> Array.from({length:cols}, ()=> rndBig()))
  };
}

function dirKey(d) {
  if (!d || (d.dx===0 && d.dy===0)) return 'z';
  if (d.dx===1) return 'r';
  if (d.dx===-1) return 'l';
  if (d.dy===-1) return 'u';
  if (d.dy===1) return 'd';
  return 'z';
}

export function hashState(state) {
  if (!table || table.rows!==state.size.rows || table.cols!==state.size.cols) {
    initZobrist(state.size.rows, state.size.cols, ['box','heavyBox','triBox','fragileWall']);
  }
  let h = 0n ^ table.salt;

  // tiles (només indexem posicions, no tipus concret per simplicitat i velocitat)
  for (let y=0;y<state.size.rows;y++)
    for (let x=0;x<state.size.cols;x++)
      h ^= table.tiles[y][x]; // si vols incloure tipus concret, cal una taula per tipus

  // entities
  for (const e of state.entities) {
    const tab = table.entities[e.type];
    if (tab) h ^= tab[e.y][e.x];
    if (e.type==='player') {
      if (e.state?.mode==='free') h ^= table.playerModes.free[e.y][e.x];
      else {
        const key = dirKey(e.state.entryDir);
        h ^= table.playerModes.inbox[key][e.y][e.x];
      }
    } else if (e.type==='triBox') {
      const ori = (e.state && e.state.orient) || 'SE';
      const salt = table.triOrient[ori] || table.triOrient.SE;
      h ^= salt[e.y][e.x];
    }
  }
  return h.toString();
}
