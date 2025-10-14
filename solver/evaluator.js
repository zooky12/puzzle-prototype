// solver/evaluator.js
// Level scoring module implementing heuristics U, D, Fr, S, M, F, Y and global dead-end depth constraint.
// This module expects a solver summary (graph) to avoid recomputation.

import { stepMove } from '../core/engine.js';
import { cloneState, findPlayer } from '../core/state.js';
import { EntityTypes } from '../core/entities.js';
import { isTrait } from '../core/tiles.js';

/** Heuristic keys (P removed) */
export const HeuristicKeys = ['U','D','Fr','S','M','F','Y'];

function clamp01(x){ return Math.max(0, Math.min(1, x)); }

function log2(x){ return Math.log(x) / Math.log(2); }

function l1NormalizeWeights(raw, activeKeys){
  const eff = {};
  let denom = 0;
  for (const k of activeKeys) denom += Math.abs(raw[k] || 0);
  if (denom > 0){
    for (const k of activeKeys) eff[k] = (raw[k] || 0) / denom;
  } else {
    const n = activeKeys.length || 1;
    for (const k of activeKeys) eff[k] = 1 / n;
  }
  return eff;
}

function signedTo01(scoreSigned){
  return clamp01(0.5 * (scoreSigned + 1));
}

function pearsonCorr(a, b){
  const n = Math.min(a.length, b.length);
  if (n <= 1) return 0;
  let ma=0, mb=0;
  for (let i=0;i<n;i++){ ma += a[i]; mb += b[i]; }
  ma/=n; mb/=n;
  let num=0, da=0, db=0;
  for (let i=0;i<n;i++){
    const xa=a[i]-ma, xb=b[i]-mb;
    num += xa*xb; da += xa*xa; db += xb*xb;
  }
  const den = Math.sqrt(da*db) || 0;
  if (den === 0) return 0;
  return num/den;
}

// Build adjacency maps from raw edges (exclude losing edges for gameplay graph)
function buildAdjacency(edges){
  const adj = new Map();
  const rev = new Map();
  for (const e of edges){
    if (e.losing) continue;
    if (!adj.has(e.parent)) adj.set(e.parent, []);
    if (!rev.has(e.child)) rev.set(e.child, []);
    adj.get(e.parent).push(e.child);
    rev.get(e.child).push(e.parent);
    if (!rev.has(e.parent)) rev.set(e.parent, rev.get(e.parent) || []);
    if (!adj.has(e.child)) adj.set(e.child, adj.get(e.child) || []);
  }
  return { adj, rev };
}

function reverseReachableFrom(goals, rev){
  const G = new Set();
  const q = [];
  for (const h of goals){ if (!G.has(h)){ G.add(h); q.push(h); } }
  while (q.length){
    const x = q.shift();
    const preds = rev.get(x) || [];
    for (const p of preds){ if (!G.has(p)){ G.add(p); q.push(p); } }
  }
  return G;
}

// Tarjan SCC
function sccTarjan(nodes, adj){
  const index = new Map();
  const low = new Map();
  const stack = [];
  const onStack = new Set();
  let idx = 0;
  const comps = [];
  function strong(v){
    index.set(v, idx);
    low.set(v, idx);
    idx++;
    stack.push(v); onStack.add(v);
    for (const w of (adj.get(v) || [])){
      if (!index.has(w)){
        strong(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)){
        low.set(v, Math.min(low.get(v), index.get(w)));
      }
    }
    if (low.get(v) === index.get(v)){
      const comp = [];
      while (true){
        const w = stack.pop(); onStack.delete(w);
        comp.push(w);
        if (w === v) break;
      }
      comps.push(comp);
    }
  }
  for (const v of nodes){ if (!index.has(v)) strong(v); }
  // map node->compId
  const idOf = new Map();
  comps.forEach((comp, id)=> comp.forEach(v=> idOf.set(v, id)));
  return { comps, idOf };
}

function longestPathOnCondensation(nodes, adj, idOf, comps){
  const n = comps.length;
  const weight = new Array(n).fill(0);
  for (let i=0;i<n;i++) weight[i] = comps[i].length;
  const dag = new Array(n).fill(0).map(()=> new Set());
  for (const v of nodes){
    const cv = idOf.get(v);
    for (const w of (adj.get(v) || [])){
      const cw = idOf.get(w);
      if (cv !== cw) dag[cv].add(cw);
    }
  }
  // topological DP via DFS memo
  const memo = new Array(n).fill(-1);
  function dfs(c){
    if (memo[c] >= 0) return memo[c];
    let best = 0;
    for (const nxt of dag[c]) best = Math.max(best, dfs(nxt));
    memo[c] = weight[c] + best;
    return memo[c];
  }
  for (let c=0;c<n;c++) if (memo[c] < 0) dfs(c);
  return memo; // longest path weight starting at SCC c
}

