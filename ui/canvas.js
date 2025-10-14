// ui/canvas.js
import { computeExitActive } from '../core/goals.js';
import { EntityTypes } from '../core/entities.js';

let canvas;
let ctx;
let tileSize = 40;

const colors = {
  floor: '#fafafa',
  wall: '#707070',
  hole: '#060606',
  exitActive: '#3cb371',
  exitInactive: '#bfecc4',
  player: '#4c3ce7',
  box: '#f39c12',
  heavyBox: '#b76b1e',
  fragile: '#666666',
  grid: '#d7d7d7'
};

const tileBaseColors = {
  floor: colors.floor,
  wall: colors.wall,
  hole: colors.hole,
  spikes: '#f2f2f2',
  holeSpikes: colors.hole,
  pressurePlate: '#f5ecda',
  grile: '#0b101d',
  slimPathFloor: '#eef0f8',
  slimPathHole: colors.hole,
  fragileWall: '#86796d'
};

const overlayTiles = new Set([
  'spikes',
  'holeSpikes',
  'grile',
  'pressurePlate',
  'slimPathFloor',
  'slimPathHole',
  'fragileWall'
]);

export function initCanvas(el) {
  canvas = el;
  ctx = canvas.getContext('2d');
}

function drawInboxOverlay(x, y, entryDir) {
  const px = x * tileSize;
  const py = y * tileSize;
  const inset = 4;
  const w = tileSize - inset * 2;
  const h = tileSize - inset * 2;

  ctx.save();
  ctx.fillStyle = colors.player;

  const dx = entryDir?.dx || 0;
  const dy = entryDir?.dy || 0;

  if (dx === 1 && dy === 0) {
    ctx.fillRect(px + inset, py + inset, Math.floor(w / 2), h);
  } else if (dx === -1 && dy === 0) {
    ctx.fillRect(px + inset + Math.floor(w / 2), py + inset, Math.ceil(w / 2), h);
  } else if (dx === 0 && dy === 1) {
    ctx.fillRect(px + inset, py + inset, w, Math.floor(h / 2));
  } else if (dx === 0 && dy === -1) {
    ctx.fillRect(px + inset, py + inset + Math.floor(h / 2), w, Math.ceil(h / 2));
  } else {
    const r = Math.floor(Math.min(w, h) * 0.28);
    ctx.beginPath();
    ctx.arc(px + inset + w / 2, py + inset + h / 2, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  ctx.save();
  ctx.strokeStyle = '#333';
  ctx.strokeRect(px + inset, py + inset, w, h);
  ctx.restore();
}

function drawTileOverlay(type, x, y) {
  const px = x * tileSize;
  const py = y * tileSize;

  ctx.save();
  ctx.translate(px, py);

  if (type === 'spikes' || type === 'holeSpikes') {
    const count = 5;
    const spacing = tileSize / (count + 1);
    const triW = Math.max(4, Math.floor(tileSize * 0.14));
    const triH = Math.max(6, Math.floor(tileSize * 0.18));
    const topY = tileSize * 0.28;
    ctx.fillStyle = 'rgba(40, 44, 66, 0.92)';
    for (let i = 1; i <= count; i++) {
      const cx = spacing * i;
      ctx.beginPath();
      ctx.moveTo(cx, topY);
      ctx.lineTo(cx - triW / 2, topY + triH);
      ctx.lineTo(cx + triW / 2, topY + triH);
      ctx.closePath();
      ctx.fill();
    }
  } else if (type === 'grile') {
    ctx.strokeStyle = 'rgba(235, 240, 255, 0.82)';
    ctx.lineWidth = Math.max(2, Math.floor(tileSize * 0.12));
    ctx.lineCap = 'round';
    const inset = tileSize * 0.22;
    const x1 = inset;
    const x2 = tileSize - inset;
    const y1 = inset;
    const y2 = tileSize - inset;
    ctx.beginPath();
    ctx.moveTo(x1 + (x2 - x1) / 3, y1);
    ctx.lineTo(x1 + (x2 - x1) / 3, y2);
    ctx.moveTo(x1 + (x2 - x1) * 2 / 3, y1);
    ctx.lineTo(x1 + (x2 - x1) * 2 / 3, y2);
    ctx.moveTo(x1, y1 + (y2 - y1) / 3);
    ctx.lineTo(x2, y1 + (y2 - y1) / 3);
    ctx.moveTo(x1, y1 + (y2 - y1) * 2 / 3);
    ctx.lineTo(x2, y1 + (y2 - y1) * 2 / 3);
    ctx.stroke();
  } else if (type === 'pressurePlate') {
    const inset = tileSize * 0.24;
    ctx.strokeStyle = '#ff7a1a';
    ctx.lineWidth = Math.max(3, Math.floor(tileSize * 0.14));
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(inset, inset);
    ctx.lineTo(tileSize - inset, tileSize - inset);
    ctx.moveTo(tileSize - inset, inset);
    ctx.lineTo(inset, tileSize - inset);
    ctx.stroke();

    ctx.beginPath();
    ctx.lineWidth = Math.max(1, Math.floor(tileSize * 0.05));
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.arc(tileSize / 2, tileSize / 2, tileSize * 0.28, 0, Math.PI * 2);
    ctx.stroke();
  } else if (type === 'slimPathFloor' || type === 'slimPathHole') {
    const squareSize = Math.max(3, Math.floor(tileSize * 0.18));
    const offset = Math.max(2, Math.floor(tileSize * 0.1));
    const corners = [
      [offset, offset],
      [tileSize - offset - squareSize, offset],
      [offset, tileSize - offset - squareSize],
      [tileSize - offset - squareSize, tileSize - offset - squareSize]
    ];
    ctx.fillStyle = colors.wall;
    for (const [dx, dy] of corners) {
      ctx.fillRect(dx, dy, squareSize, squareSize);
    }
  } else if (type === 'fragileWall') {
    ctx.strokeStyle = 'rgba(30, 30, 30, 0.9)';
    ctx.lineWidth = Math.max(2, Math.floor(tileSize * 0.08));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const inset = tileSize * 0.18;
    const crack = [
      { x: inset, y: tileSize * 0.35 },
      { x: inset + tileSize * 0.08, y: tileSize * 0.48 },
      { x: inset + tileSize * 0.22, y: tileSize * 0.28 },
      { x: inset + tileSize * 0.38, y: tileSize * 0.54 },
      { x: inset + tileSize * 0.55, y: tileSize * 0.26 },
      { x: inset + tileSize * 0.74, y: tileSize * 0.58 },
      { x: tileSize - inset, y: tileSize * 0.33 }
    ];
    ctx.beginPath();
    ctx.moveTo(crack[0].x, crack[0].y);
    for (let i = 1; i < crack.length; i++) ctx.lineTo(crack[i].x, crack[i].y);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = Math.max(1, Math.floor(tileSize * 0.035));
    ctx.beginPath();
    ctx.moveTo(crack[0].x, crack[0].y - Math.max(1, Math.floor(tileSize * 0.02)));
    for (let i = 1; i < crack.length; i++) {
      const p = crack[i];
      ctx.lineTo(p.x, p.y - Math.max(1, Math.floor(tileSize * 0.02)));
    }
    ctx.stroke();
  }

  ctx.restore();
}

export function draw(state) {
  if (!canvas) return;

  const rows = state.size.rows;
  const cols = state.size.cols;
  // Adjust canvas to grid aspect: width from CSS, height derived from rows/cols
  const targetW = Math.max(1, Math.floor(canvas.clientWidth || canvas.width || 1));
  canvas.width = targetW;
  tileSize = Math.max(1, Math.floor(canvas.width / Math.max(1, cols)));
  canvas.height = tileSize * Math.max(1, rows);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const exitActive = computeExitActive(state);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const t = state.base[y][x] || 'floor';

      let bg = colors.floor;
      if (t === 'exit') {
        bg = exitActive ? colors.exitActive : colors.exitInactive;
      } else if (Object.prototype.hasOwnProperty.call(tileBaseColors, t)) {
        bg = tileBaseColors[t];
      } else if (t === 'hole') {
        bg = colors.hole;
      } else if (t === 'wall') {
        bg = colors.wall;
      }

      ctx.fillStyle = bg;
      ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
      ctx.strokeStyle = colors.grid;
      ctx.strokeRect(x * tileSize, y * tileSize, tileSize, tileSize);

      if (overlayTiles.has(t)) drawTileOverlay(t, x, y);
    }
  }

  const player = state.entities.find(e => e.type === EntityTypes.player);

  for (const entity of state.entities) {
    if (entity.type === EntityTypes.player) continue;
    const color = entity.type === EntityTypes.box
      ? colors.box
      : (entity.type === EntityTypes.heavyBox ? colors.heavyBox : colors.fragile);
    const ex = entity.x * tileSize + 4;
    const ey = entity.y * tileSize + 4;
    const ew = tileSize - 8;
    const eh = tileSize - 8;
    ctx.fillStyle = color;
    ctx.fillRect(ex, ey, ew, eh);

    // Fragile wall entity: draw crack overlay to differentiate from normal walls
    if (entity.type === EntityTypes.fragileWall) {
      ctx.save();
      ctx.translate(entity.x * tileSize, entity.y * tileSize);
      ctx.strokeStyle = 'rgba(30, 30, 30, 0.9)';
      ctx.lineWidth = Math.max(2, Math.floor(tileSize * 0.08));
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const inset = tileSize * 0.18;
      const crack = [
        { x: inset, y: tileSize * 0.35 },
        { x: inset + tileSize * 0.08, y: tileSize * 0.48 },
        { x: inset + tileSize * 0.22, y: tileSize * 0.28 },
        { x: inset + tileSize * 0.38, y: tileSize * 0.54 },
        { x: inset + tileSize * 0.55, y: tileSize * 0.26 },
        { x: inset + tileSize * 0.74, y: tileSize * 0.58 },
        { x: tileSize - inset, y: tileSize * 0.33 }
      ];
      ctx.beginPath();
      ctx.moveTo(crack[0].x, crack[0].y);
      for (let i = 1; i < crack.length; i++) ctx.lineTo(crack[i].x, crack[i].y);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = Math.max(1, Math.floor(tileSize * 0.035));
      ctx.beginPath();
      ctx.moveTo(crack[0].x, crack[0].y - Math.max(1, Math.floor(tileSize * 0.02)));
      for (let i = 1; i < crack.length; i++) {
        const p = crack[i];
        ctx.lineTo(p.x, p.y - Math.max(1, Math.floor(tileSize * 0.02)));
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  if (!player) return;

  if (player.state?.mode === 'inbox') {
    drawInboxOverlay(player.x, player.y, player.state.entryDir);
  } else {
    ctx.fillStyle = colors.player;
    const cx = player.x * tileSize + tileSize / 2;
    const cy = player.y * tileSize + tileSize / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, tileSize * 0.32, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function animate(effects) {
  // Placeholder for future animations
}
