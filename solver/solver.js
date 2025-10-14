// solver/solver.js
import { cloneState } from '../core/state.js';
import { stepMove } from '../core/engine.js';
import { isWinningState, isLosingState } from '../core/goals.js';
import { initZobrist, hashState } from './zobrist.js';
import { filterNearDuplicates } from './filters.js';

let cancelRequested = false;

export async function runSolver(initialState, {
  maxDepth = 100,
  maxNodes = 200000,
  maxSolutions = 50,
  onProgress = () => {}
} = {}) {
  cancelRequested = false;

  const root = cloneState(initialState);
  initZobrist(root.size.rows, root.size.cols, ['box', 'heavyBox', 'fragileWall']);

  const startHash = hashState(root);
  const visited = new Set([startHash]);
  const queue = [{ state: root, depth: 0, hash: startHash }];
  const parentMap = new Map([[startHash, { parent: null, move: null }]]);
  const depthByHash = { [startHash]: 0 };
  const processed = new Set();
  const edges = [];
  const goalHashes = new Set();

  const dirs = [
    { dx: 1, dy: 0, code: 'd' },
    { dx: -1, dy: 0, code: 'a' },
    { dx: 0, dy: -1, code: 'w' },
    { dx: 0, dy: 1, code: 's' }
  ];

  let nodes = 0;
  const solutionEntries = [];

  while (queue.length && nodes < maxNodes && solutionEntries.length < maxSolutions && !cancelRequested) {
    const node = queue.shift();
    processed.add(node.hash);
    nodes++;

    if (nodes % 500 === 0) {
      onProgress(`Searching... nodes:${nodes}, queue:${queue.length}, solutions:${solutionEntries.length}`);
      await tick();
      if (cancelRequested) break;
    }

    if (node.depth >= maxDepth) continue;

    for (const dir of dirs) {
      const { newState, changed } = stepMove(node.state, dir);
      if (!changed) continue;

      const childHash = hashState(newState);
      if (visited.has(childHash)) continue;
      visited.add(childHash);

      const losing = isLosingState(newState);
      edges.push({ parent: node.hash, child: childHash, move: dir.code, losing });
      if (losing) continue; // game over states do not count as dead ends

      parentMap.set(childHash, { parent: node.hash, move: dir.code });
      depthByHash[childHash] = node.depth + 1;

      if (isWinningState(newState)) {
        const moves = reconstructPath(parentMap, childHash);
        solutionEntries.push({ hash: childHash, moves, length: moves.length });
        goalHashes.add(childHash);
        if (solutionEntries.length >= maxSolutions) break;
        continue;
      }

      queue.push({ state: newState, depth: node.depth + 1, hash: childHash });
    }
  }

  const filteredSolutions = filterNearDuplicates(
    solutionEntries.map(({ moves, length }) => ({ moves, length })),
    2
  );

  // Build adjacency excluding losing edges
  const adj = new Map();
  const revAdj = new Map();
  for (const e of edges) {
    if (e.losing) continue;
    if (!adj.has(e.parent)) adj.set(e.parent, []);
    if (!revAdj.has(e.child)) revAdj.set(e.child, []);
    adj.get(e.parent).push(e.child);
    revAdj.get(e.child).push(e.parent);
    if (!revAdj.has(e.parent)) revAdj.set(e.parent, revAdj.get(e.parent) || []);
    if (!adj.has(e.child)) adj.set(e.child, adj.get(e.child) || []);
  }

  // Compute solvableStates via reverse BFS from all goal hashes
  const solvableStates = new Set();
  const q = [];
  for (const h of goalHashes) { solvableStates.add(h); q.push(h); }
  while (q.length) {
    const x = q.shift();
    const preds = revAdj.get(x) || [];
    for (const p of preds) {
      if (!solvableStates.has(p)) { solvableStates.add(p); q.push(p); }
    }
  }

  const deadEndCandidates = [];
  for (const edge of edges) {
    if (edge.losing) continue; // immediate game over is not a dead end
    if (!solvableStates.has(edge.parent)) continue; // parent first must be solvable
    if (solvableStates.has(edge.child)) continue; // child still solvable -> not a dead end
    if (!processed.has(edge.child)) continue; // ensure child state fully explored within limits
    if (hasSolvableEscapeAdj(edge.child, solvableStates, adj)) continue;
    const moves = reconstructPath(parentMap, edge.child);
    if (!moves) continue;
    deadEndCandidates.push({ moves, length: moves.length });
  }

  const filteredDeadEnds = filterNearDuplicates(deadEndCandidates, 2);

  onProgress(
    `Done. nodes expanded: ${nodes}, solutions: ${filteredSolutions.length}, dead ends: ${filteredDeadEnds.length}`
  );

  return {
    solutions: filteredSolutions,
    deadEnds: filteredDeadEnds,
    stats: {
      nodesExpanded: nodes,
      rawSolutions: solutionEntries.length,
      rawDeadEnds: deadEndCandidates.length
    },
    graph: {
      startHash,
      processed,
      edges,
      adj,
      rev: revAdj,
      depthByHash,
      goalHashes
    }
  };
}

export function cancelSolver() {
  cancelRequested = true;
}

function reconstructPath(parentMap, hash) {
  if (!parentMap.has(hash)) return '';
  const moves = [];
  let current = hash;
  while (true) {
    const meta = parentMap.get(current);
    if (!meta || meta.parent === null) break;
    moves.push(meta.move);
    current = meta.parent;
  }
  moves.reverse();
  return moves.join('');
}

function tick() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function hasSolvableEscapeAdj(hash, solvableStates, adj) {
  const outs = adj.get(hash) || [];
  for (const next of outs) if (solvableStates.has(next)) return true;
  return false;
}
