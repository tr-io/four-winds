import type { GameView } from '../shared/types';

// Shared stage boundaries for the opening title, dice, 3D packets, and tile clacks.
export const DEAL = { intro: 1200, roll: 800, assemble: 300, packet: 80, flight: 300 };
export function dealSequence(game?: Pick<GameView, 'setup'>) {
  const rolls = game?.setup?.dice.length ?? 0;
  const packets = Math.ceil((game?.setup?.deal.length ?? 53) / 4);
  const diceDuration = rolls * DEAL.roll;
  const assembleAt = DEAL.intro + diceDuration;
  const tilesAt = assembleAt + DEAL.assemble;
  const duration = tilesAt + Math.max(0, packets - 1) * DEAL.packet + DEAL.flight + 100;
  return { rolls, packets, diceDuration, assembleAt, tilesAt, duration };
}
export type DealSequence = ReturnType<typeof dealSequence>;

export function freshDealKey(room: string, game: GameView, serverTime: number): string | null {
  if (game.phase !== 'playing' || game.players.some((p) => p.hasDiscarded || p.melds.length))
    return null;
  const start = game.events.find(
    (e) => e.type === 'info' && e.text.startsWith(`Hand ${game.handNumber} ·`),
  );
  if (!start || serverTime - start.at < 0 || serverTime - start.at > 3000) return null;
  return `${room}:${game.handNumber}:${start.at}`;
}
