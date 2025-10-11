// solver/solver.js
import { cloneState } from '../core/state.js';
import { stepMove } from '../core/engine.js';
import { isWinningState, isLosingState } from '../core/goals.js';
import { initZobrist, hashState } from './zobrist.js';
import { filterNearDuplicates } from './filters.js';

let cancelRequested = false;

export async function runSolver(initialState, {
  maxDepth=100, maxNodes=200000, maxSolutions=50, onProgress=()=>{}
}={}) {
  cancelRequested = false;

  const init = cloneState(initialState);
  initZobrist(init.size.rows, init.size.cols, ['box','heavyBox','fragileWall']);

  const startHash = hashState(init);
  const visited = new Set([startHash]);
  const queue = [{ state:init, path:[], depth:0 }];

  const dirs = [
    {dx:1,dy:0, code:'d'},
    {dx:-1,dy:0, code:'a'},
    {dx:0,dy:-1, code:'w'},
    {dx:0,dy:1, code:'s'}
  ];

  let nodes=0;
  const solutions=[];

  while (queue.length && nodes<maxNodes && solutions.length<maxSolutions && !cancelRequested) {
    const node = queue.shift();
    nodes++;
    if (nodes%500===0) {
      onProgress(`Searching... nodes:${nodes}, queue:${queue.length}, solutions:${solutions.length}`);
      await new Promise(r=>setTimeout(r,0));
      if (cancelRequested) break;
    }

    if (node.depth >= maxDepth) continue;

    for (const d of dirs) {
      const { newState, changed } = stepMove(node.state, d);
      if (!changed) continue;

      const h = hashState(newState);
      if (visited.has(h)) continue;
      visited.add(h);

      if (isLosingState(newState)) continue;

      const newPath = node.path.concat(d.code);
      if (isWinningState(newState)) {
        solutions.push({ moves:newPath.join(''), length:newPath.length });
        if (solutions.length>=maxSolutions) break;
        continue;
      }

      queue.push({ state:newState, path:newPath, depth: node.depth+1 });
    }
  }

  const filtered = filterNearDuplicates(solutions, 2);
  onProgress(`Done. nodes expanded: ${nodes}, found: ${filtered.length}`);
  return { solutions: filtered };
}

export function cancelSolver(){ cancelRequested = true; }
