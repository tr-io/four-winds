import { describe, expect, it } from 'vitest';
import { PRESETS } from '../shared/rules';
import { rulesSchema } from '../shared/rules-schema';
import { kind, makeWall } from '../shared/tiles';
import type { Game, Preset, Rules, Tile } from '../shared/types';
import {
  applyAction,
  botAction,
  claimOptions,
  gameView,
  legalActions,
  newPlayer,
  nextHand,
  resolveClaims,
  startGame,
  tickGame,
} from '../server/engine';
import { scoreHand } from '../server/scoring';
import { isComplete, structuralWaits } from '../server/shapes';
export function tiles(text: string): Tile[] {
  const counts = Array(34).fill(0),
    out: Tile[] = [];
  for (const m of text.matchAll(/([1-9]+)([mpsz])/g)) {
    for (const n of m[1]) {
      const k = 'mpsz'.indexOf(m[2]) * 9 + Number(n) - 1;
      out.push(k * 4 + counts[k]++);
    }
  }
  return out;
}
function game(preset: Preset = 'singapore', seed = 123, rules: Partial<Rules> = {}): Game {
  const r = { ...structuredClone(PRESETS[preset]), ...rules };
  const g = startGame(
    r,
    [0, 1, 2, 3].map((i) =>
      newPlayer({ id: String(i), name: `P${i}`, avatar: 'jade', hands: 0, wins: 0 }, r),
    ),
    seed,
    1000,
  );
  return g;
}
function fixture(preset: Preset = 'riichi') {
  const g = game(preset);
  g.dora = [];
  g.ura = [];
  g.interrupted = true;
  g.wall = Array.from({ length: 70 }, (_, i) => i);
  for (const p of g.players) {
    p.hand = [];
    p.melds = [];
    p.bonuses = [];
    p.discards = [];
    p.riichi = 0;
    p.ippatsu = false;
    p.drawn = null;
    p.hasDiscarded = true;
    p.hasDrawn = true;
  }
  g.phase = 'playing';
  g.turn = 0;
  return g;
}
function assertConservation(g: Game) {
  const all = [
    ...g.wall,
    ...g.deadWall,
    ...g.players.flatMap((p) => [
      ...p.hand,
      ...p.bonuses,
      ...p.melds.flatMap((m) => m.tiles),
      ...p.discards.filter((d) => !d.claimed).map((d) => d.tile),
    ]),
  ];
  expect(new Set(all).size).toBe(all.length);
  expect(all.length).toBe(makeWall(g.rules.preset, 0, g.rules.sgFlowers, g.rules.sgAnimals).length);
}

describe('seeded tiles and hand dealing', () => {
  it.each(['mcr', 'riichi', 'singapore'] as Preset[])(
    '%s deals usable concealed tiles and conserves physical tiles',
    (p) => {
      for (let seed = 1; seed <= 25; seed++) {
        const g = game(p, seed);
        expect(g.players.map((p) => p.hand.length)).toEqual([14, 13, 13, 13]);
        expect(g.players.every((p) => p.hand.every((t) => t < 136))).toBe(true);
        assertConservation(g);
        expect(game(p, seed).players.map((p) => p.hand)).toEqual(g.players.map((p) => p.hand));
      }
    },
  );
  it('has 136 / 144 / 148 physical tiles and four of every normal kind', () => {
    expect(makeWall('riichi', 1)).toHaveLength(136);
    expect(makeWall('mcr', 1)).toHaveLength(144);
    expect(makeWall('singapore', 1)).toHaveLength(148);
    for (let k = 0; k < 34; k++)
      expect(makeWall('singapore', 7).filter((t) => kind(t) === k)).toHaveLength(4);
    expect(makeWall('mcr', 1)).not.toEqual(makeWall('mcr', 2));
  });
  it('Singapore tile options remove the corresponding actual wall tiles', () => {
    expect(makeWall('singapore', 1, false, true)).toHaveLength(140);
    expect(makeWall('singapore', 1, true, false)).toHaveLength(144);
    expect(makeWall('singapore', 1, false, false)).toHaveLength(136);
  });
  it('recognizes regular, seven-pair, orphan and knitted shapes with correct cardinality', () => {
    expect(isComplete(tiles('123456m123p789s55z'), 0, true)).toBe(true);
    expect(isComplete(tiles('112233m445566p77z'), 0, true)).toBe(true);
    expect(isComplete(tiles('19m19p19s12345677z'), 0, false)).toBe(true);
    expect(isComplete(tiles('147m258p369s12345z'), 0, true, true)).toBe(true);
    expect(isComplete(tiles('55z'), 0, true, true)).toBe(false);
  });
});