export function passesDeadEndDepthConstraint(solverGraph, minDepth){
  if (!minDepth || minDepth <= 0) return true;
  const processed = solverGraph.processed; // Set
  const edges = solverGraph.edges || [];
  const { adj, rev } = solverGraph.adj && solverGraph.rev ? solverGraph : buildAdjacency(edges);
  const goalHashes = new Set(solverGraph.goalHashes || []);
  if (goalHashes.size === 0) return true; // no solutions -> handled elsewhere normally
  const G = reverseReachableFrom(goalHashes, rev);
  const R = new Set(processed);
  // Dead region nodes (excluding losing edges already)
  const deadNodes = new Set();
  for (const h of R){ if (!G.has(h)) deadNodes.add(h); }
  if (deadNodes.size === 0) return true;
  const nodes = Array.from(deadNodes);
  const adjDead = new Map();
  for (const v of nodes){
    const outs = (adj.get(v) || []).filter(w => deadNodes.has(w));
    adjDead.set(v, outs);
  }
  const { comps, idOf } = sccTarjan(nodes, adjDead);
  const lp = longestPathOnCondensation(nodes, adjDead, idOf, comps);
  // For edges crossing G->D, check entry depth length
  for (const e of edges){
    if (e.losing) continue;
    const u = e.parent, v = e.child;
    if (!R.has(u) || !R.has(v)) continue;
    const uInG = G.has(u), vInG = G.has(v);
    if (uInG && !vInG && deadNodes.has(v)){
      const c = idOf.get(v);
      const depthLen = lp[c] || 0;
      if (depthLen < minDepth) return false;
    }
  }
  return true;
}

export function computeMetrics({ initialState, solverGraph, solverResult, params = {}, needKeys }){
  // Shared basics
  const edges = solverGraph.edges || [];
  const processed = solverGraph.processed || new Set();
  const { adj, rev } = solverGraph.adj && solverGraph.rev ? solverGraph : buildAdjacency(edges);
  const goalHashes = new Set(solverGraph.goalHashes || []);
  const depthByHash = solverGraph.depthByHash || {};
  const Rsize = processed.size || 1;
  const filteredSolutions = Array.isArray(solverResult?.solutions) ? solverResult.solutions : [];
  const L = filteredSolutions.length ? Math.min(...filteredSolutions.map(s => s.length)) : 0;
  const L_safe = Math.max(1, L);

  // Precompute G
  const G = goalHashes.size ? reverseReachableFrom(goalHashes, rev) : new Set();

  // Metrics
  const out = {};

  // U: uniqueness
  const S_max = params?.U?.S_max ?? 16;
  const Sols = Math.min(filteredSolutions.length, S_max);
  out.U = (1 - (log2(1 + Sols) / log2(1 + S_max)));

  // D: dead-end density
  if (processed && processed.size){
    let deadCount = 0;
    for (const h of processed){ if (!G.has(h)) deadCount++; }
    out.D = clamp01(deadCount / Math.max(1, processed.size));
  } else out.D = 0;

  // Fr: early frustration (clamp t to [0,L])
  if (processed && processed.size){
    let num = 0, den = 0;
    for (const h of processed){
      const t = depthByHash[h] ?? 0;
      const tc = Math.max(0, Math.min(L, t));
      const w = 1 - (tc / L_safe);
      const isDead = !G.has(h);
      if (isDead) num += w;
      den += w;
    }
    out.Fr = den > 1e-9 ? clamp01(num / den) : 0;
  } else out.Fr = 0;

  // S: solution depth window
  const L_min = params?.S?.L_min ?? 6;
  const L_max = Math.max((params?.S?.L_max ?? 30), L_min + 1);
  out.S = clamp01((L - L_min) / Math.max(1, (L_max - L_min)));

  // M: mechanic diversity (entropy) from one shortest path (only if needed)
  out.M = 0;
  if ((!needKeys || needKeys.has('M')) && filteredSolutions.length && initialState){
    const moves = filteredSolutions[0].moves; // deterministic first shortest (UI: lexicographically stable via filtering)
    const tags = simulatePathTags(initialState, moves);
    const counts = new Map();
    for (const t of tags){ counts.set(t, (counts.get(t) || 0) + 1); }
    const total = tags.length || 1;
    const probs = Array.from(counts.values()).map(c => c / total);
    let H = 0;
    for (const p of probs){ if (p>0) H += -p * log2(p); }
    const n = counts.size;
    const Hm = n > 1 ? log2(n) : 1; // avoid div0; if n<=1 => M=0
    out.M = n > 1 ? clamp01(H / Hm) : 0;
  }

  // F: flow arc (difficulty progression)
  out.F = 0;
  if ((!needKeys || needKeys.has('F')) && filteredSolutions.length && L >= 3){
    const moves = filteredSolutions[0].moves;
    const pathHashes = reconstructHashesAlongPath(solverGraph, moves);
    const bVals = [];
    const gVals = [];
    const qVals = [];
    let bMax = 1;
    for (let t=0; t<pathHashes.length; t++){
      const h = pathHashes[t];
      const outs = (adj.get(h) || []);
      const outDeg = outs.length;
      if (outDeg > bMax) bMax = outDeg;
    }
    for (let t=0; t<pathHashes.length; t++){
      const h = pathHashes[t];
      const outs = (adj.get(h) || []);
      const outDeg = outs.length;
      const bhat = bMax ? (outDeg / bMax) : 0;
      const ghat = (L - t) / Math.max(1, L);
      // q̂_t: fraction of neighbors in dead region (h=1)
      let deadNbr = 0;
      for (const w of outs){ if (!G.has(w)) deadNbr++; }
      const qhat = outs.length ? (deadNbr / outs.length) : 0;
      bVals.push(bhat); gVals.push(ghat); qVals.push(qhat);
    }
    const d = bVals.map((b, i)=> (b + gVals[i] + qVals[i]) / 3);
    const I = d.map((_, i)=> Math.sin(Math.PI * (i) / Math.max(1, L)));
    out.F = Math.max(pearsonCorr(d, I), 0);
  }

  // Y: symmetry on base grid only
  out.Y = (!needKeys || needKeys.has('Y'))
    ? computeGridSymmetry(initialState?.base, params?.Y?.sym_mode || 'horizontal')
    : 0;

  // Clamp everything
  for (const k of HeuristicKeys){ out[k] = clamp01(out[k] || 0); }
  return out;
}

