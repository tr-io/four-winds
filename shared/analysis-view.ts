import type { Game, GameView } from './types';
/** Supply only the requesting player's view, under the same ordinary self-draw assumptions. */
export function analysisGame(view: GameView): Game {
  return {
    ...view,
    seed: 0,
    setup: undefined,
    wall: [0, 1, 2, 3, 4],
    deadWall: [],
    reserve: 0,
    ura: [],
    claim: null,
    forbiddenDiscards: [],
    events: [],
    result: null,
    players: view.players.map((p, i) => ({
      ...p,
      hand: i === view.seat ? p.hand : [],
      drawn: i === view.seat ? p.drawn : null,
      temporaryFuriten: false,
      riichiFuriten: false,
      missedWins: [],
      missedPungs: [],
    })),
  };
}