describe('server legal actions and privacy', () => {
  it('only offers chows to the following player, with every legal sequence', () => {
    const g = fixture('mcr');
    g.players[1].hand = tiles('123455m123p123s1z');
    g.players[2].hand = tiles('123455m123p123s1z');
    const tile = tiles('3m')[0] + 3;
    expect(claimOptions(g, 1, tile, 0).filter((a) => a.kind === 'chow')).toHaveLength(3);
    expect(claimOptions(g, 2, tile, 0).some((a) => a.kind === 'chow')).toBe(false);
    g.rules.allowChow = false;
    expect(claimOptions(g, 1, tile, 0).some((a) => a.kind === 'chow')).toBe(false);
  });
  it('rejects out-of-turn, forged, duplicate and stale actions', () => {
    const g = game();
    const decision = g.decision,
      t = g.players[0].hand[0];
    expect(() => applyAction(g, 1, decision, `discard:${t}`, 1100)).toThrow();
    expect(() => applyAction(g, 0, decision, 'discard:999', 1100)).toThrow();
    applyAction(g, 0, decision, `discard:${t}`, 1100);
    expect(() => applyAction(g, 0, decision, `discard:${t}`, 1100)).toThrow();
  });
  it('sends each player only their hand and their own claim choices', () => {
    const g = game();
    const view = gameView(g, 2);
    expect(view.players[2].hand).toEqual(g.players[2].hand);
    expect(view.players[0].hand).toEqual([]);
    expect(view.players[0].drawn).toBe(null);
    expect(view).not.toHaveProperty('wall');
    expect(view).not.toHaveProperty('seed');
    expect(view).not.toHaveProperty('deadWall');
    expect(view).not.toHaveProperty('ura');
    expect(view.players[1]).not.toHaveProperty('missedWins');
  });
  it('Riichi locks discards to the draw and blocks calls', () => {
    const g = game('riichi');
    g.players[0].riichi = 1;
    expect(
      legalActions(g, 0)
        .filter((a) => a.kind === 'discard')
        .map((a) => a.tiles[0]),
    ).toEqual([g.players[0].drawn]);
    g.players[1].hand = tiles('222m123456p789s1z');
    g.players[1].riichi = 1;
    expect(claimOptions(g, 1, 7, 0).every((a) => a.kind === 'win')).toBe(true);
  });
  it('Riichi furiten checks all waits against own discard history', () => {
    const g = fixture();
    g.turn = 0;
    const p = g.players[1];
    p.hand = tiles('123456m789p23s55p');
    p.riichi = 1;
    p.discards = [{ tile: 72, claimed: false, riichi: false }];
    expect(structuralWaits(p.hand, 0, true)).toEqual(expect.arrayContaining([18, 21]));
    expect(claimOptions(g, 1, 84, 0).some((a) => a.kind === 'win')).toBe(false);
    p.discards = [];
    expect(claimOptions(g, 1, 84, 0).some((a) => a.kind === 'win')).toBe(true);
    p.temporaryFuriten = true;
    expect(claimOptions(g, 1, 84, 0).some((a) => a.kind === 'win')).toBe(false);
  });
});