function computeGridSymmetry(base, mode){
  if (!base || !base.length) return 0;
  const rows = base.length, cols = base[0].length;
  let same = 0, total = rows*cols;
  function mirr(x, y){
    if (mode === 'horizontal') return { x: cols - 1 - x, y };
    if (mode === 'vertical') return { x, y: rows - 1 - y };
    // rot180
    return { x: cols - 1 - x, y: rows - 1 - y };
  }
  for (let y=0;y<rows;y++){
    for (let x=0;x<cols;x++){
      const {x:mx,y:my} = mirr(x,y);
      if ((base[y][x] || 'floor') === (base[my][mx] || 'floor')) same++;
    }
  }
  return clamp01(1 - ((total - same) / Math.max(1,total)));
}

function simulatePathTags(initialState, moves){
  const s = cloneState(initialState);
  const tags = [];
  const dirs = { a:{dx:-1,dy:0}, d:{dx:1,dy:0}, w:{dx:0,dy:-1}, s:{dx:0,dy:1} };
  const hasPlateAnywhere = !!s.base?.some(row => row.some(tile => tile === 'pressurePlate'));
  const platePos = [];
  if (hasPlateAnywhere){
    for (let y=0;y<s.size.rows;y++) for (let x=0;x<s.size.cols;x++) if ((s.base[y][x]||'floor')==='pressurePlate') platePos.push(x+","+y);
  }
  function boxesOnPlates(){
    if (!hasPlateAnywhere) return false;
    return s.entities.some(e => (e.type===EntityTypes.box || e.type===EntityTypes.heavyBox) && platePos.includes(e.x+","+e.y));
  }

  for (let i=0;i<moves.length;i++){
    const ch = moves[i];
    const dir = dirs[ch];
    if (!dir) continue;
    const player = findPlayer(s);
    const before = player ? { mode: player.state?.mode, entryDir: player.state?.entryDir } : { mode: 'free', entryDir: {dx:0,dy:0} };
    const { newState, effects } = stepMove(s, dir);
    // effects come along, s mutated in-place through newState reference
    let stepTags = [];
    // movement distance
    const p2 = findPlayer(newState);
    let manhattan = 0;
    if (player && p2){ manhattan = Math.abs((p2.x||0)-(player.x||0)) + Math.abs((p2.y||0)-(player.y||0)); }
    if (manhattan > 1) stepTags.push('flight');
    // classify pushes & heavy
    let movedBoxes = 0, movedHeavies = 0;
    let brokeFrag = false, fell = false;
    for (const ef of (effects||[])){
      if (ef.type === 'entityMoved' && (ef.entityType===EntityTypes.box || ef.entityType===EntityTypes.heavyBox)){
        movedBoxes++;
        if (ef.entityType===EntityTypes.heavyBox) movedHeavies++;
      } else if (ef.type === 'tileChanged') {
        brokeFrag = true;
      } else if (ef.type === 'boxFell') {
        fell = true;
      }
    }
    if (movedBoxes>0) stepTags.push('pushBox');
    if (movedHeavies>0) stepTags.push('pushHeavy');
    if (brokeFrag) stepTags.push('breakFragile');
    if (fell) stepTags.push('boxFall');
    // pushHeavyStraight: heavy push with side-effect and aligned with entryDir
    const hasSideEffect = fell || brokeFrag || movedBoxes>1;
    if (movedHeavies>0 && hasSideEffect){
      const ed = before.entryDir || {dx:0,dy:0};
      if (ed.dx === dir.dx && ed.dy === dir.dy) stepTags.push('pushHeavyStraight');
    }
    // walk if nothing else
    if (stepTags.length === 0) stepTags.push('walk');
    // usePressurePlate
    if (boxesOnPlates()) stepTags.push('usePressurePlate');
    // use:<tile>
    const t = (newState.base[p2.y][p2.x] || 'floor');
    const useTiles = ['hole','exit','pressurePlate','grile','spikes','holeSpikes','slimPathFloor','slimPathHole','fragileWall','wall'];
    if (useTiles.includes(t)) stepTags.push('use:'+t);
    // record
    tags.push(...stepTags);
  }
  return tags;
}

