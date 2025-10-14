// core/player/stateMachine.js
// Player movement delegation to state handlers
import { findPlayer, firstEntityAt, cloneState } from '../state.js';
import { EntityTypes, isPushable } from '../entities.js';
import * as Free from './states/free.js';
import * as InboxBox from './states/inboxBox.js';
import * as InboxHeavy from './states/inboxHeavy.js';

export function stepPlayerMove(state, { dx, dy }) {
  const s = cloneState(state);
  const effects = [];
  const player = findPlayer(s);
  if (!player) return { newState: s, effects, changed: false };

  const px = player.x, py = player.y;
  const under = firstEntityAt(s, px, py, isPushable);

  // Choose handler by state and occupant under player
  const candidates = [InboxHeavy, InboxBox, Free];
  for (const handler of candidates) {
    if (handler.canHandle(s, player, under)) {
      return handler.handleInput(s, player, { dx, dy });
    }
  }

  // Fallback to free if no handler claims it
  return Free.handleInput(s, player, { dx, dy });
}

