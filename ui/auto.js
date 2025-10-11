// ui/auto.js
import { cloneState, removeRow, removeColumn } from '../core/state.js';
import { EntityTypes, isSolid } from '../core/entities.js';
import { isTrait, getTileTraits } from '../core/tiles.js';

export function setupAutoUI({ getState, setState, runSolver, onPlaySolution }) {
  const runBtn = document.getElementById('runAuto');
  const stopBtn = document.getElementById('stopAuto');
  const restoreBtn = document.getElementById('autoRestore');
  const progressEl = document.getElementById('autoProgress');
  const listEl = document.getElementById('autoList');
  const panelEl = document.getElementById('autoPanel');
  const toggleBtn = document.getElementById('toggleAuto');

  if (!runBtn || !stopBtn || !progressEl || !listEl || !panelEl || !toggleBtn) return;

  let cancel = false;

  toggleBtn.addEventListener('click', () => {
    const expanded = toggleBtn.getAttribute('aria-pressed') === 'true';
    const next = !expanded;
    toggleBtn.setAttribute('aria-pressed', next ? 'true' : 'false');
    toggleBtn.classList.toggle('active', next);
    toggleBtn.textContent = next ? 'Hide Auto Creator' : 'Show Auto Creator';
    panelEl.classList.toggle('hidden', !next);
    panelEl.setAttribute('aria-hidden', next ? 'false' : 'true');
  });

  document.querySelectorAll('.tile-toggle[data-target]').forEach(btn => {
    const target = document.getElementById(btn.dataset.target);
    if (!target) return;
    btn.addEventListener('click', () => {
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      const next = !expanded;
      btn.setAttribute('aria-expanded', next ? 'true' : 'false');
      btn.classList.toggle('active', next);
      target.classList.toggle('hidden', !next);
      target.setAttribute('aria-hidden', next ? 'false' : 'true');
    });
  });

  // Only attach chip toggles inside Auto Creator panels to avoid interfering with Build controls
  document.querySelectorAll('.auto-card .tile-filter-panel').forEach(panel => {
    panel.addEventListener('click', (event) => {
      const chip = event.target.closest('.tile-chip');
      if (!chip) return;
      const isActive = chip.classList.toggle('active');
      chip.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  });

  stopBtn.addEventListener('click', () => {
    cancel = true;
    progressEl.textContent = 'Cancel requested...';
    stopBtn.disabled = true;
  });

  let originalBase = null;

  if (restoreBtn) {
    restoreBtn.addEventListener('click', () => {
      if (!originalBase) return;
      setState(cloneState(originalBase));
      progressEl.textContent = 'Restored original base.';
    });
  }

  runBtn.addEventListener('click', async () => {
    if (panelEl.classList.contains('hidden')) {
      toggleBtn.click();
    }
    cancel = false;
    runBtn.disabled = true;
    stopBtn.disabled = false;
    if (restoreBtn) restoreBtn.disabled = false;
    listEl.innerHTML = '';

    const params = readParams();
    // capture the base level used to generate from
    originalBase = cloneState(getState());
    const best = [];
    const seen = new Set();
    let duplicateStreak = 0;
    const maxDuplicateStreak = Math.max(100, params.attempts * 2);
    let attemptsDone = 0; // counts only unique + valid tile mutation
    let tries = 0;        // total generation tries (including skipped)
    const hardCap = Math.max(1000, params.attempts * 50);

    while (attemptsDone < params.attempts && !cancel) {
      tries++;
      if (tries > hardCap) {
        progressEl.textContent = 'Search limit reached (too many invalid/duplicate tries)';
        break;
      }
      progressEl.textContent = `Attempt ${attemptsDone + 1}/${params.attempts}`;
      await tick();

      // Always start from the original snapshot taken at Generate start
      let candidate = cloneState(originalBase);

      ensurePlayer(candidate);

      const okTiles = mutateTiles(candidate, params.maxTilesChanged, params.tilesChange, params.tilesPlace);
      const okEnts  = mutateEntities(candidate, {
        movePlayer: !!params.movePlayer,
        placeBoxes: !!params.placeBoxes,
        removeBoxes: !!params.removeBoxes,
      });
      if (!(okTiles || okEnts)) continue; // neither tiles nor entities changed -> does not count as attempt

      // Deduplicate candidates by a stable key
      const key = stateKey(candidate);
      if (seen.has(key)) {
        duplicateStreak++;
        if (duplicateStreak >= maxDuplicateStreak) {
          progressEl.textContent = 'Exhausted unique candidates (no new uniques found)';
          break;
        }
        continue; // duplicate -> does not count as attempt
      }
      seen.add(key);
      duplicateStreak = 0;
      attemptsDone++; // count only when we have a unique, valid candidate

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

      // Note: Do not simplify candidates automatically here; user can run Simplify from Build Tools

      // Order candidates by requested preference
      let score;
      switch (params.order) {
        case 'mostDeadEnds':
          score = [-deadEnds.length, solutions.length, -fastest];
          break;
        case 'mostSteps':
          score = [-fastest, solutions.length, -deadEnds.length];
          break;
        case 'leastSolutions':
        default:
          score = [solutions.length, -deadEnds.length, -fastest];
          break;
      }
      best.push({ state: cloneState(candidate), solutions, deadEnds, fastest, score });
      best.sort((a, b) => a.score[0] - b.score[0] || a.score[1] - b.score[1] || a.score[2] - b.score[2]);
      if (best.length > 20) best.length = 20;
      renderList(best, listEl, onPlaySolution, setState);
    }

    const doneMsg = cancel
      ? 'Canceled'
      : (duplicateStreak >= maxDuplicateStreak
          ? `Done. candidates: ${best.length} (unique space exhausted)`
          : `Done. candidates: ${best.length}`);
    progressEl.textContent = doneMsg;
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
  const getSelectedValues = (panelId) => {
    const panel = document.getElementById(panelId);
    if (!panel) return null;
    const selected = Array.from(panel.querySelectorAll('.tile-chip.active[data-value]'))
      .map(btn => btn.dataset.value);
    return selected.length ? selected : null;
  };
  const isOptionSelected = (panelId, optionName) => {
    const panel = document.getElementById(panelId);
    if (!panel) return false;
    return !!panel.querySelector(`.tile-chip.active[data-option="${optionName}"]`);
  };
  const getToggle = (id) => {
    const el = document.getElementById(id);
    if (!el) return false;
    return el.classList.contains('active') || el.getAttribute('aria-pressed') === 'true';
  };

  return {
    maxSolutions: getNum('autoMaxSolutions', 2, 1),
    minFastestSteps: getNum('autoMinFastest', 12, 1),
    minDeadEnds: getNum('autoMinDeadEnds', 10, 0),
    maxTilesChanged: getNum('autoMaxChanges', 3, 1),
    attempts: getNum('autoAttempts', 50, 1),
    tilesChange: getSelectedValues('autoTilesChange'),
    tilesPlace: getSelectedValues('autoTilesPlace'),
    maxDepth: getNum('solverMaxDepth', 100, 1),
    maxNodes: getNum('solverMaxNodes', 200000, 100)
    , movePlayer: getToggle('autoMovePlayer')
    , placeBoxes: isOptionSelected('autoTilesPlace', 'placeBoxes')
    , removeBoxes: isOptionSelected('autoTilesChange', 'removeBoxes')
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
    useBtn.addEventListener('click', () => { setState(cloneState(c.state)); });
    actions.appendChild(useBtn);

    row.appendChild(actions);
    listEl.appendChild(row);
  });
}

function ensurePlayer(state) {
  const hasPlayer = state.entities.some(e => e.type === EntityTypes.player);
  if (hasPlayer) return;
  const canStand = (x, y) => {
    const t = (state.base[y][x] || 'floor');
    if (isTrait(t, 'isWallForPlayer') || isTrait(t, 'isHoleForPlayer')) return false;
    const anyHere = state.entities?.some(e => e.x === x && e.y === y);
    return !anyHere;
  };
  const options = [];
  for (let y = 0; y < state.size.rows; y++) {
    for (let x = 0; x < state.size.cols; x++) {
      if (canStand(x, y)) options.push({ x, y });
    }
  }
  if (!options.length) return;
  const spot = options[Math.floor(Math.random() * options.length)];
  state.entities = state.entities.filter(e => e.type !== EntityTypes.player);
  state.entities.push({ type: EntityTypes.player, x: spot.x, y: spot.y, state: { mode: 'free', entryDir: { dx: 0, dy: 0 } } });
}

const ALL_TILES = ['floor','wall','hole','exit','pressurePlate','grile','spikes','holeSpikes','slimPathFloor','slimPathHole','fragileWall'];

function mutateTiles(state, maxChanges, sourceAllowed, targetAllowed) {
  const sourceSet = new Set(sourceAllowed && sourceAllowed.length ? sourceAllowed : ALL_TILES);
  const targets = targetAllowed && targetAllowed.length ? targetAllowed : ALL_TILES;

  // Build eligible coordinates once (avoid full shuffle)
  const eligible = [];
  for (let y = 0; y < state.size.rows; y++) {
    for (let x = 0; x < state.size.cols; x++) {
      const cur = state.base[y][x] || 'floor';
      if (sourceSet.has(cur)) eligible.push({ x, y, cur });
    }
  }
  if (!eligible.length) return false;

  let changes = 0;
  const tried = new Set();
  const maxTries = Math.min(eligible.length * 2, Math.max(eligible.length, maxChanges * 12));

  function tryIndex(idx) {
    if (idx < 0 || idx >= eligible.length) return false;
    const key = idx;
    if (tried.has(key)) return false;
    tried.add(key);
    const { x, y, cur } = eligible[idx];
    // If there is a box/heavyBox at this cell, only choose tiles that support boxes
    const boxAt = state.entities?.some(e => (e.type === EntityTypes.box || e.type === EntityTypes.heavyBox) && e.x === x && e.y === y);
    const candidateTargets = targets.filter(t => t !== cur && (!boxAt || allowsBoxTile(t)));
    if (!candidateTargets.length) return false;
    let pick = candidateTargets[Math.floor(Math.random() * candidateTargets.length)];
    if (!pick) return false; // safety

    // Special case: selecting fragileWall means place an ENTITY overlay, not a base tile
    if (pick === 'fragileWall') {
      if (cur === 'wall') return false; // don't place on walls
      const solidHere = state.entities?.some(e => isSolid(e) && e.x === x && e.y === y);
      if (solidHere) return false;
      state.entities.push({ type: EntityTypes.fragileWall, x, y, underTile: cur });
      return true;
    }

    state.base[y][x] = pick;
    return true;
  }

  for (let t = 0; t < maxTries && changes < maxChanges; t++) {
    const idx = Math.floor(Math.random() * eligible.length);
    if (tryIndex(idx)) changes++;
  }

  return changes > 0;
}

// Randomly move player and place/move boxes/heavyBoxes (one lightweight op per attempt)
function mutateEntities(state, opts = {}) {
  let changed = false;

  // Helpers
  const tileAt = (x, y) => (state.base[y][x] || 'floor');
  const solidAt = (x, y) => state.entities?.some(e => isSolid(e) && e.x === x && e.y === y);

  // 1) Maybe move player
  const playerIdx = state.entities.findIndex(e => e.type === EntityTypes.player);
  if (opts.movePlayer && playerIdx >= 0 && Math.random() < 0.5) {
    const p = state.entities[playerIdx];
    const options = [];
    for (let y = 0; y < state.size.rows; y++) {
      for (let x = 0; x < state.size.cols; x++) {
        const t = tileAt(x, y);
        if (isTrait(t, 'isWallForPlayer')) continue;
        if (isTrait(t, 'isHoleForPlayer')) continue;
        if (solidAt(x, y) && !(x === p.x && y === p.y)) continue;
        options.push({ x, y });
      }
    }
    if (options.length) {
      const spot = options[Math.floor(Math.random() * options.length)];
      if (spot.x !== p.x || spot.y !== p.y) {
        p.x = spot.x; p.y = spot.y;
        p.state = { mode: 'free', entryDir: { dx: 0, dy: 0 } };
        changed = true;
      }
    }
  }

  // 2) Box operation: add or move one box/heavyBox
  if (opts.placeBoxes || opts.removeBoxes) {
    // decide which op to do this attempt
    const ops = [];
    if (opts.placeBoxes) ops.push('add');
    if (opts.removeBoxes) ops.push('remove');
    const pickOp = ops.length ? ops[Math.floor(Math.random() * ops.length)] : null;
    const boxCells = [];
    for (let y = 0; y < state.size.rows; y++) {
      for (let x = 0; x < state.size.cols; x++) {
        const t = tileAt(x, y);
        if (!allowsBoxTile(t)) continue;
        if (solidAt(x, y)) continue;
        boxCells.push({ x, y });
      }
    }

    if (pickOp === 'add') {
      if (boxCells.length) {
        const { x, y } = boxCells[Math.floor(Math.random() * boxCells.length)];
        const type = Math.random() < 0.5 ? EntityTypes.box : EntityTypes.heavyBox;
        state.entities.push({ type, x, y });
        changed = true;
      }
    } else if (pickOp === 'remove') {
      const indices = state.entities
        .map((e, i) => ({ e, i }))
        .filter(it => it.e.type === EntityTypes.box || it.e.type === EntityTypes.heavyBox)
        .map(it => it.i);
      if (indices.length) {
        const idx = indices[Math.floor(Math.random() * indices.length)];
        state.entities.splice(idx, 1);
        changed = true;
      }
    }
  }

  return changed;
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

// A tile supports boxes if it is not a wall-for-box nor a hole-for-box
function allowsBoxTile(tileType) {
  return !isTrait(tileType, 'isWallForBox') && !isTrait(tileType, 'isHoleForBox');
}

// Build a stable, compact key for a candidate state to detect duplicates
// Zobrist-like fast hash for dedupe (includes tiles and entities, player mode/dir)
let zCache = null;
function rndBig() {
  const n = Math.floor(Math.random() * 2**30);
  const m = Math.floor(Math.random() * 2**23);
  return (BigInt(n) << 23n) ^ BigInt(m);
}
function ensureZ(rows, cols) {
  if (zCache && zCache.rows === rows && zCache.cols === cols) return;
  const tileTypes = Array.from(new Set(ALL_TILES.concat(['floor'])));
  const makeGrid = () => Array.from({ length: rows }, () => Array.from({ length: cols }, () => rndBig()));
  const tiles = {};
  for (const t of tileTypes) tiles[t] = makeGrid();
  const entities = {
    box: makeGrid(),
    heavyBox: makeGrid(),
    fragileWall: makeGrid(),
    player_free: makeGrid(),
    player_inbox_r: makeGrid(),
    player_inbox_l: makeGrid(),
    player_inbox_u: makeGrid(),
    player_inbox_d: makeGrid(),
    player_inbox_z: makeGrid()
  };
  zCache = { rows, cols, salt: rndBig(), tiles, entities };
}
function dirKey(d) {
  if (!d || (d.dx === 0 && d.dy === 0)) return 'z';
  if (d.dx === 1) return 'r';
  if (d.dx === -1) return 'l';
  if (d.dy === -1) return 'u';
  if (d.dy === 1) return 'd';
  return 'z';
}
function stateKey(s) {
  ensureZ(s.size.rows, s.size.cols);
  let h = 0n ^ zCache.salt;
  // tiles
  for (let y = 0; y < s.size.rows; y++) {
    for (let x = 0; x < s.size.cols; x++) {
      const tt = s.base[y][x] || 'floor';
      const grid = zCache.tiles[tt];
      if (grid) h ^= grid[y][x];
    }
  }
  // entities
  for (const e of (s.entities || [])) {
    if (e.type === EntityTypes.player) {
      if (e.state?.mode === 'free') h ^= zCache.entities.player_free[e.y][e.x];
      else {
        const k = dirKey(e.state?.entryDir);
        h ^= zCache.entities['player_inbox_' + k][e.y][e.x];
      }
    } else {
      const grid = zCache.entities[e.type];
      if (grid) h ^= grid[e.y][e.x];
    }
  }
  return h.toString();
}

// Public: Simplify an entire level by iteratively
// 1) removing outer rows/cols, and
// 2) replacing tiles with simpler equivalents,
// while preserving solver outputs: same solutions and step counts; and optionally same dead-end counts.
export async function simplifyLevel(inputState, { runSolver, params = {}, preserveDeadEnds = true } = {}) {
  let current = cloneState(inputState);
  const limits = {
    maxDepth: params.maxDepth || 100,
    maxNodes: params.maxNodes || 200000,
    maxSolutions: Math.max(params.maxSolutions || 50, 1)
  };
  let baseline = await runSolver(current, { ...limits, onProgress: () => {} });
  let baseSig = solverSignature(baseline);

  async function same(sig) { return sameSignature(baseSig, sig, preserveDeadEnds); }

  let changed = true;
  while (changed) {
    changed = false;

    // Try border removals greedily
    const borderMutations = [
      (s) => removeRow(s, 'top'),
      (s) => removeRow(s, 'bottom'),
      (s) => removeColumn(s, 'left'),
      (s) => removeColumn(s, 'right')
    ];
    let removed = false;
    for (const mut of borderMutations) {
      const next = mut(current);
      if (!next) continue;
      const res = await runSolver(next, { ...limits, onProgress: () => {} });
      const sig = solverSignature(res);
      if (await same(sig)) {
        current = next;
        baseSig = sig;
        removed = true;
        changed = true;
        break; // restart outer loop to allow cascading removals
      }
      await tick();
    }
    if (removed) continue;

    // Try to simplify tiles across whole grid; one change at a time
    let simplifiedOne = false;
    outer: for (let y = 0; y < current.size.rows; y++) {
      for (let x = 0; x < current.size.cols; x++) {
        const cur = current.base[y][x] || 'floor';
        const simplerOptions = ['wall','hole','floor']
          .filter(t => isSimplerTile(t, cur))
          .sort((a, b) => tileRank(a) - tileRank(b));
        if (!simplerOptions.length) continue;

        const hasBox = current.entities?.some(e => (e.type === EntityTypes.box || e.type === EntityTypes.heavyBox) && e.x === x && e.y === y);
        const options = simplerOptions.filter(t => !hasBox || allowsBoxTile(t));
        for (const t of options) {
          const prev = cur;
          const testState = cloneState(current);
          testState.base[y][x] = t;
          const res = await runSolver(testState, { ...limits, onProgress: () => {} });
          const sig = solverSignature(res);
          if (await same(sig)) {
            current = testState;
            baseSig = sig;
            simplifiedOne = true;
            changed = true;
            break outer;
          }
          await tick();
        }
      }
    }
    if (simplifiedOne) continue;
  }

  return current;
}

// Attempt to replace newly changed tiles with simpler ones while keeping solver outputs identical
async function simplifyTilesPreservingResult({ base, candidate, params, runSolver, prevResult }) {
  const origSig = solverSignature(prevResult);
  const rows = candidate.size.rows;
  const cols = candidate.size.cols;

  // Find positions where candidate differs from base
  const diffs = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const a = (base.base[y][x] || 'floor');
      const b = (candidate.base[y][x] || 'floor');
      if (a !== b) diffs.push({ x, y });
    }
  }

  let currentSig = origSig;

  for (const { x, y } of diffs) {
    let curType = candidate.base[y][x] || 'floor';
    while (true) {
      const simplerOptions = ['wall','hole','floor']
        .filter(t => isSimplerTile(t, curType))
        .sort((t1, t2) => tileRank(t1) - tileRank(t2));
      if (!simplerOptions.length) break;

      // If a box/heavyBox is at this cell, keep only box-legal tiles
      const hasBox = candidate.entities?.some(e => (e.type === EntityTypes.box || e.type === EntityTypes.heavyBox) && e.x === x && e.y === y);
      const options = simplerOptions.filter(t => !hasBox || allowsBoxTile(t));
      if (!options.length) break;

      let applied = false;
      for (const t of options) {
        const prev = curType;
        candidate.base[y][x] = t;
        const test = await runSolver(candidate, {
          maxDepth: params.maxDepth,
          maxNodes: params.maxNodes,
          maxSolutions: Math.max(params.maxSolutions, 1),
          onProgress: () => {}
        });
        const testSig = solverSignature(test);
        if (sameSignature(currentSig, testSig)) {
          // accept and continue trying to simplify further
          curType = t;
          currentSig = testSig; // unchanged by definition, but keep consistent
          applied = true;
          break;
        } else {
          // revert
          candidate.base[y][x] = prev;
        }
      }
      if (!applied) break; // cannot simplify further at this cell
    }
  }
}

function traitKeys(tileType) {
  const t = getTileTraits(tileType) || {};
  return Object.keys(t).filter(k => k !== 'name' && t[k] === true);
}

function traitCount(tileType) { return traitKeys(tileType).length; }

function tileRank(tileType) {
  // Simplicity order: wall (simplest) < hole < floor (least simple among the three)
  if (tileType === 'wall') return 0;
  if (tileType === 'hole') return 1;
  if (tileType === 'floor') return 2;
  return Number.POSITIVE_INFINITY;
}

function isSimplerTile(candidateTile, originalTile) {
  // Simpler tiles are restricted to floor < hole < wall
  const candR = tileRank(candidateTile);
  const origR = tileRank(originalTile);
  return candR < origR;
}

function solverSignature(result) {
  const sols = Array.isArray(result?.solutions) ? result.solutions : [];
  const deads = Array.isArray(result?.deadEnds) ? result.deadEnds : [];
  const norm = arr => arr.map(s => `${s.moves || ''}|${s.length || 0}`).sort();
  return { s: norm(sols), d: norm(deads) };
}

function sameSignature(a, b, includeDeads = true) {
  if (!a || !b) return false;
  if (a.s.length !== b.s.length || a.d.length !== b.d.length) return false;
  for (let i = 0; i < a.s.length; i++) if (a.s[i] !== b.s[i]) return false;
  if (includeDeads) {
    for (let i = 0; i < a.d.length; i++) if (a.d[i] !== b.d[i]) return false;
  }
  return true;
}

function tick() { return new Promise(r => setTimeout(r, 0)); }
  // Toggle buttons for entity mutations
  const movePlayerBtn = document.getElementById('autoMovePlayer');
  const placeBoxesBtn = document.getElementById('autoPlaceBoxes');
  const removeBoxesBtn = document.getElementById('autoRemoveBoxes');

  [movePlayerBtn, placeBoxesBtn, removeBoxesBtn].forEach(btn => {
    if (!btn) return;
    btn.addEventListener('click', () => {
      const on = btn.classList.toggle('active');
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  });
