import { kind } from '../shared/tiles';
import type { Meld } from '../shared/types';

// Observable ingredients, not a fan/yaku prediction: pairs can overlap potential chows.
export function handInsight(hand: number[], melds: Meld[]) {
  const counts = Array<number>(34).fill(0);
  for (const tile of hand) if (tile < 136) counts[kind(tile)]++;
  const pairs = counts.flatMap((count, k) => (count >= 2 ? [k * 4] : []));
  const suits = [0, 0, 0, 0];
  for (const tile of [...hand, ...melds.flatMap((m) => m.tiles)]) {
    if (tile < 136) suits[Math.min(3, Math.floor(kind(tile) / 9))]++;
  }
  const suitKinds = suits.slice(0, 3).filter((n) => n > 0).length;
  const route =
    suitKinds === 0
      ? 'All honors'
      : suitKinds === 1
        ? suits[3]
          ? 'One suit + honors'
          : 'One suit'
        : melds.some((m) => m.kind === 'chow')
          ? 'Sequence hand'
          : 'Mixed suits';
  return { pairs, suits, route, locked: melds.length, closed: melds.every((m) => m.concealed) };
}