describe('claim arbitration', () => {
  function claims() {
    const g = fixture('mcr');
    g.rules.minimum = 0;
    const t = 16;
    g.players[0].hand = tiles('123456789m123p11z');
    g.players[0].drawn = g.players[0].hand.at(-1)!;
    g.players[1].hand = tiles('346789m123p123s1z');
    g.players[2].hand = tiles('55m124679p248s11z');
    g.players[3].hand = tiles('55m124679p248s11z');
    g.players[0].hand[0] = t;
    applyAction(g, 0, g.decision, `discard:${t}`, 1100);
    return g;
  }
  it('holds an early chow while a higher-priority pung is possible', () => {
    const g = claims(),
      id = g.decision;
    expect(g.phase).toBe('claim');
    const chow = legalActions(g, 1).find((a) => a.kind === 'chow')!;
    applyAction(g, 1, id, chow.id, 1200);
    expect(g.phase).toBe('claim');
    applyAction(g, 2, id, 'pung', 1300);
    expect(g.lastClaim?.seat).toBe(2);
    expect(g.turn).toBe(2);
    expect(g.players[2].melds[0].kind).toBe('pung');
  });
  it('awards equal-priority pungs by server arrival, independent of seat distance', () => {
    const g = claims();
    applyAction(g, 3, g.decision, 'pung', 1200);
    expect(g.lastClaim?.seat).toBe(3);
  });
  it('makes all melds equal when configured, so first chow wins immediately', () => {
    const g = claims();
    g.rules.meldPriority = 'equal';
    const chow = legalActions(g, 1).find((a) => a.kind === 'chow')!;
    applyAction(g, 1, g.decision, chow.id, 1200);
    expect(g.lastClaim?.seat).toBe(1);
  });
  it('expires unanswered high claims and then resolves an existing lower claim', () => {
    const g = claims();
    const c = legalActions(g, 1).find((a) => a.kind === 'chow')!;
    applyAction(g, 1, g.decision, c.id, 1200);
    resolveClaims(g, 10000);
    expect(g.turn).toBe(1);
    expect(g.lastClaim?.kind).toBe('chow');
  });
  it('rejects a click at the deadline and advances only once', () => {
    const g = claims(),
      id = g.decision;
    expect(() => applyAction(g, 3, id, 'pung', g.claim!.deadline)).toThrow('closed');
    const next = g.decision;
    resolveClaims(g, 30000, true);
    expect(g.decision).toBe(next);
  });
  it('a ron supersedes an earlier pung and pays exactly once', () => {
    const g = fixture('mcr');
    g.rules.minimum = 0;
    g.players[0].hand = tiles('123456789m123p11z');
    g.players[0].hand[0] = 16;
    g.players[1].hand = tiles('55m123456p789s11z');
    g.players[2].hand = tiles('123456m123p678s5m');
    applyAction(g, 0, g.decision, 'discard:16', 1100);
    const id = g.decision;
    applyAction(g, 1, id, 'pung', 1200);
    expect(g.phase).toBe('claim');
    applyAction(g, 2, id, 'win', 1300);
    expect(g.result?.winner).toBe(2);
    expect(g.result?.deltas.reduce((a, b) => a + b, 0)).toBe(0);
    expect(() => applyAction(g, 2, id, 'win', 1400)).toThrow();
  });
});