function reconstructHashesAlongPath(solverGraph, moves){
  // If solver provided per-move hashes, we could use them; otherwise approximate by walking parent chain
  // Here we approximate by replaying moves on the hash chain: startHash -> (
  const out = [];
  const start = solverGraph.startHash;
  if (!start) return out;
  let cur = start;
  out.push(cur);
  const dirs = { a:'a', d:'d', w:'w', s:'s' };
  for (let i=0;i<moves.length;i++){
    const ch = moves[i];
    if (!dirs[ch]) continue;
    const outs = (solverGraph.adj.get(cur) || []);
    // Choose edge whose recorded move matches desired move if available
    // Build a map of child->move if provided
    let next = null;
    const childByMove = solverGraph.moveIndex?.get(cur);
    if (childByMove && childByMove.has(ch)) next = childByMove.get(ch);
    if (!next) next = outs[0];
    if (!next) break;
    cur = next;
    out.push(cur);
  }
  return out;
}

export function applyBands(metrics, bands){
  for (const k of Object.keys(metrics)){
    const band = bands && bands[k];
    if (band && band.enabled){
      const v = metrics[k];
      if (!(v >= band.min && v <= band.max)){
        return { ok:false, reason: `band_fail_${k}` };
      }
    }
  }
  return { ok:true };
}

export function combineScore(metrics, weights, { mapSigned=true } = {}){
  const active = HeuristicKeys.filter(k => (weights[k]||0) !== 0 && (k in metrics));
  const eff = l1NormalizeWeights(weights, active);
  let signed = 0;
  const breakdown = {};
  for (const k of HeuristicKeys){
    if (!(k in metrics)) continue;
    const w = (eff[k] || 0);
    const m = metrics[k];
    const contrib = w * m;
    if (active.includes(k)) signed += contrib;
    breakdown[k] = { metric: m, weight_input: (weights[k]||0), weight_eff: w, contribution: contrib };
  }
  const score01 = mapSigned ? signedTo01(signed) : clamp01(signed);
  return { score_signed: signed, score01, breakdown };
}

export function evaluateLevel({ initialState, solverResult, solverGraph, weights={}, bands={}, params={}, gcons, mapSigned=true }){
  // Hard filters
  if (!solverResult || !Array.isArray(solverResult.solutions)){
    return { discarded:true, discard_reason:'unsolvable' };
  }
  const hasSolution = (solverResult.solutions || []).length > 0;
  if (!hasSolution) return { discarded:true, discard_reason:'unsolvable' };

  const minDepth = gcons?.min_dead_end_depth_len ?? 0;
  const passesDED = passesDeadEndDepthConstraint(solverGraph, minDepth);
  if (!passesDED) return { discarded:true, discard_reason:'dead_end_depth_violation' };

  // Compute only metrics that are needed: weight!=0 or band.enabled
  const need = new Set();
  for (const k of HeuristicKeys){
    if ((weights[k]||0) !== 0) need.add(k);
    if (bands?.[k]?.enabled) need.add(k);
  }
  const neededParams = {
    U: params.U,
    S: params.S,
    F: params.F,
    Y: params.Y
  };
  const metrics = computeMetrics({ initialState, solverGraph, solverResult, params: neededParams, needKeys: need });
  // Drop unneeded metrics to save breakdown clutter
  for (const k of HeuristicKeys){ if (!need.has(k)) delete metrics[k]; }

  const { ok, reason } = applyBands(metrics, bands || {});
  if (!ok) return { discarded:true, discard_reason:reason };

  const { score_signed, score01, breakdown } = combineScore(metrics, weights || {}, { mapSigned });
  return { discarded:false, metrics, score: score01, score_signed, breakdown };
}
