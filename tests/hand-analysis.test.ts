import { describe, expect, it } from 'vitest';
import { PRESETS } from '../shared/rules';
import type { Preset } from '../shared/types';
import { newPlayer, startGame } from '../server/engine';
import { analyzeHand } from '../server/hand-analysis';
import { scoreHand } from '../server/scoring';
const tiles = (text: string) => {
  const c = Array(34).fill(0);
  return [...text.matchAll(/([1-9]+)([mpsz])/g)].flatMap((m) =>
    [...m[1]].map((n) => {
      const k = 'mpsz'.indexOf(m[2]) * 9 + Number(n) - 1;
      return k * 4 + c[k]++;
    }),
  );
};
function fixture(preset: Preset) {
  const r = structuredClone(PRESETS[preset]);
  const g = startGame(
    r,
    [0, 1, 2, 3].map((i) =>
      newPlayer({ id: String(i), name: `P${i}`, avatar: 'jade', hands: 0, wins: 0 }, r),
    ),
    2026,
  );
  for (const p of g.players) {
    p.melds = [];
    p.discards = [];
    p.bonuses = [];
    p.riichi = 0;
    p.hasDiscarded = true;
  }
  g.players[0].hand = tiles(
    preset === 'mcr'
      ? '1112345678999m'
      : preset === 'riichi'
        ? '123456m123789p5s'
        : '111222333m444p5s',
  );
  g.players[0].drawn = null;
  g.dora = [];
  g.ura = [];
  return g;
}
describe('private scored winning routes', () => {
  it.each(['mcr', 'riichi', 'singapore'] as Preset[])(
    '%s suggests qualifying hands with real self-draw settlements',
    (preset) => {
      const g = fixture(preset),
        before = structuredClone(g),
        result = analyzeHand(g, 0);
      expect(result.routes.length).toBeGreaterThan(0);
      expect(result.routes[0].needed.length).toBe(1);
      for (const r of result.routes) {
        expect(r.hand).toHaveLength(14);
        expect(new Set(r.hand).size).toBe(14);
        const winning = r.needed.at(-1)!;
        const simulation = {
          ...g,
          wall: [0, 1, 2, 3, 4],
          reserve: 0,
          interrupted: true,
          ura: [],
          players: g.players.map((p, i) => ({
            ...p,
            hand: i === 0 ? r.hand : [],
            drawn: i === 0 ? winning : null,
            drawSource: 'wall' as const,
            ippatsu: false,
            hasDiscarded: true,
            hasDrawn: true,
          })),
        };
        expect(scoreHand(simulation, 0, winning, null)).toEqual(r.score);
        expect(r.points).toBe(r.score.payments[0]);
      }
      expect(g).toEqual(before);
    },
  );
  it('never depends on hidden hands, wall order, or ura indicators', () => {
    const g = fixture('riichi');
    g.players[0].riichi = 1;
    const other = structuredClone(g);
    other.wall.reverse();
    other.ura = [132, 128, 124];
    for (const p of other.players.slice(1)) p.hand = tiles('11122233344455z');
    expect(analyzeHand(other, 0)).toEqual(analyzeHand(g, 0));
  });
  it('does not suggest collecting a fifth copy or publicly exhausted tile', () => {
    const g = fixture('singapore');
    g.players[1].discards = [89, 90, 91].map((tile) => ({ tile, claimed: false, riichi: false })); // remaining 5 bamboo copies
    expect(
      analyzeHand(g, 0).routes.every((r) => r.needed.every((t) => Math.floor(t / 4) !== 22)),
    ).toBe(true);
  });
});