describe('scoring adapters', () => {
  it('scores a closed Riichi pinfu ron using EMA han/fu payments', () => {
    const g = fixture();
    const p = g.players[1];
    p.hand = tiles('123456m789p23s55p');
    p.riichi = 1;
    const s = scoreHand(g, 1, 72, 2)!;
    expect(s.value).toBe(2);
    expect(s.fu).toBe(30);
    expect(s.payments).toEqual([0, 2000, -2000, 0]);
  });
  it('does not allow dora alone to create a yaku', () => {
    const g = fixture();
    const p = g.players[1];
    p.hand = tiles('456m789p23s55z');
    p.melds = [{ kind: 'chow', tiles: tiles('123m'), from: 0, concealed: false }];
    g.dora = tiles('3m');
    expect(scoreHand(g, 1, 72, 2)).toBe(null);
  });
  it('MCR flowers cannot qualify an under-eight-fan hand', () => {
    const g = fixture('mcr');
    g.players[2].hand = tiles('56m345p789s11z');
    g.players[2].melds = [{ kind: 'kong', tiles: tiles('7777m'), concealed: true, from: 2 }];
    g.players[2].bonuses = [136, 137, 138, 139, 140, 141, 142, 143];
    expect(scoreHand(g, 2, 12, 1)).toBe(null);
    g.rules.minimum = 0;
    const s = scoreHand(g, 2, 12, 1)!;
    expect(s.value).toBe(12);
    expect(s.patterns.some((p) => p.name === 'Closed Wait')).toBe(false);
  });
  it('explains the reported complete MCR hand without counting its flowers toward eight fan', () => {
    const g = fixture('mcr');
    const p = g.players[0];
    p.hand = tiles('11789p222s');
    p.drawn = p.hand.at(-1)!;
    p.drawSource = 'wall';
    p.melds = [
      { kind: 'pung', tiles: tiles('111z'), concealed: false, from: 3 },
      { kind: 'chow', tiles: [20, 24, 16], concealed: false, from: 3 },
    ];
    p.bonuses = [138, 139, 136, 137];
    expect(isComplete(p.hand, 2, true)).toBe(true);
    expect(scoreHand(g, 0, p.drawn, null)).toBeNull();
    expect(legalActions(g, 0).some((a) => a.kind === 'win')).toBe(false);
    expect(gameView(g, 0).winAssessment).toMatchObject({ qualifying: 5, minimum: 8, flowers: 4 });
    expect(gameView(g, 1).winAssessment).toBeNull();
    // The existing minimum setting supports basic-hand house rules without changing MCR.
    g.rules.minimum = 0;
    expect(legalActions(g, 0).some((a) => a.kind === 'win')).toBe(true);
    expect(scoreHand(g, 0, p.drawn, null)?.value).toBe(9);
    expect(g.rules.minimum).toBe(0);
    applyAction(g, 0, g.decision, 'win', 1100);
    expect(g.result?.winner).toBe(0);
  });
  it('MCR terminal chows score 64 regardless of fixed meld order (upstream regression)', () => {
    const g = fixture('mcr'),
      p = g.players[1];
    p.hand = tiles('7855m');
    p.melds = [
      { kind: 'chow', tiles: tiles('123m'), from: 0, concealed: false },
      { kind: 'chow', tiles: tiles('123m'), from: 0, concealed: false },
      { kind: 'chow', tiles: tiles('789m'), from: 0, concealed: false },
    ];
    const a = scoreHand(g, 1, 32, 0)!;
    p.melds.reverse();
    const b = scoreHand(g, 1, 32, 0)!;
    expect(a.value).toBe(64);
    expect(b.value).toBe(64);
  });
  it('scores all Singapore animals, seat flowers, cap and zero-sum payouts', () => {
    const g = fixture('singapore'),
      p = g.players[1];
    p.hand = tiles('123456m123p789s5z');
    p.bonuses = [144, 145, 146, 147, 137];
    const s = scoreHand(g, 1, 125, 0)!;
    expect(s.value).toBe(5);
    expect(s.patterns).toContainEqual({ name: 'Animals', value: 5 });
    expect(s.payments).toEqual([-64, 128, -32, -32]);
  });
  it('Singapore special dragon sets can win without a conventional hand', () => {
    const g = fixture('singapore');
    g.players[1].hand = tiles('55566677z123m45p');
    expect(scoreHand(g, 1, 134, 0)?.value).toBe(5);
  });
  it('every house bonus and multiplier changes actual settlement', () => {
    const g = fixture('mcr');
    g.players[1].hand = tiles('1112223334445m');
    g.players[1].drawn = null;
    const baseline = scoreHand(g, 1, 17, 0)!;
    g.rules.houseBonuses = [{ name: 'Closed gift', condition: 'closed', points: 5 }];
    g.rules.scoreMultiplier = 2;
    const edited = scoreHand(g, 1, 17, 0)!;
    expect(edited.value).toBe(baseline.value + 5);
    expect(edited.payments[1]).toBe((baseline.payments[1] + 5) * 2);
  });
  it('fake chip transfer works independently of point-total tracking', () => {
    const g = fixture('mcr');
    g.rules.chips = true;
    g.rules.points = false;
    g.rules.chipsPerPoint = 0.25;
    const p = g.players[0];
    p.hand = tiles('11122233344455m');
    p.drawn = p.hand.at(-1)!;
    g.turn = 0;
    const old = g.players.map((p) => p.chips);
    applyAction(g, 0, g.decision, 'win', 1100);
    expect(g.players.map((p) => p.points)).toEqual([0, 0, 0, 0]);
    for (let i = 0; i < 4; i++)
      expect(g.players[i].chips - old[i]).toBe(g.result!.deltas[i] * 0.25);
  });
  it('validates bounded rules and rejects impossible minimum/cap settings', () => {
    expect(() => rulesSchema.parse({ ...PRESETS.singapore, taiCap: 3, minimum: 5 })).toThrow();
    expect(() => rulesSchema.parse({ ...PRESETS.mcr, claimSeconds: 1 })).toThrow();
    expect(() => rulesSchema.parse({ ...PRESETS.mcr, scoreMultiplier: Infinity })).toThrow();
  });
});

