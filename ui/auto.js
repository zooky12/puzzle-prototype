// ui/auto.js
import { cloneState } from '../core/state.js';
import { EntityTypes } from '../core/entities.js';

export function setupAutoUI({ getState, setState, runSolver, onPlaySolution }) {
  const runBtn = document.getElementById('runAuto');
  const stopBtn = document.getElementById('stopAuto');
  const progressEl = document.getElementById('autoProgress');
  const listEl = document.getElementById('autoList');

  if (!runBtn || !stopBtn || !progressEl || !listEl) return;

  let cancel = false;

  stopBtn.addEventListener('click', () => {
    cancel = true;
    progressEl.textContent = 'Cancel requested...';
    stopBtn.disabled = true;
  });

  runBtn.addEventListener('click', async () => {
    cancel = false;
    runBtn.disabled = true;
    stopBtn.disabled = false;
    listEl.innerHTML = '';

    const params = readParams();
    const best = [];

    for (let i = 0; i < params.attempts && !cancel; i++) {
      progressEl.textContent = `Attempt ${i + 1}/${params.attempts}`;
      await tick();

      const base = getState();
      let candidate = cloneState(base);

      ensurePlayer(candidate);

      const ok = mutateTiles(candidate, params.maxTilesChanged, params.onlyFloor, params.allowedTiles);
      if (!ok) continue;

      const result = await runSolver(candidate, {
        maxDepth: params.maxDepth,
        maxNodes: params.maxNodes,
        maxSolutions: Math.max(params.maxSolutions, 1),
        onProgress: () => {}
      });

      const solutions = Array.isArray(result?.solutions) ? result.solutions : [];
      const deadEnds = Array.isArray(result?.deadEnds) ? result.deadEnds : [];
      if (solutions.length < 1) continue;

      const fastest = Math.min(...solutions.map(s => s.length));
      if (solutions.length > params.maxSolutions) continue;
      if (fastest < params.minFastestSteps) continue;
      if (deadEnds.length < params.minDeadEnds) continue;

      const score = [solutions.length, -deadEnds.length, -fastest];
      best.push({ state: cloneState(candidate), solutions, deadEnds, fastest, score });
      best.sort((a, b) => a.score[0] - b.score[0] || a.score[1] - b.score[1] || a.score[2] - b.score[2]);
      if (best.length > 20) best.length = 20;
      renderList(best, listEl, onPlaySolution, setState);
    }

    progressEl.textContent = cancel ? 'Canceled' : `Done. candidates: ${best.length}`;
    runBtn.disabled = false;
    stopBtn.disabled = true;
  });
}

function readParams() {
  const getNum = (id, def, min) => {
    const el = document.getElementById(id);
    const v = Number(el?.value);
    if (!Number.isFinite(v)) return def;
    return Math.max(min ?? -Infinity, v);
  };
  const getBool = (id) => !!document.getElementById(id)?.checked;
  const getAllowedTiles = () => {
    const wrap = document.getElementById('autoTilesAllowed');
    if (!wrap) return null;
    const selected = Array.from(wrap.querySelectorAll('input[type="checkbox"]')).filter(cb => cb.checked).map(cb => cb.value);
    return selected.length ? selected : null;
  };

  return {
    maxSolutions: getNum('autoMaxSolutions', 2, 1),
    minFastestSteps: getNum('autoMinFastest', 12, 1),
    minDeadEnds: getNum('autoMinDeadEnds', 10, 0),
    maxTilesChanged: getNum('autoMaxChanges', 3, 1),
    attempts: getNum('autoAttempts', 50, 1),
    onlyFloor: getBool('autoOnlyFloor'),
    allowedTiles: getAllowedTiles(),
    maxDepth: getNum('solverMaxDepth', 100, 1),
    maxNodes: getNum('solverMaxNodes', 200000, 100)
  };
}

function renderList(list, listEl, onPlaySolution, setState) {
  listEl.innerHTML = '';
  list.forEach((c, idx) => {
    const row = document.createElement('div');
    row.className = 'solutionItem';

    const text = document.createElement('div');
    text.className = 'solutionText';
    text.innerHTML = `#${idx + 1} sols:${c.solutions.length} dead:${c.deadEnds.length} fastest:${c.fastest}`;
    row.appendChild(text);

    const actions = document.createElement('div');
    actions.className = 'solutionActions';

    const play = document.createElement('button');
    play.textContent = 'Play';
    play.addEventListener('click', () => {
      if (!onPlaySolution) return;
      const moves = (c.solutions[0] || {}).moves || '';
      onPlaySolution({ state: cloneState(c.state), moves });
    });
    actions.appendChild(play);

    const useBtn = document.createElement('button');
    useBtn.textContent = 'Use';
    useBtn.addEventListener('click', () => { setState(c.state); });
    actions.appendChild(useBtn);

    row.appendChild(actions);
    listEl.appendChild(row);
  });
}

function ensurePlayer(state) {
  const hasPlayer = state.entities.some(e => e.type === EntityTypes.player);
  if (hasPlayer) return;
  const floorTiles = [];
  for (let y = 0; y < state.size.rows; y++) {
    for (let x = 0; x < state.size.cols; x++) {
      if ((state.base[y][x] || 'floor') === 'floor') floorTiles.push({ x, y });
    }
  }
  if (floorTiles.length === 0) return;
  const spot = floorTiles[Math.floor(Math.random() * floorTiles.length)];
  state.entities = state.entities.filter(e => e.type !== EntityTypes.player);
  state.entities.push({ type: EntityTypes.player, x: spot.x, y: spot.y, state: { mode: 'free', entryDir: { dx: 0, dy: 0 } } });
}

const ALL_TILES = ['floor','wall','hole','exit','pressurePlate','grile','spikes','holeSpikes','slimPathFloor','slimPathHole','fragileWall'];

function mutateTiles(state, maxChanges, onlyFloor, allowedTiles) {
  const allowed = allowedTiles && allowedTiles.length ? allowedTiles : ALL_TILES;
  const coords = [];
  for (let y = 0; y < state.size.rows; y++) for (let x = 0; x < state.size.cols; x++) coords.push({ x, y });
  shuffle(coords);
  let changes = 0;
  for (const { x, y } of coords) {
    if (changes >= maxChanges) break;
    const cur = state.base[y][x] || 'floor';
    if (onlyFloor && cur !== 'floor') continue;
    const pick = randomOther(allowed, cur);
    if (!pick) continue;
    state.base[y][x] = pick;
    changes++;
  }
  return changes > 0;
}

function randomOther(list, current) {
  const choices = list.filter(t => t !== current);
  if (!choices.length) return null;
  return choices[Math.floor(Math.random() * choices.length)];
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function tick() { return new Promise(r => setTimeout(r, 0)); }
