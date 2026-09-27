import type { GameView } from '../shared/types';

// One clock shared by the table, cut-in, and synthesized tile clacks (milliseconds).
export const DEAL = { shuffle: 600, assemble: 300, packet: 70, flight: 350, duration: 2300 };
export const dealTileDelay = (seat: number, index: number, dealer: number) =>
  DEAL.shuffle +
  DEAL.assemble +
  (Math.floor(index / 4) * 4 + ((seat - dealer + 4) % 4)) * DEAL.packet +
  (index % 4) * 14;

export function freshDealKey(room: string, game: GameView, serverTime: number): string | null {
  if (game.phase !== 'playing' || game.players.some((p) => p.hasDiscarded || p.melds.length))
    return null;
  const start = game.events.find(
    (e) => e.type === 'info' && e.text.startsWith(`Hand ${game.handNumber} ·`),
  );
  if (!start || serverTime - start.at < 0 || serverTime - start.at > 3000) return null;
  return `${room}:${game.handNumber}:${start.at}`;
}