describe('seeded complete multiplayer hands', () => {
  it.each(['mcr', 'riichi', 'singapore'] as Preset[])(
    '%s resolves complete bot-driven hands, retaining all physical tiles',
    (preset) => {
      let wins = 0;
      for (let seed = 10; seed < 20; seed++) {
        const g = game(preset, seed);
        let steps = 0,
          now = 1100;
        while (!['ended', 'finished'].includes(g.phase) && steps++ < 400) {
          if (g.phase === 'claim') {
            const seats = Object.keys(g.claim!.options).map(Number);
            for (const seat of seats) {
              if (g.phase !== 'claim') break;
              const a = botAction(g, seat);
              if (a) applyAction(g, seat, g.decision, a, now++);
            }
            if (g.phase === 'claim') resolveClaims(g, now + 40000, true);
          } else {
            const a = botAction(g, g.turn);
            expect(a).not.toBeNull();
            applyAction(g, g.turn, g.decision, a!, now++);
          }
          assertConservation(g);
        }
        expect(steps).toBeLessThan(400);
        expect(g.result).not.toBeNull();
        if (g.result?.winner !== null) wins++;
        if (g.phase === 'ended') {
          const previous = g.handNumber;
          nextHand(g, now + 50000);
          expect(g.handNumber).toBe(previous + 1);
          assertConservation(g);
        }
      }
      expect(wins).toBeGreaterThan(0);
    },
    30000,
  );
  it('turn timeout discards automatically and cannot replay the turn', () => {
    const g = game('mcr');
    const tile = g.players[0].drawn!,
      id = g.decision;
    tickGame(g, g.turnDeadline + 1);
    expect(g.players[0].discards.at(-1)?.tile).toBe(tile);
    expect(g.decision).toBeGreaterThan(id);
  });
});

