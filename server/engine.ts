import { randomInt } from 'node:crypto';
import Majiang from '@kobalab/majiang-core';
import { counts, isBonus, kind, makeWall, sorted, tileName } from '../shared/tiles';
import type {
  ClaimKind,
  Game,
  GameEvent,
  GameView,
  LegalAction,
  Player,
  Profile,
  PublicPlayer,
  Rules,
  Score,
  Tile,
} from '../shared/types';
import { closed, coreHand, scoreHand, seatWind, singaporeSpecial } from './scoring';
import { isOrphans, structuralWaits } from './shapes';

export function newPlayer(profile: Profile, rules: Rules, bot = false): Player {
  return {
    profile,
    bot,
    connected: !bot,
    ready: bot,
    hand: [],
    melds: [],
    bonuses: [],
    discards: [],
    points: rules.startingPoints,
    chips: rules.startingChips,
    riichi: 0,
    ippatsu: false,
    temporaryFuriten: false,
    riichiFuriten: false,
    drawn: null,
    drawSource: 'wall',
    hasDiscarded: false,
    hasDrawn: false,
    missedWins: [],
    missedPungs: [],
  };
}
export function event(
  g: Game,
  text: string,
  type: GameEvent['type'] = 'info',
  seat?: number,
  tile?: Tile,
  now = Date.now(),
) {
  g.events.push({ id: ++g.eventId, at: now, text, type, seat, tile });
  if (g.events.length > 120) g.events.shift();
}
export function startGame(rules: Rules, players: Player[], seed: number, now = Date.now()): Game {
  if (players.length !== 4) throw new Error('Four seats must be filled to start.');
  const g: Game = {
    rules: structuredClone(rules),
    seed,
    players,
    phase: 'playing',
    dealer: 0,
    round: 0,
    rotation: 0,
    handNumber: 0,
    turn: 0,
    decision: 0,
    turnDeadline: 0,
    wall: [],
    deadWall: [],
    reserve: 0,
    kongCount: 0,
    dora: [],
    ura: [],
    honba: 0,
    riichiPot: 0,
    claim: null,
    claimOrder: 0,
    lastClaim: null,
    result: null,
    events: [],
    eventId: 0,
    interrupted: false,
    forbiddenDiscards: [],
    riichiDeclaring: null,
  };
  for (const p of players) {
    p.points = rules.startingPoints;
    p.chips = rules.startingChips;
  }
  dealHand(g, now);
  return g;
}
function resetTurnFlags(p: Player) {
  p.temporaryFuriten = false;
  p.missedWins = [];
  p.missedPungs = [];
}
export function dealHand(g: Game, now = Date.now()) {
  g.handNumber++;
  g.wall = makeWall(
    g.rules.preset,
    (g.seed + Math.imul(g.handNumber, 2654435761)) >>> 0,
    g.rules.sgFlowers,
    g.rules.sgAnimals,
  );
  // Seed -1 selects a cryptographic production shuffle; nonnegative seeds are reproducible fixtures.
  if (g.seed === -1)
    for (let i = g.wall.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [g.wall[i], g.wall[j]] = [g.wall[j], g.wall[i]];
    }
  g.deadWall = [];
  g.dora = [];
  g.ura = [];
  g.kongCount = 0;
  g.claim = null;
  g.result = null;
  g.phase = 'playing';
  g.interrupted = false;
  g.lastClaim = null;
  g.forbiddenDiscards = [];
  g.riichiDeclaring = null;
  g.reserve = g.rules.preset === 'singapore' ? 15 : 0;
  if (g.rules.preset === 'riichi') {
    g.deadWall = g.wall.splice(-14);
    g.dora = [g.deadWall[4]];
    g.ura = [5, 7, 9, 11, 13].map((i) => g.deadWall[i]);
  }
  for (const p of g.players) {
    p.hand = [];
    p.melds = [];
    p.bonuses = [];
    p.discards = [];
    p.riichi = 0;
    p.ippatsu = false;
    p.riichiFuriten = false;
    p.drawn = null;
    p.drawSource = 'wall';
    p.hasDiscarded = false;
    p.hasDrawn = false;
    p.ready = p.bot;
    resetTurnFlags(p);
  }
  event(
    g,
    `Hand ${g.handNumber} · ${['East', 'South', 'West', 'North'][g.round]} round. ${g.players[g.dealer].profile.name} is East.`,
    'info',
    undefined,
    undefined,
    now,
  );
  // Deal thirteen usable tiles to each seat. Bonuses are exposed, replaced
  // from the back, and accounted for separately from the concealed hand.
  for (let n = 0; n < 13; n++)
    for (let offset = 0; offset < 4; offset++)
      takeTile(g, (g.dealer + offset) % 4, false, now, true);
  for (let seat = 0; seat < 4; seat++) if (checkFlowerWin(g, seat, now)) return;
  enterTurn(g, g.dealer, now, true);
}
function settle(g: Game, payments: number[]) {
  for (let i = 0; i < 4; i++) {
    if (g.rules.points) g.players[i].points += payments[i];
    if (g.rules.chips)
      g.players[i].chips =
        Math.round((g.players[i].chips + payments[i] * g.rules.chipsPerPoint) * 1000) / 1000;
  }
}
function bonusPayments(g: Game, seat: number, amount: number, label: string, now: number) {
  const pay = g.players
    .map((_, i) => (i === seat ? amount * 3 : -amount))
    .map((n) => n * g.rules.scoreMultiplier);
  settle(g, pay);
  event(
    g,
    `${g.players[seat].profile.name}: ${label} · +${amount * 3 * g.rules.scoreMultiplier} points`,
    'bonus',
    seat,
    undefined,
    now,
  );
}
function exposeBonus(g: Game, seat: number, tile: Tile, initial: boolean, now: number) {
  const p = g.players[seat];
  p.bonuses.push(tile);
  event(g, `${p.profile.name} revealed ${tileName(tile)}.`, 'bonus', seat, tile, now);
  if (g.rules.preset !== 'singapore') return;
  if (g.rules.sgInstantBonuses) {
    const b = p.bonuses,
      own = 136 + seatWind(g, seat),
      pairs = [
        [144, 145],
        [146, 147],
        [own, own + 4],
      ];
    for (const pair of pairs)
      if (pair.includes(tile) && pair.every((t) => b.includes(t)))
        bonusPayments(g, seat, g.rules.sgBonusUnit * (initial ? 2 : 1), 'bonus marriage', now);
    for (const base of [136, 140, 144])
      if (tile >= base && tile < base + 4 && [0, 1, 2, 3].every((n) => b.includes(base + n)))
        bonusPayments(g, seat, g.rules.sgBonusUnit * 2, 'complete bonus set', now);
  }
  if (!initial) checkFlowerWin(g, seat, now);
}
function checkFlowerWin(g: Game, seat: number, now: number): boolean {
  if (g.rules.preset !== 'singapore') return false;
  const flowers = g.players.map((p) => p.bonuses.filter((t) => t < 144));
  const eight = flowers.findIndex((ts) => ts.length === 8);
  if (eight >= 0) {
    flowerWin(g, eight, 'Eight flowers', 12, now);
    return true;
  }
  const seven = flowers.findIndex((ts) => ts.length === 7);
  if (seven >= 0) {
    const other = g.players.findIndex((_, i) => i !== seven && flowers[i].length > 0);
    if (other >= 0) {
      const tile = flowers[other][0];
      g.players[other].bonuses = g.players[other].bonuses.filter((t) => t !== tile);
      g.players[seven].bonuses.push(tile);
      event(
        g,
        `${g.players[seven].profile.name} takes the eighth flower.`,
        'bonus',
        seven,
        tile,
        now,
      );
      flowerWin(g, seven, 'Seven flowers · stole the eighth', 10, now);
      return true;
    }
  }
  return false;
}
function flowerWin(g: Game, seat: number, label: string, value: number, now: number) {
  const amount =
    g.rules.sgBase *
    2 ** Math.min(value, g.rules.taiCap) *
    g.rules.sgSelfDraw *
    g.rules.scoreMultiplier;
  const score: Score = {
    unit: 'tai',
    value: Math.min(value, g.rules.taiCap),
    patterns: [{ name: label, value }],
    payments: g.players.map((_, i) => (i === seat ? amount * 3 : -amount)),
  };
  finishWin(g, seat, null, score, now, label);
}
function takeTile(
  g: Game,
  seat: number,
  replacement: boolean,
  now: number,
  initial = false,
): Tile | null {
  const p = g.players[seat];
  let tile: Tile | undefined;
  if (replacement && g.rules.preset === 'riichi') {
    const index = g.kongCount - 1;
    if (index < 0 || index >= 4 || g.wall.length === 0) return null;
    tile = g.deadWall[index];
    g.deadWall[index] = g.wall.pop()!;
    g.dora.push(g.deadWall[4 + g.kongCount * 2]);
  } else {
    if (g.wall.length <= g.reserve) return null;
    tile = replacement ? g.wall.pop() : g.wall.shift();
  }
  p.drawSource = replacement ? 'kong' : 'wall';
  while (tile !== undefined && isBonus(tile)) {
    exposeBonus(g, seat, tile, initial, now);
    if (g.phase === 'ended' || g.phase === 'finished') return null;
    p.drawSource = 'bonus';
    if (g.wall.length <= g.reserve) return null;
    tile = g.wall.pop();
  }
  if (tile === undefined) return null;
  p.hand.push(tile);
  p.hand = sorted(p.hand);
  p.drawn = initial ? null : tile;
  if (!initial) {
    resetTurnFlags(p);
    p.hasDrawn = true;
    event(g, `${p.profile.name} drew a tile.`, 'draw', seat, undefined, now);
  }
  return tile;
}
function enterTurn(g: Game, seat: number, now: number, draw: boolean, replacement = false) {
  g.phase = 'playing';
  g.turn = seat;
  g.claim = null;
  g.decision++;
  g.turnDeadline = now + g.rules.turnSeconds * 1000;
  g.forbiddenDiscards = [];
  if (draw) {
    const tile = takeTile(g, seat, replacement, now);
    if (tile === null && g.phase === 'playing') finishDraw(g, now);
    else if (
      tile !== null &&
      g.rules.preset === 'singapore' &&
      singaporeSpecial(g.players[seat], g.players[seat].hand)
    ) {
      const score = scoreHand(g, seat, tile, null);
      if (score) finishWin(g, seat, null, score, now, 'Automatic Singapore special hand');
    }
  }
}
function playerWaits(g: Game, p: Player, hand = p.hand) {
  const c = counts([...hand, ...p.melds.flatMap((m) => m.tiles)]);
  return structuralWaits(hand, p.melds.length, g.rules.sevenPairs, g.rules.preset === 'mcr').filter(
    (k) => c[k] < 4,
  );
}
function canRon(g: Game, seat: number, tile: Tile, robbing = false) {
  const p = g.players[seat],
    k = kind(tile);
  if (g.rules.preset === 'riichi') {
    if (p.temporaryFuriten || p.riichiFuriten) return false;
    const waits = playerWaits(g, p);
    if (p.discards.some((d) => waits.includes(kind(d.tile)))) return false;
  }
  if (
    g.rules.preset === 'singapore' &&
    (p.missedWins.includes(k) || (p.discards.length > 0 && kind(p.discards.at(-1)!.tile) === k))
  )
    return false;
  return !!scoreHand(g, seat, tile, g.claim?.from ?? g.turn, robbing);
}
export function claimOptions(
  g: Game,
  seat: number,
  tile: Tile,
  from: number,
  reason: 'discard' | 'added-kong' | 'concealed-kong' = 'discard',
): LegalAction[] {
  if (seat === from) return [];
  const p = g.players[seat],
    k = kind(tile),
    same = p.hand.filter((t) => kind(t) === k),
    a: LegalAction[] = [];
  if (
    canRon(g, seat, tile, reason !== 'discard') &&
    (reason !== 'concealed-kong' ||
      (g.rules.preset === 'riichi' && p.melds.length === 0 && isOrphans([...p.hand, tile])))
  )
    a.push({
      id: 'win',
      kind: 'win',
      tiles: [tile],
      label: g.rules.preset === 'riichi' ? 'Ron · win' : 'Mahjong · win',
    });
  if (reason !== 'discard' || p.riichi || g.wall.length <= g.reserve) return a;
  const last = p.discards.at(-1),
    sgBlocked =
      g.rules.preset === 'singapore' &&
      (p.missedPungs.includes(k) || (last && kind(last.tile) === k));
  if (!sgBlocked && same.length >= 2)
    a.push({
      id: 'pung',
      kind: 'pung',
      tiles: same.slice(0, 2),
      label: g.rules.preset === 'riichi' ? 'Pon' : 'Pong / pung',
    });
  if (
    !sgBlocked &&
    same.length >= 3 &&
    g.rules.allowKong &&
    (g.rules.preset !== 'riichi' || g.kongCount < 4)
  )
    a.push({
      id: 'kong',
      kind: 'kong',
      tiles: same.slice(0, 3),
      label: g.rules.preset === 'riichi' ? 'Kan' : 'Kong',
    });
  if (
    g.rules.allowChow &&
    seat === (from + 1) % 4 &&
    k < 27 &&
    !(g.rules.preset === 'singapore' && last && kind(last.tile) === k)
  ) {
    for (let start = k - 2; start <= k; start++)
      if (
        start >= 0 &&
        start < 27 &&
        start % 9 <= 6 &&
        Math.floor(start / 9) === Math.floor(k / 9)
      ) {
        const needed = [start, start + 1, start + 2].filter((n) => n !== k),
          tiles = needed.map((n) => p.hand.find((t) => kind(t) === n));
        if (tiles.every((t) => t !== undefined)) {
          const remaining = p.hand.filter((t) => !tiles.includes(t));
          const forbidden = kuikae(k, start);
          if (g.rules.preset === 'riichi' && !remaining.some((t) => !forbidden.includes(kind(t))))
            continue;
          a.push({
            id: `chow:${start}`,
            kind: 'chow',
            tiles: tiles as Tile[],
            label: `${g.rules.preset === 'riichi' ? 'Chi' : 'Chow'} · ${(start % 9) + 1} ${(start % 9) + 2} ${(start % 9) + 3}`,
          });
        }
      }
  }
  return a;
}
function kuikae(k: number, start: number) {
  return [
    k,
    ...(k === start && start % 9 < 6 ? [start + 3] : []),
    ...(k === start + 2 && start % 9 > 0 ? [start - 1] : []),
  ];
}
export function legalActions(g: Game, seat: number): LegalAction[] {
  if (g.phase === 'claim' && g.claim) {
    if (g.claim.responses.some((r) => r.seat === seat)) return [];
    const options = g.claim.options[seat];
    return options?.length
      ? [...options, { id: 'pass', kind: 'pass', tiles: [], label: 'Pass' }]
      : [];
  }
  if (g.phase !== 'playing' || g.turn !== seat) return [];
  const p = g.players[seat],
    a: LegalAction[] = [];
  const winTile = p.drawn ?? p.hand[0];
  const lastSingapore = g.rules.preset === 'singapore' && g.wall.length <= g.reserve;
  if (
    winTile !== undefined &&
    (p.drawn !== null || (g.rules.preset === 'singapore' && singaporeSpecial(p, p.hand))) &&
    scoreHand(g, seat, winTile, null)
  )
    a.push({
      id: 'win',
      kind: 'win',
      tiles: [winTile],
      label: g.rules.preset === 'riichi' ? 'Tsumo · win' : 'Mahjong · win',
    });
  if (lastSingapore) a.push({ id: 'end-hand', kind: 'pass', tiles: [], label: 'End drawn hand' });
  for (const t of p.hand)
    if (!lastSingapore && (!p.riichi || t === p.drawn) && !g.forbiddenDiscards.includes(kind(t)))
      a.push({ id: `discard:${t}`, kind: 'discard', tiles: [t], label: `Discard ${tileName(t)}` });
  if (g.rules.preset === 'riichi' && !p.riichi && closed(p) && g.wall.length >= 1) {
    for (const t of p.hand)
      if (
        playerWaits(
          g,
          p,
          p.hand.filter((x) => x !== t),
        ).length
      )
        a.push({
          id: `riichi:${t}`,
          kind: 'riichi',
          tiles: [t],
          label: `Riichi · discard ${tileName(t)}`,
        });
  }
  if (
    g.rules.allowKong &&
    p.drawn !== null &&
    (g.wall.length > g.reserve || lastSingapore) &&
    (g.rules.preset !== 'riichi' || g.kongCount < 4)
  ) {
    const c = counts(p.hand);
    for (let k = 0; k < 34; k++)
      if (c[k] === 4) {
        const tiles = p.hand.filter((t) => kind(t) === k);
        if (p.riichi) {
          const h = coreHand(
            p.hand.filter((t) => t !== p.drawn),
            p.melds,
            seat,
          );
          h.zimo(
            `${['m', 'p', 's', 'z'][k < 27 ? Math.floor(k / 9) : 3]}${k < 27 ? (k % 9) + 1 : k - 26}`,
            false,
          );
          h._lizhi = true;
          if (
            kind(p.drawn) !== k ||
            !Majiang.Game.get_gang_mianzi(
              Majiang.rule({ リーチ後暗槓許可レベル: 1 }),
              h,
              null,
              g.wall.length,
              g.kongCount,
            ).length
          )
            continue;
        }
        a.push({
          id: `concealed-kong:${k}`,
          kind: 'concealed-kong',
          tiles,
          label: `Concealed ${g.rules.preset === 'riichi' ? 'kan' : 'kong'} · ${tileName(tiles[0])}`,
        });
      }
    if (!p.riichi)
      for (const m of p.melds)
        if (m.kind === 'pung') {
          const t = p.hand.find((t) => kind(t) === kind(m.tiles[0]));
          if (t !== undefined)
            a.push({
              id: `added-kong:${t}`,
              kind: 'added-kong',
              tiles: [t],
              label: `Extend ${tileName(t)} to kong`,
            });
        }
  }
  return a;
}
export function priority(g: Game, kind: string) {
  if (kind === 'win') return 100;
  if (kind === 'pass') return -1;
  if (g.rules.meldPriority === 'equal') return 1;
  return (kind === 'chow') === (g.rules.meldPriority === 'chow-first') ? 2 : 1;
}
function openClaims(
  g: Game,
  seat: number,
  tile: Tile,
  now: number,
  reason: 'discard' | 'added-kong' | 'concealed-kong' = 'discard',
  kongTiles?: Tile[],
) {
  g.decision++;
  g.phase = 'claim';
  g.claim = {
    id: g.decision,
    from: seat,
    tile,
    deadline: now + g.rules.claimSeconds * 1000,
    options: {},
    responses: [],
    reason,
    kongTiles,
  };
  for (let i = 0; i < 4; i++)
    if (i !== seat) {
      // Riichi temporary furiten also applies to a passed structural completion
      // with no yaku. Store a pass-only opportunity for that case.
      const options = claimOptions(g, i, tile, seat, reason);
      if (options.length) g.claim.options[i] = options;
      else if (g.rules.preset === 'riichi' && playerWaits(g, g.players[i]).includes(kind(tile)))
        markMissed(g, i, tile, false);
    }
  if (!Object.keys(g.claim.options).length) resolveClaims(g, now, true);
}
function markMissed(g: Game, seat: number, tile: Tile, pung: boolean) {
  const p = g.players[seat];
  if (pung) {
    p.missedPungs.push(kind(tile));
    return;
  }
  if (g.rules.preset === 'riichi') {
    p.temporaryFuriten = true;
    if (p.riichi) p.riichiFuriten = true;
  }
  if (g.rules.preset === 'singapore') p.missedWins.push(kind(tile));
}
function finalizeRiichi(g: Game, now: number) {
  if (g.riichiDeclaring === null) return;
  const seat = g.riichiDeclaring;
  g.riichiDeclaring = null;
  g.riichiPot++;
  const payments = [0, 0, 0, 0];
  payments[seat] = -1000 * g.rules.scoreMultiplier;
  settle(g, payments);
  event(g, `${g.players[seat].profile.name} placed a riichi stick.`, 'info', seat, undefined, now);
}
export function applyAction(
  g: Game,
  seat: number,
  decision: number,
  actionId: string,
  now = Date.now(),
  automatic = false,
) {
  if (!automatic && g.phase === 'playing' && now >= g.turnDeadline)
    throw new Error('Your turn has expired. The table is processing an automatic action.');
  if (decision !== g.decision)
    throw new Error('The table has moved on. Your hand has been refreshed.');
  if (g.phase === 'claim' && g.claim && now >= g.claim.deadline) {
    resolveClaims(g, now, true);
    throw new Error('The claim window has closed.');
  }
  const action = legalActions(g, seat).find((a) => a.id === actionId);
  if (!action) throw new Error('That action is not legal now.');
  if (g.phase === 'claim' && g.claim) {
    const c = g.claim;
    if (c.options[seat].some((a) => a.kind === 'win') && action.kind !== 'win')
      markMissed(g, seat, c.tile, false);
    if (
      c.options[seat].some((a) => a.kind === 'pung') &&
      !['pung', 'kong', 'win'].includes(action.kind)
    )
      markMissed(g, seat, c.tile, true);
    c.responses.push({ seat, action, order: ++g.claimOrder });
    resolveClaims(g, now);
    return;
  }
  const p = g.players[seat],
    tile = action.tiles[0];
  if (action.id === 'end-hand') {
    finishDraw(g, now);
    return;
  }
  if (action.kind === 'win') {
    const score = scoreHand(g, seat, tile, null);
    if (!score) throw new Error('No qualifying win.');
    finishWin(g, seat, null, score, now);
    return;
  }
  if (action.kind === 'concealed-kong' || action.kind === 'added-kong') {
    openClaims(g, seat, tile, now, action.kind, action.tiles);
    return;
  }
  if (action.kind === 'riichi') {
    p.riichi = !p.hasDiscarded && !g.interrupted ? 2 : 1;
    p.ippatsu = true;
    g.riichiDeclaring = seat;
  } else if (p.riichi) p.ippatsu = false;
  p.hand = p.hand.filter((t) => t !== tile);
  p.drawn = null;
  p.hasDiscarded = true;
  p.discards.push({ tile, claimed: false, riichi: action.kind === 'riichi' });
  event(
    g,
    `${p.profile.name} ${action.kind === 'riichi' ? 'declared riichi and ' : ''}discarded ${tileName(tile)}.`,
    'discard',
    seat,
    tile,
    now,
  );
  // Singapore's final live tile may win but is not offered as a discard.
  if (g.rules.preset === 'singapore' && g.wall.length <= g.reserve) {
    finishDraw(g, now);
    return;
  }
  openClaims(g, seat, tile, now);
}
export function resolveClaims(g: Game, now = Date.now(), force = false) {
  const c = g.claim;
  if (!c) return;
  const candidates = c.responses
    .filter((r) => r.action.kind !== 'pass')
    .sort((a, b) => priority(g, b.action.kind) - priority(g, a.action.kind) || a.order - b.order);
  const best = candidates[0];
  const unanswered = Object.keys(c.options)
    .map(Number)
    .filter((i) => !c.responses.some((r) => r.seat === i));
  const expired = force || now >= c.deadline;
  // Once received, a same-priority later click cannot win; only wait for
  // unanswered seats that can still submit a strictly higher-priority claim.
  if (
    !expired &&
    unanswered.length &&
    (!best ||
      unanswered.some((i) =>
        c.options[i].some((a) => priority(g, a.kind) > priority(g, best.action.kind)),
      ))
  )
    return;
  for (const seat of unanswered) {
    if (c.options[seat].some((a) => a.kind === 'win')) markMissed(g, seat, c.tile, false);
    if (c.options[seat].some((a) => a.kind === 'pung')) markMissed(g, seat, c.tile, true);
  }
  if (best?.action.kind === 'win') {
    const score = scoreHand(g, best.seat, c.tile, c.from, c.reason !== 'discard');
    if (!score) throw new Error('Invalid stored win.');
    if (c.reason === 'discard') g.players[c.from].discards.at(-1)!.claimed = true;
    else g.players[c.from].hand = g.players[c.from].hand.filter((t) => t !== c.tile);
    g.players[best.seat].hand.push(c.tile);
    g.lastClaim = { seat: best.seat, kind: 'win', tile: c.tile, at: now };
    finishWin(g, best.seat, c.from, score, now);
    return;
  }
  finalizeRiichi(g, now);
  if (c.reason !== 'discard') {
    completeKong(g, c.from, c.kongTiles!, c.reason === 'concealed-kong', now);
    return;
  }
  if (!best) {
    enterTurn(g, (c.from + 1) % 4, now, true);
    return;
  }
  const p = g.players[best.seat],
    a = best.action;
  p.hand = p.hand.filter((t) => !a.tiles.includes(t));
  p.drawn = null;
  resetTurnFlags(p);
  g.players[c.from].discards.at(-1)!.claimed = true;
  p.melds.push({
    kind: a.kind as 'pung' | 'kong' | 'chow',
    tiles: [...a.tiles, c.tile],
    from: c.from,
    concealed: false,
  });
  interruptIppatsu(g);
  g.lastClaim = { seat: best.seat, kind: a.kind, tile: c.tile, at: now };
  event(
    g,
    `${p.profile.name} won the ${a.kind} claim on ${tileName(c.tile)}.`,
    'claim',
    best.seat,
    c.tile,
    now,
  );
  if (g.rules.preset === 'singapore' && singaporeSpecial(p, p.hand)) {
    if (a.kind === 'kong') {
      g.kongCount++;
      if (g.rules.sgInstantBonuses)
        bonusPayments(g, best.seat, g.rules.sgBonusUnit, 'open kong', now);
    }
    const score = scoreHand(g, best.seat, c.tile, c.from);
    if (score) {
      finishWin(g, best.seat, c.from, score, now, 'Automatic Singapore special hand');
      return;
    }
  }
  if (a.kind === 'kong') {
    g.kongCount++;
    if (g.rules.preset === 'singapore' && g.rules.sgInstantBonuses)
      bonusPayments(g, best.seat, g.rules.sgBonusUnit, 'open kong', now);
    enterTurn(g, best.seat, now, true, true);
  } else {
    enterTurn(g, best.seat, now, false);
    if (g.rules.preset === 'riichi')
      g.forbiddenDiscards =
        a.kind === 'chow'
          ? kuikae(kind(c.tile), Math.min(...a.tiles.map(kind), kind(c.tile)))
          : [kind(c.tile)];
  }
}
function interruptIppatsu(g: Game) {
  g.interrupted = true;
  for (const p of g.players) p.ippatsu = false;
}
function completeKong(g: Game, seat: number, tiles: Tile[], concealed: boolean, now: number) {
  const p = g.players[seat];
  p.hand = p.hand.filter((t) => !tiles.includes(t));
  p.drawn = null;
  if (concealed) p.melds.push({ kind: 'kong', tiles, from: seat, concealed: true });
  else {
    const m = p.melds.find((m) => m.kind === 'pung' && kind(m.tiles[0]) === kind(tiles[0]))!;
    m.kind = 'kong';
    m.tiles.push(tiles[0]);
    m.added = true;
  }
  g.kongCount++;
  interruptIppatsu(g);
  g.lastClaim = {
    seat,
    kind: concealed ? 'concealed kong' : 'added kong',
    tile: tiles[0],
    at: now,
  };
  event(
    g,
    `${p.profile.name} declared a ${concealed ? 'concealed' : 'added'} kong.`,
    'claim',
    seat,
    tiles[0],
    now,
  );
  if (!concealed && g.rules.preset === 'singapore' && g.rules.sgInstantBonuses)
    bonusPayments(g, seat, g.rules.sgBonusUnit, 'added kong', now);
  enterTurn(g, seat, now, true, true);
}
function finishWin(
  g: Game,
  seat: number,
  from: number | null,
  score: Score,
  now: number,
  label?: string,
) {
  settle(g, score.payments);
  g.riichiPot = 0;
  g.riichiDeclaring = null;
  const repeat = g.rules.dealerRepeats && g.rules.preset !== 'singapore' && seat === g.dealer;
  g.result = {
    winner: seat,
    from,
    reason: label ?? (from === null ? 'Self-drawn mahjong' : 'Mahjong from discard'),
    score,
    deltas: score.payments,
    hands: g.players.map((p) => sorted(p.hand)),
    repeat,
  };
  event(
    g,
    `${g.players[seat].profile.name} wins · ${score.value} ${score.unit}${score.fu ? ` / ${score.fu} fu` : ''}.`,
    'win',
    seat,
    undefined,
    now,
  );
  finishHand(g, now);
}
function finishDraw(g: Game, now: number) {
  const tenpai = g.players.map((p, i) => (playerWaits(g, p).length ? i : -1)).filter((i) => i >= 0);
  const deltas = [0, 0, 0, 0];
  if (g.rules.preset === 'riichi' && tenpai.length > 0 && tenpai.length < 4)
    for (let i = 0; i < 4; i++)
      deltas[i] =
        (tenpai.includes(i) ? 3000 / tenpai.length : -3000 / (4 - tenpai.length)) *
        g.rules.scoreMultiplier;
  settle(g, deltas);
  const repeat =
    g.rules.dealerRepeats &&
    (g.rules.preset === 'riichi'
      ? tenpai.includes(g.dealer)
      : g.rules.preset === 'singapore'
        ? g.kongCount === 0
        : false);
  g.result = {
    winner: null,
    from: null,
    reason: 'Exhaustive draw',
    deltas,
    hands: g.players.map((p) => sorted(p.hand)),
    tenpai,
    repeat,
  };
  event(g, 'The wall is exhausted. Hand drawn.', 'info', undefined, undefined, now);
  finishHand(g, now);
}
function finishHand(g: Game, now: number) {
  g.claim = null;
  g.decision++;
  g.phase = 'ended';
  g.turnDeadline = now + 60000;
  for (const p of g.players) p.ready = p.bot;
  const lastRotation = g.rotation === 3 && g.round === g.rules.rounds - 1;
  if (lastRotation && !g.result!.repeat) {
    g.phase = 'finished';
    // Remaining riichi sticks go to the leader. Ties use initial seat order.
    if (g.riichiPot) {
      const top = g.players.reduce((a, p, i) => (p.points > g.players[a].points ? i : a), 0);
      const pay = [0, 0, 0, 0];
      pay[top] = g.riichiPot * 1000 * g.rules.scoreMultiplier;
      settle(g, pay);
      g.riichiPot = 0;
    }
    if (g.rules.preset === 'riichi') {
      const ranking = g.players
        .map((p, i) => ({ points: p.points, seat: i }))
        .sort((a, b) => b.points - a.points);
      const uma = [15000, 5000, -5000, -15000],
        pay = [0, 0, 0, 0];
      for (let i = 0; i < 4;) {
        let end = i + 1;
        while (end < 4 && ranking[end].points === ranking[i].points) end++;
        const award = uma.slice(i, end).reduce((a, b) => a + b, 0) / (end - i);
        for (let j = i; j < end; j++) pay[ranking[j].seat] = award * g.rules.scoreMultiplier;
        i = end;
      }
      settle(g, pay);
      event(g, 'Match complete. EMA placement points applied.', 'info', undefined, undefined, now);
    } else event(g, 'All winds played. The match is complete.', 'info', undefined, undefined, now);
  }
}
export function nextHand(g: Game, now = Date.now()) {
  if (g.phase !== 'ended') throw new Error('The hand is not ready to advance.');
  if (g.rules.preset === 'riichi')
    g.honba = g.result!.winner === null || g.result!.repeat ? g.honba + 1 : 0;
  if (!g.result!.repeat) {
    g.dealer = (g.dealer + 1) % 4;
    g.rotation++;
    if (g.rotation === 4) {
      g.rotation = 0;
      g.round++;
    }
  }
  dealHand(g, now);
}
export function publicPlayer(p: Player, visible = false): PublicPlayer {
  const { temporaryFuriten, riichiFuriten, missedWins, missedPungs, ...rest } = p;
  return {
    ...rest,
    hand: visible ? [...p.hand] : [],
    tileCount: p.hand.length,
    drawn: visible ? p.drawn : null,
  };
}
export function gameView(g: Game, seat: number): GameView {
  const { seed, wall, deadWall, players, claim, ura, forbiddenDiscards, ...rest } = g;
  return {
    ...rest,
    players: players.map((p, i) =>
      publicPlayer(p, i === seat || g.phase === 'ended' || g.phase === 'finished'),
    ),
    wallCount: Math.max(0, wall.length - g.reserve),
    seat,
    actions: legalActions(g, seat),
    winAssessment: assessMcrWin(g, seat),
    claim: claim
      ? {
          id: claim.id,
          from: claim.from,
          tile: claim.tile,
          deadline: claim.deadline,
          reason: claim.reason,
          responded: claim.responses.map((r) => r.seat),
          submitted: claim.responses.find((r) => r.seat === seat)?.action.kind,
        }
      : null,
  };
}
// Only describe the requesting player's complete hand. Qualification remains in scoreHand.
function assessMcrWin(g: Game, seat: number): GameView['winAssessment'] {
  if (g.rules.preset !== 'mcr') return null;
  const self = g.phase === 'playing' && g.turn === seat;
  const claim = g.phase === 'claim' && g.claim && g.claim.from !== seat ? g.claim : null;
  const tile = self ? g.players[seat].drawn : claim ? claim.tile : null;
  if (tile === null) return null;
  const score = scoreHand(
    { ...g, rules: { ...g.rules, minimum: 0 } },
    seat,
    tile,
    self ? null : claim!.from,
    !!claim && claim.reason !== 'discard',
  );
  if (!score) return null;
  const patterns = score.patterns.filter((p) => p.name !== 'Flowers & seasons');
  return {
    qualifying: patterns.reduce((n, p) => n + p.value, 0),
    minimum: g.rules.minimum,
    flowers: g.players[seat].bonuses.length,
    patterns,
  };
}
export function tickGame(g: Game, now = Date.now()): boolean {
  const before = g.decision + ':' + g.claimOrder + ':' + g.phase;
  if (g.phase === 'claim' && g.claim && now >= g.claim.deadline) resolveClaims(g, now, true);
  if (g.phase === 'playing' && now >= g.turnDeadline) {
    const actions = legalActions(g, g.turn),
      p = g.players[g.turn];
    const a =
      actions.find((a) => a.kind === 'win') ??
      actions.find((a) => a.id === `discard:${p.drawn}`) ??
      actions.find((a) => a.kind === 'discard') ??
      actions.find((a) => a.id === 'end-hand');
    if (a) applyAction(g, g.turn, g.decision, a.id, now, true);
  }
  if (g.phase === 'ended' && (g.players.every((p) => p.ready) || now >= g.turnDeadline))
    nextHand(g, now);
  return before !== g.decision + ':' + g.claimOrder + ':' + g.phase;
}
export function botAction(g: Game, seat: number): string | null {
  const actions = legalActions(g, seat);
  if (!actions.length) return null;
  const win = actions.find((a) => a.kind === 'win');
  if (win) return win.id;
  if (g.phase === 'claim') {
    // Calling only useful pairs avoids blindly opening every hand.
    const calls = actions.filter((a) => a.kind !== 'pass');
    const call =
      calls.find((a) => a.kind === 'kong') ??
      calls.find(
        (a) => a.kind === 'pung' && (kind(a.tiles[0]) >= 31 || g.rules.preset !== 'riichi'),
      );
    return call?.id ?? 'pass';
  }
  const special =
    actions.find((a) => a.kind === 'riichi') ??
    actions.find((a) => a.kind === 'concealed-kong' || a.kind === 'added-kong');
  if (special) return special.id;
  const p = g.players[seat],
    c = counts(p.hand);
  let best: LegalAction | undefined,
    bestScore = -Infinity;
  for (const a of actions.filter((a) => a.kind === 'discard')) {
    const k = kind(a.tiles[0]);
    // Prefer keeping pairs and nearby suited tiles. No hidden information.
    let isolation = c[k] === 1 ? 5 : c[k] === 2 ? -5 : -10;
    if (k < 27)
      for (const delta of [-2, -1, 1, 2]) {
        const neighbor = k + delta;
        if (neighbor >= 0 && neighbor < 27 && Math.floor(k / 9) === Math.floor(neighbor / 9))
          isolation -= c[neighbor] * (Math.abs(delta) === 1 ? 2 : 1);
      }
    else isolation += c[k] === 1 ? 2 : 0;
    if (isolation > bestScore) {
      best = a;
      bestScore = isolation;
    }
  }
  return best?.id ?? actions.find((a) => a.id === 'end-hand')?.id ?? null;
}
