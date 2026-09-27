import { counts, kind } from '../shared/tiles';
import type { Game, HandAnalysis, WinningRoute } from '../shared/types';
import { scoreHand } from './scoring';
import { isComplete, ORPHANS, standardShapes } from './shapes';

type Candidate = { name: string; counts: number[]; cost: number };
const sum = (a: number[]) => a.reduce((n, v) => n + v, 0);
const cache = new WeakMap<Game, { decision: number; seats: Map<number, HandAnalysis> }>();

/** Bounded, private suggestions. Never inspect the wall, ura, or other concealed hands. */
export function analyzeHand(game: Game, seat: number): HandAnalysis {
  const cached = cache.get(game);
  if (cached?.decision === game.decision && cached.seats.has(seat)) return cached.seats.get(seat)!;
  if (!cached || cached.decision !== game.decision)
    cache.set(game, { decision: game.decision, seats: new Map() });
  const result: HandAnalysis = { decision: game.decision, handNumber: game.handNumber, routes: [] };
  if (game.phase === 'ended' || game.phase === 'finished') return result;
  const me = game.players[seat],
    own = counts(me.hand),
    targetSize = 14 - me.melds.length * 3;
  const publicTiles = new Set([
    ...game.dora,
    ...game.players.flatMap((p) => [
      ...p.melds.flatMap((m) => m.tiles),
      ...p.discards.filter((d) => !d.claimed).map((d) => d.tile),
    ]),
  ]);
  const capacity = Array.from(
    { length: 34 },
    (_, k) => 4 - [...publicTiles].filter((t) => kind(t) === k).length,
  );
  const cost = (c: number[]) => sum(c.map((n, k) => Math.max(0, n - own[k])));
  const candidates = new Map<string, Candidate>();
  const add = (name: string, c: number[]) => {
    if (sum(c) !== targetSize || c.some((n, k) => n > capacity[k])) return;
    const key = c.join(',');
    if (!candidates.has(key)) candidates.set(key, { name, counts: c, cost: cost(c) });
  };
  // Include every immediate completion (including knitted/special shapes supported by the scorer).
  const bases =
    me.hand.length === targetSize
      ? [...new Set(me.hand.map(kind))].map((k) => {
          const c = [...own];
          c[k]--;
          return c;
        })
      : [own];
  if (me.hand.length === targetSize) add('Current hand', [...own]);
  for (const base of bases)
    for (let k = 0; k < 34; k++) {
      const c = [...base];
      c[k]++;
      const tiles = c.flatMap((n, i) => Array.from({ length: n }, (_, copy) => i * 4 + copy));
      if (isComplete(tiles, me.melds.length, game.rules.sevenPairs, game.rules.preset === 'mcr'))
        add('Nearby completion', c);
    }
  // Beam search keeps the closest 64 partial shapes per family, not an exhaustive strategy solver.
  const beam = (
    name: string,
    allowed: (k: number) => boolean,
    pungsOnly = false,
    pairsOnly = false,
  ) => {
    if (
      me.melds.some(
        (m) => m.tiles.some((t) => !allowed(kind(t))) || (pungsOnly && m.kind === 'chow'),
      )
    )
      return;
    const sets: number[][] = [];
    for (let k = 0; k < 34; k++)
      if (allowed(k)) {
        if (capacity[k] >= (pairsOnly ? 2 : 3)) sets.push(Array(pairsOnly ? 2 : 3).fill(k));
        if (!pairsOnly && !pungsOnly && k < 27 && k % 9 <= 6 && allowed(k + 1) && allowed(k + 2))
          sets.push([k, k + 1, k + 2]);
      }
    let states = pairsOnly
      ? [{ c: Array<number>(34).fill(0), last: 0 }]
      : Array.from({ length: 34 }, (_, k) => k)
          .filter((k) => allowed(k) && capacity[k] >= 2)
          .map((k) => ({ c: Array.from({ length: 34 }, (_, i) => (i === k ? 2 : 0)), last: 0 }));
    const steps = pairsOnly ? 7 : 4 - me.melds.length;
    for (let depth = 0; depth < steps; depth++) {
      const next = new Map<string, { c: number[]; last: number }>();
      for (const state of states)
        for (let i = state.last; i < sets.length; i++) {
          const c = [...state.c];
          for (const k of sets[i]) c[k]++;
          if (
            c.some((n, k) => n > capacity[k]) ||
            (pairsOnly && game.rules.preset !== 'mcr' && c.some((n) => n > 2))
          )
            continue;
          const key = c.join(',');
          if (!next.has(key)) next.set(key, { c, last: i });
        }
      states = [...next.values()]
        .sort((a, b) => cost(a.c) - cost(b.c) || a.c.join(',').localeCompare(b.c.join(',')))
        .slice(0, 64);
    }
    for (const state of states.slice(0, 12)) add(name, state.c);
  };
  if (!me.riichi) {
    beam('Four sets + a pair', () => true);
    beam('All pungs', () => true, true);
    for (let suit = 0; suit < 3; suit++) {
      beam('Full flush', (k) => Math.floor(k / 9) === suit);
      beam('Half flush', (k) => k >= 27 || Math.floor(k / 9) === suit);
    }
    if (!me.melds.length) {
      if (game.rules.sevenPairs) beam('Seven pairs', () => true, false, true);
      for (const pair of ORPHANS)
        add(
          'Thirteen orphans',
          Array.from({ length: 34 }, (_, k) => (ORPHANS.includes(k) ? (k === pair ? 2 : 1) : 0)),
        );
    }
  }
  const ranked = [...candidates.values()].sort((a, b) => a.cost - b.cost).slice(0, 100);
  for (const candidate of ranked) {
    const c = candidate.counts;
    if (
      me.riichi &&
      (candidate.cost > 1 ||
        c.some((n, k) => n < own[k] - (me.drawn !== null && kind(me.drawn) === k ? 1 : 0)))
    )
      continue;
    const hand: number[] = [],
      needed: number[] = [],
      discard: number[] = [];
    for (let k = 0; k < 34; k++) {
      const retained = me.hand.filter((t) => kind(t) === k);
      hand.push(...retained.slice(0, c[k]));
      discard.push(...retained.slice(c[k]));
      const extras = Array.from({ length: 4 }, (_, i) => k * 4 + i).filter(
        (t) => !retained.includes(t) && !publicTiles.has(t),
      );
      const incoming = extras.slice(0, Math.max(0, c[k] - retained.length));
      needed.push(...incoming);
      hand.push(...incoming);
    }
    if (hand.length !== targetSize) continue;
    hand.sort((a, b) => a - b);
    const winning =
      needed.at(-1) ?? (me.drawn !== null && hand.includes(me.drawn) ? me.drawn : hand.at(-1)!);
    // Fixed ordinary self-draw scenario; no secret indicators, first-turn/last-tile/replacement awards.
    const scenario: Game = {
      ...game,
      wall: [0, 1, 2, 3, 4],
      reserve: 0,
      ura: [],
      interrupted: true,
      players: game.players.map((p, i) => ({
        ...p,
        hand: i === seat ? hand : [],
        drawn: i === seat ? winning : null,
        drawSource: 'wall',
        ippatsu: false,
        hasDrawn: true,
        hasDiscarded: true,
      })),
    };
    const score = scoreHand(scenario, seat, winning, null);
    if (!score) continue;
    const shape = standardShapes(hand, me.melds.length)[0];
    const pool = [...hand];
    const take = (ks: number[]) =>
      ks.map(
        (k) =>
          pool.splice(
            pool.findIndex((t) => kind(t) === k),
            1,
          )[0],
      );
    const groups: WinningRoute['groups'] = shape
      ? [
          ...shape.sets.map((s) => ({
            kind: s.kind,
            tiles: take(
              s.kind === 'chow' ? [s.tile, s.tile + 1, s.tile + 2] : [s.tile, s.tile, s.tile],
            ),
          })),
          { kind: 'pair', tiles: take([shape.pair, shape.pair]) },
        ]
      : [{ kind: 'special', tiles: hand }];
    result.routes.push({
      name: candidate.name,
      hand,
      needed,
      discard,
      groups,
      score,
      points: score.payments[seat],
    });
  }
  result.routes.sort((a, b) => a.needed.length - b.needed.length || b.points - a.points);
  // Keep varied scoring patterns rather than eight copies of the same plan.
  const signatures = new Set<string>();
  result.routes = result.routes
    .filter((route) => {
      const key =
        route.score.patterns
          .map((p) => p.name)
          .sort()
          .join('|') +
        ':' +
        route.needed.map(kind).join(',');
      if (signatures.has(key)) return false;
      signatures.add(key);
      return true;
    })
    .slice(0, 8);
  cache.get(game)!.seats.set(seat, result);
  return result;
}
