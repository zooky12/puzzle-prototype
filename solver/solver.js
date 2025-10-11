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
  const parentMap = new Map([[startHash, { parent: null, move: null, state: root }]]);
  const processed = new Set();
  const edges = [];
  const solvableStates = new Set();

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

      parentMap.set(childHash, { parent: node.hash, move: dir.code, state: newState });

      if (isWinningState(newState)) {
        const moves = reconstructPath(parentMap, childHash);
        solutionEntries.push({ hash: childHash, moves, length: moves.length });
        markSolvableFrom(childHash, parentMap, solvableStates);
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

  const deadEndCandidates = [];
  for (const edge of edges) {
    if (edge.losing) continue; // immediate game over is not a dead end
    if (!solvableStates.has(edge.parent)) continue; // parent first must be solvable
    if (solvableStates.has(edge.child)) continue; // child still solvable -> not a dead end
    if (!processed.has(edge.child)) continue; // ensure child state fully explored within limits
    if (hasSolvableEscape(edge.child, parentMap, solvableStates, dirs)) continue;
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

function markSolvableFrom(hash, parentMap, solvableStates) {
  let current = hash;
  while (current && !solvableStates.has(current)) {
    solvableStates.add(current);
    const meta = parentMap.get(current);
    if (!meta || meta.parent === null) break;
    current = meta.parent;
  }
}

function tick() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function hasSolvableEscape(hash, parentMap, solvableStates, dirs) {
  const meta = parentMap.get(hash);
  if (!meta || !meta.state) return false;
  for (const dir of dirs) {
    const { newState, changed } = stepMove(meta.state, dir);
    if (!changed) continue;
    if (isLosingState(newState)) continue;
    const nextHash = hashState(newState);
    if (solvableStates.has(nextHash)) return true;
  }
  return false;
}
