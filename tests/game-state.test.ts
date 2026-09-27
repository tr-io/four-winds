import { describe, expect, it } from 'vitest';
import {
  applyAction,
  gameView,
  legalActions,
  nextHand,
  resolveClaims,
  startGame,
  tickGame,
} from '../server/engine';
import { kind } from '../shared/tiles';
import type { Game, Preset } from '../shared/types';
import { assertTiles, scenario, seededGame, TEST_SEED } from './fixtures/game-state';

const submit = (g: Game, seat: number, id: string, now = 1200) =>
  applyAction(g, seat, g.decision, id, now);
const discardKind = (g: Game, seat: number, k: number) =>
  submit(g, seat, `discard:${g.players[seat].hand.find((t) => kind(t) === k)!}`);
const passWindow = (g: Game) => {
  if (g.claim) resolveClaims(g, g.claim.deadline, true);
};

describe(`individual game states (seed ${TEST_SEED})`, () => {
  it.each(['mcr', 'riichi', 'singapore'] as Preset[])(
    '[start] %s requires four seats, gives East 14 tiles, and opens only East actions',
    (preset) => {
      const g = seededGame(preset);
      expect(() => startGame(g.rules, g.players.slice(1), TEST_SEED, 1000)).toThrow('Four seats');
      expect(g.phase).toBe('playing');
      expect(g.handNumber).toBe(1);
      expect(g.turn).toBe(g.dealer);
      expect(g.players.map((p) => p.hand.length)).toEqual([14, 13, 13, 13]);
      expect(legalActions(g, 0).filter((a) => a.kind === 'discard')).toHaveLength(14);
      for (const seat of [1, 2, 3]) expect(legalActions(g, seat)).toEqual([]);
      expect(g.turnDeadline).toBe(1000 + g.rules.turnSeconds * 1000);
      assertTiles(g);
    },
  );
  it('[draw] discarding transfers one tile to the river, then passing draws exactly once for the next seat', () => {
    const g = scenario({ 0: '5m', 1: '55m' });
    const drawn = g.wall[0],
      wall = g.wall.length,
      decision = g.decision;
    discardKind(g, 0, 4);
    expect(g.phase).toBe('claim');
    expect(g.players[0].hand).toHaveLength(13);
    expect(g.players[0].discards).toHaveLength(1);
    expect(g.wall).toHaveLength(wall);
    passWindow(g);
    expect(g.turn).toBe(1);
    expect(g.players[1].drawn).toBe(drawn);
    expect(g.players[1].hand).toHaveLength(14);
    expect(g.wall).toHaveLength(wall - 1);
    expect(g.decision).toBeGreaterThan(decision);
    const snapshot = structuredClone(g);
    resolveClaims(g, 99999, true);
    expect(g).toEqual(snapshot);
    assertTiles(g);
  });
  it.each(['pung', 'chow'] as const)(
    '[%s] moves the exact claimed tiles into an exposed meld without drawing',
    (action) => {
      const seat = action === 'chow' ? 1 : 2;
      const g = scenario({
        0: action === 'chow' ? '3m' : '5m',
        [seat]: action === 'chow' ? '12m' : '55m',
      });
      const wall = [...g.wall];
      discardKind(g, 0, action === 'chow' ? 2 : 4);
      const offered = g.claim!.tile;
      const call = legalActions(g, seat).find((a) => a.kind === action)!;
      expect(call).toBeDefined();
      submit(g, seat, call.id, 1300);
      passWindow(g);
      const p = g.players[seat];
      expect(g.turn).toBe(seat);
      expect(g.phase).toBe('playing');
      expect(p.melds[0]).toMatchObject({ kind: action, from: 0, concealed: false });
      expect([...p.melds[0].tiles].sort()).toEqual([...call.tiles, offered].sort());
      expect(p.hand).toHaveLength(11);
      expect(p.drawn).toBeNull();
      expect(g.wall).toEqual(wall);
      expect(g.players[0].discards[0].claimed).toBe(true);
      expect(legalActions(g, seat).some((a) => a.kind === 'win')).toBe(false);
      expect(legalActions(g, seat).filter((a) => a.kind === 'discard')).toHaveLength(11);
      assertTiles(g);
    },
  );
  it('[kong] an open kong takes a replacement from the back and still requires a discard', () => {
    const g = scenario({ 0: '5m', 2: '555m' });
    // Put a normal tile at the back, so this isolates kong replacement from flower replacement.
    const normal = g.wall.findIndex((t) => t < 136);
    g.wall.push(g.wall.splice(normal, 1)[0]);
    const replacement = g.wall.at(-1),
      wall = g.wall.length;
    discardKind(g, 0, 4);
    submit(g, 2, 'kong', 1300);
    passWindow(g);
    expect(g.kongCount).toBe(1);
    expect(g.turn).toBe(2);
    expect(g.players[2].melds[0].tiles).toHaveLength(4);
    expect(g.players[2].hand).toHaveLength(11);
    expect(g.players[2].drawn).toBe(replacement);
    expect(g.players[2].drawSource).toBe('kong');
    expect(g.wall).toHaveLength(wall - 1);
    assertTiles(g);
  });
  it('[chow-to-win] chow, mandatory discard, later draw, and win form a complete playable sequence', () => {
    const g = scenario({ 0: '3m', 1: '129m456p789s11z23p' });
    discardKind(g, 0, 2);
    const chow = legalActions(g, 1).find(
      (a) => a.kind === 'chow' && a.tiles.every((t) => [0, 1].includes(kind(t))),
    )!;
    submit(g, 1, chow.id, 1300);
    passWindow(g);
    expect(g.players[1].melds[0].kind).toBe('chow');
    discardKind(g, 1, 8);
    passWindow(g);
    for (const seat of [2, 3]) {
      expect(g.turn).toBe(seat);
      submit(g, seat, `discard:${g.players[seat].drawn}`, g.turnDeadline - 1);
      passWindow(g);
    }
    // Select a still-unseen 1-dot as the next live draw, preserving physical ownership.
    const winningIndex = g.wall.findIndex((t) => kind(t) === 9);
    expect(winningIndex).toBeGreaterThanOrEqual(0);
    g.wall.unshift(g.wall.splice(winningIndex, 1)[0]);
    submit(g, 0, `discard:${g.players[0].drawn}`, g.turnDeadline - 1);
    passWindow(g);
    expect(g.turn).toBe(1);
    expect(legalActions(g, 1).some((a) => a.kind === 'win')).toBe(true);
    submit(g, 1, 'win', g.turnDeadline - 1);
    expect(g.result).toMatchObject({ winner: 1, from: null });
    expect(g.result!.hands[1]).toHaveLength(11);
    expect(g.players[1].melds[0].tiles).toHaveLength(3);
    assertTiles(g);
  });
  it('[win] a hand containing a chow, pung, and kong settles once and retains every tile', () => {
    const g = scenario({ 0: '11144p' }, 0, {
      0: [
        { kind: 'chow', text: '123m' },
        { kind: 'pung', text: '111z' },
        { kind: 'kong', text: '7777s' },
      ],
    });
    const before = g.players.map((p) => p.points),
      decision = g.decision;
    submit(g, 0, 'win');
    expect(g.phase).toBe('ended');
    expect(g.result!.hands[0]).toHaveLength(5);
    expect(g.players[0].melds.flatMap((m) => m.tiles)).toHaveLength(10);
    expect(g.result!.deltas.reduce((a, b) => a + b, 0)).toBe(0);
    expect(g.result!.deltas[0]).toBeGreaterThan(0);
    expect(g.players.map((p, i) => p.points - before[i])).toEqual(g.result!.deltas);
    const settled = g.players.map((p) => p.points);
    expect(() => applyAction(g, 0, decision, 'win', 1300)).toThrow();
    expect(g.players.map((p) => p.points)).toEqual(settled);
    assertTiles(g);
  });
  it('[exhaustion] the last live tile is drawn before the hand ends; ready advances and clears hand state', () => {
    const g = scenario({ 0: '5m', 1: '55m' });
    // Move unused tiles into public discards to preserve the complete physical set.
    const remaining = g.wall.splice(1);
    g.players[3].bonuses.push(...remaining.filter((tile) => tile >= 136));
    g.players[3].discards.push(
      ...remaining
        .filter((tile) => tile < 136)
        .map((tile) => ({ tile, claimed: false, riichi: false })),
    );
    discardKind(g, 0, 4);
    passWindow(g);
    expect(g.phase).toBe('playing');
    expect(g.wall).toHaveLength(0);
    submit(g, 1, `discard:${g.players[1].drawn}`, g.turnDeadline - 1);
    passWindow(g);
    expect(g.result).toMatchObject({ winner: null, reason: 'Exhaustive draw' });
    expect(g.phase).toBe('ended');
    assertTiles(g);
    const balances = g.players.map((p) => p.points);
    g.players.forEach((p) => (p.ready = true));
    tickGame(g, g.turnDeadline - 1);
    expect(g.phase).toBe('playing');
    expect(g.handNumber).toBe(2);
    expect(g.dealer).toBe(1);
    expect(g.result).toBeNull();
    expect(g.players.every((p) => !p.discards.length && !p.melds.length && !p.ready)).toBe(true);
    expect(g.players.map((p) => p.points)).toEqual(balances);
    expect(() => nextHand(g)).toThrow();
    assertTiles(g);
  });
  it('[privacy] opponents receive counts and public melds but never private draws or the wall', () => {
    const g = scenario({ 0: '11144p' }, 0, {
      0: [
        { kind: 'chow', text: '123m' },
        { kind: 'pung', text: '111z' },
        { kind: 'kong', text: '7777s' },
      ],
    });
    for (let seat = 0; seat < 4; seat++) {
      const view = gameView(g, seat);
      expect(view.players[seat].hand).toEqual(g.players[seat].hand);
      for (let other = 0; other < 4; other++)
        if (other !== seat) {
          expect(view.players[other].hand).toEqual([]);
          expect(view.players[other].drawn).toBeNull();
          expect(view.players[other].melds).toEqual(g.players[other].melds);
        }
      for (const secret of ['wall', 'deadWall', 'seed', 'ura'])
        expect(view).not.toHaveProperty(secret);
    }
  });
});
