// core/engine.js
// Engine orchestrator: delegate player movement to state handlers
import { stepPlayerMove } from './player/stateMachine.js';

export function stepMove(state, { dx, dy }) {
  // Delegate to player state machine; keep API and effects stable
  const { newState, effects, changed } = stepPlayerMove(state, { dx, dy });
  return { newState, effects, changed };
}