describe('replacement tiles, special wins, and match boundaries', () => {
  it('Riichi concealed kan replenishes the 14-tile dead wall and reveals a new indicator', () => {
    const g = fixture(),
      p = g.players[0];
    p.hand = tiles('1111m234567p789s1z');
    p.drawn = p.hand[3];
    g.deadWall = Array.from({ length: 14 }, (_, i) => 100 + i);
    g.dora = [g.deadWall[4]];
    const wall = g.wall.length,
      dead = g.deadWall.length;
    applyAction(g, 0, g.decision, 'concealed-kong:0', 1100);
    expect(g.kongCount).toBe(1);
    expect(g.deadWall).toHaveLength(dead);
    expect(g.wall).toHaveLength(wall - 1);
    expect(g.dora).toHaveLength(2);
    expect(p.drawn).toBe(100);
    expect(p.melds[0].tiles).toHaveLength(4);
    expect(p.drawSource).toBe('kong');
  });
  it('an added kong can be robbed before its replacement draw and indicator', () => {
    const g = fixture(),
      p = g.players[0];
    p.hand = [19, ...tiles('123p678s1122z')];
    p.drawn = 19;
    p.melds = [{ kind: 'pung', tiles: [16, 17, 18], from: 3, concealed: false }];
    g.players[1].hand = tiles('123p678s111z46m22p');
    const wall = g.wall.length;
    applyAction(g, 0, g.decision, 'added-kong:19', 1100);
    expect(g.claim?.reason).toBe('added-kong');
    expect(legalActions(g, 1).some((a) => a.kind === 'win')).toBe(true);
    applyAction(g, 1, g.decision, 'win', 1200);
    expect(g.result!.winner).toBe(1);
    expect(g.result!.score!.patterns.some((p) => p.name === 'Robbing a kong')).toBe(true);
    expect(g.kongCount).toBe(0);
    expect(g.wall).toHaveLength(wall);
    expect(p.melds[0].kind).toBe('pung');
    expect(p.hand).not.toContain(19);
  });
  it('a ron on the riichi declaration discard cancels its deposit', () => {
    const g = fixture(),
      p = g.players[0];
    p.hand = tiles('123456m789p23s55p1z');
    p.drawn = 108;
    g.players[1].hand = tiles('123456789s123p1z');
    expect(legalActions(g, 0).some((a) => a.id === 'riichi:108')).toBe(true);
    applyAction(g, 0, g.decision, 'riichi:108', 1100);
    expect(g.riichiPot).toBe(0);
    applyAction(g, 1, g.decision, 'win', 1200);
    expect(g.result!.deltas.reduce((a, b) => a + b, 0)).toBe(0);
    expect(p.points).toBe(30000 + g.result!.deltas[0]);
  });
  it('passing ron after riichi creates permanent furiten even after drawing', () => {
    const g = fixture();
    g.players[0].hand = [72, ...tiles('123456m789p1112z')];
    g.players[0].drawn = 72;
    const p = g.players[1];
    p.hand = tiles('123456m789p23s55p');
    p.riichi = 1;
    applyAction(g, 0, g.decision, 'discard:72', 1100);
    applyAction(g, 1, g.decision, 'pass', 1200);
    expect(p.riichiFuriten).toBe(true);
    expect(p.temporaryFuriten).toBe(false);
  });
  it('Singapore pays a new animal marriage once, and replaces from the back', () => {
    const g = fixture('singapore');
    g.players[0].hand = tiles('123456m789p123s11z');
    g.players[0].drawn = g.players[0].hand.at(-1)!;
    g.players[1].bonuses = [144];
    g.wall = [145, ...Array.from({ length: 20 }, (_, i) => 40 + i)];
    const replacement = g.wall.at(-1)!;
    applyAction(g, 0, g.decision, `discard:${g.players[0].hand[0]}`, 1100);
    expect(g.turn).toBe(1);
    expect(g.players[1].bonuses).toEqual([144, 145]);
    expect(g.players[1].drawn).toBe(replacement);
    expect(g.players.map((p) => p.points)).toEqual([-2, 6, -2, -2]);
  });
  it('a seven-flower holder steals the eighth and wins immediately', () => {
    const g = fixture('singapore');
    g.players[0].hand = tiles('123456m789p123s11z');
    g.players[0].drawn = g.players[0].hand.at(-1)!;
    g.players[2].bonuses = [136, 137, 138, 139, 140, 141, 142];
    g.wall = [143, ...Array.from({ length: 20 }, (_, i) => 40 + i)];
    applyAction(g, 0, g.decision, `discard:${g.players[0].hand[0]}`, 1100);
    expect(g.result!.winner).toBe(2);
    expect(g.result!.score!.patterns[0].name).toContain('Seven flowers');
    expect(g.players[2].bonuses).toHaveLength(8);
    expect(g.players[1].bonuses).not.toContain(143);
  });
  it('Singapore final tile ends a drawn hand without exposing a final discard', () => {
    const g = fixture('singapore');
    g.players[0].hand = tiles('147m258p369s12345z');
    g.players[0].drawn = g.players[0].hand.at(-1)!;
    g.wall = g.wall.slice(0, 15);
    expect(legalActions(g, 0).map((a) => a.id)).toContain('end-hand');
    expect(legalActions(g, 0).some((a) => a.kind === 'discard')).toBe(false);
    applyAction(g, 0, g.decision, 'end-hand', 1100);
    expect(g.players[0].discards).toHaveLength(0);
    expect(g.result!.winner).toBe(null);
  });
  it('turning off seven pairs still allows a valid four-set reading, without scoring pairs', () => {
    for (const preset of ['mcr', 'riichi'] as Preset[]) {
      const g = fixture(preset);
      g.rules.sevenPairs = false;
      g.rules.minimum = 0;
      g.players[1].hand = tiles('112233m445566p7z');
      const s = scoreHand(g, 1, 133, 0)!;
      expect(s).not.toBeNull();
      expect(s.patterns.some((p) => p.name === 'Seven pairs' || p.name === 'Seven Pairs')).toBe(
        false,
      );
    }
  });
  it('the last rotation finishes the match; ready cannot start an extra hand', () => {
    const g = fixture('mcr');
    g.rules.rounds = 1;
    g.rotation = 3;
    g.players[0].hand = tiles('11122233344455m');
    g.players[0].drawn = g.players[0].hand.at(-1)!;
    applyAction(g, 0, g.decision, 'win', 1100);
    expect(g.phase).toBe('finished');
    expect(() => nextHand(g, 2000)).toThrow();
  });
});

