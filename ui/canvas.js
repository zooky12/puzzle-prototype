// ui/canvas.js
import { computeExitActive } from '../core/goals.js';
import { EntityTypes } from '../core/entities.js';

let canvas, ctx, tileSize = 40;

const colors = {
  floor:'#fafafa',
  wall:'#777',
  hole:'#000',
  exitActive:'#3cb371',
  exitInactive:'#bfecc4',
  player:'#4c3ce7',
  box:'#f39c12',
  heavyBox:'#b76b1e',
  fragile:'#666',
  grid:'#ddd'
};

export function initCanvas(el) {
  canvas = el;
  ctx = canvas.getContext('2d');
}

function drawInboxOverlay(x, y, entryDir) {
  // Dibuixa una falca/semirectangle dins la caixa per indicar el costat on està el player.
  const px = x * tileSize, py = y * tileSize;
  const inset = 4;                      // marge intern de la caixa
  const w = tileSize - inset * 2;
  const h = tileSize - inset * 2;
  ctx.save();
  ctx.fillStyle = colors.player;

  const dx = entryDir?.dx || 0;
  const dy = entryDir?.dy || 0;

  if (dx === 1 && dy === 0) {
    // va entrar des de l'esquerra → falca a L'ESQUERRA (segueix el teu codi original)
    ctx.fillRect(px + inset, py + inset, Math.floor(w/2), h);
  } else if (dx === -1 && dy === 0) {
    // va entrar des de la dreta → falca a LA DRETA
    ctx.fillRect(px + inset + Math.floor(w/2), py + inset, Math.ceil(w/2), h);
  } else if (dx === 0 && dy === 1) {
    // va entrar des de dalt → falca A DALT
    ctx.fillRect(px + inset, py + inset, w, Math.floor(h/2));
  } else if (dx === 0 && dy === -1) {
    // va entrar des de baix → falca A BAIX
    ctx.fillRect(px + inset, py + inset + Math.floor(h/2), w, Math.ceil(h/2));
  } else {
    // entryDir neutral (0,0): dibuix discret central
    const r = Math.floor(Math.min(w,h) * 0.28);
    ctx.beginPath();
    ctx.arc(px + inset + w/2, py + inset + h/2, r, 0, Math.PI*2);
    ctx.fill();
  }

  ctx.restore();

  // contorn suau de la caixa per definir millor el límit
  ctx.save();
  ctx.strokeStyle = '#333';
  ctx.strokeRect(px + inset, py + inset, w, h);
  ctx.restore();
}

export function draw(state) {
  if (!canvas) return;
  const rows = state.size.rows, cols = state.size.cols;
  tileSize = Math.floor(canvas.width / cols);

  ctx.clearRect(0,0,canvas.width,canvas.height);
  const exitActive = computeExitActive(state);

  // TILES
  for (let y=0;y<rows;y++) for (let x=0;x<cols;x++) {
    const t = state.base[y][x] || 'floor';
    let bg = colors.floor;
    if (t==='wall') bg = colors.wall;
    else if (t==='hole') bg = colors.hole;
    else if (t==='exit') bg = exitActive ? colors.exitActive : colors.exitInactive;
    else if (t==='grile') bg = colors.hole;
    else if (t==='holeSpikes'||t==='slimPathHole') bg = colors.hole;

    ctx.fillStyle = bg;
    ctx.fillRect(x*tileSize, y*tileSize, tileSize, tileSize);
    ctx.strokeStyle = colors.grid;
    ctx.strokeRect(x*tileSize, y*tileSize, tileSize, tileSize);
  }

  // ENTITATS: primer totes menys player
  const player = state.entities.find(e=>e.type===EntityTypes.player);
  for (const e of state.entities) {
    if (e.type === EntityTypes.player) continue;
    const color = e.type==='box' ? colors.box : (e.type==='heavyBox' ? colors.heavyBox : colors.fragile);
    ctx.fillStyle = color;
    ctx.fillRect(e.x*tileSize+4, e.y*tileSize+4, tileSize-8, tileSize-8);
  }

  if (!player) return;

  // Player: si està "inbox", fem overlay dins de la caixa on està
  if (player.state?.mode === 'inbox') {
    // Ens assegurem que la caixa sota el player ja s'ha pintat a la passada anterior (sí)
    drawInboxOverlay(player.x, player.y, player.state.entryDir);
  } else {
    // Mode lliure: cercle
    ctx.fillStyle = colors.player;
    const cx = player.x*tileSize + tileSize/2;
    const cy = player.y*tileSize + tileSize/2;
    ctx.beginPath(); ctx.arc(cx, cy, tileSize*0.32, 0, Math.PI*2); ctx.fill();
  }
}

export function animate(effects) {
  // Placeholder per animacions futures (caiguda, etc.)
}
