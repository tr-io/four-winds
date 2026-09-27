import { expect } from 'vitest';
import { newPlayer, startGame } from '../../server/engine';
import { PRESETS } from '../../shared/rules';
import { kind, makeWall, sorted } from '../../shared/tiles';
import type { Game, Meld, Preset } from '../../shared/types';

export const TEST_SEED = Number(process.env.MAHJONG_TEST_SEED ?? 2048);
if (!Number.isSafeInteger(TEST_SEED) || TEST_SEED < 0 || TEST_SEED > 0xffffffff)
  throw new Error('MAHJONG_TEST_SEED must be an integer from 0 to 4294967295.');

export function seededGame(preset: Preset = 'mcr', seed = TEST_SEED) {
  const rules = { ...structuredClone(PRESETS[preset]), minimum: 0, dealerRepeats: false };
  return startGame(
    rules,
    [0, 1, 2, 3].map((i) =>
      newPlayer({ id: `${i}`, name: `Player ${i}`, avatar: 'jade', hands: 0, wins: 0 }, rules),
    ),
    seed,
    1000,
  );
}

/** Allocate real physical copies from a seeded wall; never manufacture a fifth copy. */
export function scenario(
  hands: Record<number, string>,
  turn = 0,
  melds: Record<number, { kind: Meld['kind']; text: string }[]> = {},
) {
  const g = seededGame();
  const pool = makeWall('mcr', TEST_SEED);
  const take = (text: string) =>
    [...text.matchAll(/([1-9]+)([mpsz])/g)].flatMap((match) =>
      [...match[1]].map((n) => {
        const k = 'mpsz'.indexOf(match[2]) * 9 + Number(n) - 1;
        const index = pool.findIndex((t) => kind(t) === k);
        if (index < 0) throw new Error(`Unavailable tile ${n}${match[2]}`);
        return pool.splice(index, 1)[0];
      }),
    );
  g.players.forEach((p, seat) => {
    p.hand = take(hands[seat] ?? '');
    p.melds = (melds[seat] ?? []).map((m) => ({
      kind: m.kind,
      tiles: take(m.text),
      from: (seat + 3) % 4,
      concealed: false,
    }));
    p.bonuses = [];
    p.discards = [];
    p.drawn = null;
    p.hasDrawn = true;
    p.hasDiscarded = true;
  });
  g.players.forEach((p, seat) => {
    const size = (seat === turn ? 14 : 13) - p.melds.length * 3;
    if (p.hand.length > size) throw new Error(`Seat ${seat} has too many tiles`);
    while (p.hand.length < size)
      p.hand.push(
        pool.splice(
          pool.findIndex((t) => t < 136),
          1,
        )[0],
      );
    p.hand = sorted(p.hand);
  });
  g.turn = turn;
  g.players[turn].drawn = g.players[turn].hand.at(-1)!;
  g.wall = [...pool.filter((t) => t < 136), ...pool.filter((t) => t >= 136)];
  g.interrupted = true;
  assertTiles(g);
  return g;
}

export function assertTiles(g: Game) {
  const actual = [
    ...g.wall,
    ...g.deadWall,
    ...g.players.flatMap((p) => [
      ...p.hand,
      ...p.bonuses,
      ...p.melds.flatMap((m) => m.tiles),
      ...p.discards.filter((d) => !d.claimed).map((d) => d.tile),
    ]),
  ].sort((a, b) => a - b);
  expect(actual).toEqual(
    makeWall(g.rules.preset, 0, g.rules.sgFlowers, g.rules.sgAnimals).sort((a, b) => a - b),
  );
}
