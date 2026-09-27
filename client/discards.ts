import { kind } from '../shared/tiles';
import type { Discard } from '../shared/types';

export function summarizeDiscards(players: { discards: Discard[] }[]) {
  const groups = new Map<number, { tile: number; count: number; claimed: number }>();
  for (const player of players)
    for (const discard of player.discards) {
      const k = kind(discard.tile);
      const group = groups.get(k) ?? { tile: k * 4, count: 0, claimed: 0 };
      group.count++;
      if (discard.claimed) group.claimed++;
      groups.set(k, group);
    }
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([, group]) => group);
}
