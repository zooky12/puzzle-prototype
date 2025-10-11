// ui/auto.js
import { cloneState } from '../core/state.js';
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

      // Try to simplify newly changed tiles while preserving solver outputs
      await simplifyTilesPreservingResult({ base: originalBase, candidate, params, runSolver, prevResult: { solutions, deadEnds } });

      const score = [solutions.length, -deadEnds.length, -fastest];
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

function mutateTiles(state, maxChanges, sourceAllowed, targetAllowed) {
  const sourceSet = new Set(sourceAllowed && sourceAllowed.length ? sourceAllowed : ALL_TILES);
  const targets = targetAllowed && targetAllowed.length ? targetAllowed : ALL_TILES;
  const coords = [];
  for (let y = 0; y < state.size.rows; y++) for (let x = 0; x < state.size.cols; x++) coords.push({ x, y });
  shuffle(coords);
  let changes = 0;
  for (const { x, y } of coords) {
    if (changes >= maxChanges) break;
    const cur = state.base[y][x] || 'floor';
    if (!sourceSet.has(cur)) continue;
    // If there is a box/heavyBox at this cell, only choose tiles that support boxes
    const boxAt = state.entities?.some(e => (e.type === EntityTypes.box || e.type === EntityTypes.heavyBox) && e.x === x && e.y === y);
    const candidateTargets = targets.filter(t => t !== cur && (!boxAt || allowsBoxTile(t)));
    if (!candidateTargets.length) continue;
    let pick = candidateTargets[Math.floor(Math.random() * candidateTargets.length)];
    if (!pick) continue; // safety

    // Special case: selecting fragileWall means place an ENTITY overlay, not a base tile
    if (pick === 'fragileWall') {
      // Do not place over a wall tile; allow over anything else
      if (cur === 'wall') continue;
      // Avoid stacking on an existing solid entity at that cell
      const solidHere = state.entities?.some(e => isSolid(e) && e.x === x && e.y === y);
      if (solidHere) continue;
      // Add fragile wall entity preserving the underlying tile for break behavior
      state.entities.push({ type: EntityTypes.fragileWall, x, y, underTile: cur });
      changes++;
      continue;
    }

    state.base[y][x] = pick;
    changes++;
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
function stateKey(s) {
  // Include base grid and a normalized list of entities (type,x,y)
  const ents = (s.entities || [])
    .map(e => ({ t: e.type, x: e.x, y: e.y }))
    .sort((a, b) => (a.t > b.t ? 1 : a.t < b.t ? -1 : a.x - b.x || a.y - b.y));
  // JSON stringify is acceptable here; for large grids this is still fine in UI context
  return JSON.stringify({ base: s.base, ents });
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
      const simplerOptions = ALL_TILES
        .filter(t => t !== curType && isSimplerTile(t, curType))
        .sort((t1, t2) => traitCount(t1) - traitCount(t2));
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

function isSimplerTile(candidateTile, originalTile) {
  const a = new Set(traitKeys(candidateTile));
  const b = new Set(traitKeys(originalTile));
  if (a.size >= b.size) return false;
  for (const k of a) if (!b.has(k)) return false;
  return true;
}

function solverSignature(result) {
  const sols = Array.isArray(result?.solutions) ? result.solutions : [];
  const deads = Array.isArray(result?.deadEnds) ? result.deadEnds : [];
  const norm = arr => arr.map(s => `${s.moves || ''}|${s.length || 0}`).sort();
  return { s: norm(sols), d: norm(deads) };
}

function sameSignature(a, b) {
  if (!a || !b) return false;
  if (a.s.length !== b.s.length || a.d.length !== b.d.length) return false;
  for (let i = 0; i < a.s.length; i++) if (a.s[i] !== b.s[i]) return false;
  for (let i = 0; i < a.d.length; i++) if (a.d[i] !== b.d[i]) return false;
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