describe('configurable between-hand transitions', () => {
  it('uses the configured countdown and advances once at its deadline', () => {
    const g = fixture('singapore');
    g.rules.nextHandSeconds = 17;
    g.rules.advanceWhenReady = false;
    g.players[0].hand = tiles('111222333m444p55s');
    g.players[0].drawn = g.players[0].hand.at(-1)!;
    applyAction(g, 0, g.decision, 'win', 1100);
    expect(g.phase).toBe('ended');
    expect(g.turnDeadline).toBe(18100);
    tickGame(g, 18099);
    expect(g.handNumber).toBe(1);
    tickGame(g, 18100);
    expect(g.handNumber).toBe(2);
  });
  it('can advance when ready with no clock, and rejects configurations that can never advance', () => {
    const g = fixture('singapore');
    g.rules.nextHandSeconds = 0;
    g.players[0].hand = tiles('111222333m444p55s');
    g.players[0].drawn = g.players[0].hand.at(-1)!;
    applyAction(g, 0, g.decision, 'win', 1100);
    expect(g.turnDeadline).toBe(0);
    tickGame(g, 999999);
    expect(g.handNumber).toBe(1);
    g.players.forEach((p) => (p.ready = true));
    tickGame(g, 999999);
    expect(g.handNumber).toBe(2);
    expect(
      rulesSchema.safeParse({
        ...PRESETS.mcr,
        nextHandSeconds: 0,
        advanceWhenReady: false,
        hostCanAdvance: false,
      }).success,
    ).toBe(false);
    const old = { ...PRESETS.mcr } as Record<string, unknown>;
    delete old.nextHandSeconds;
    delete old.advanceWhenReady;
    delete old.hostCanAdvance;
    expect(rulesSchema.parse(old).nextHandSeconds).toBe(60);
  });
});
