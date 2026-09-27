import Majiang from '@kobalab/majiang-core';
import { Hand, Janpai, Mentsu, McrUtil, CompleteInfo, COMPLETE_TYPE } from '@masaue/jan-js-lib';
import { counts, kind, rank, suit, tileCode } from '../shared/tiles';
import type { Game, Meld, Player, Score, Tile } from '../shared/types';
import {
  fullFlush,
  isComplete,
  isOrphans,
  isSevenPairs,
  standardShapes,
  structuralWaits,
} from './shapes';

type JanpaiID = ConstructorParameters<typeof Janpai>[0];
type Wind = NonNullable<ConstructorParameters<typeof CompleteInfo>[2]>;
const wind = ['東', '南', '西', '北'] as Wind[];
const honorIds = [...wind, '白', '發', '中'];
const janpai = (t: Tile) =>
  new Janpai(
    (kind(t) < 27
      ? `${rank(kind(t))}${['m', 'p', 's'][suit(kind(t))]}`
      : honorIds[kind(t) - 27]) as JanpaiID,
  );
export const seatWind = (game: Game, seat: number) => (seat - game.dealer + 4) % 4;
export const closed = (p: Player) => p.melds.every((m) => m.concealed);
const direction = (seat: number, from: number) => ['', '+', '=', '-'][(from - seat + 4) % 4];

export function coreHand(hand: Tile[], melds: Meld[], seat: number) {
  const h = Majiang.Shoupai.fromString(hand.map(tileCode).join(''));
  h._fulou = melds.map((m) => {
    const k = kind(m.tiles[0]),
      s = ['m', 'p', 's', 'z'][suit(k)];
    const ns = [...m.tiles].sort((a, b) => a - b).map((t) => rank(kind(t)));
    if (m.concealed) return s + ns.join('');
    const d = direction(seat, m.from) || '-';
    if (m.kind === 'chow') {
      const taken = m.tiles[m.tiles.length - 1];
      const at = ns.indexOf(rank(kind(taken)));
      return s + ns.map((n, i) => `${n}${i === at ? d : ''}`).join('');
    }
    return s + (m.added ? ns.slice(0, 3).join('') + d + ns[3] : ns.join('') + d);
  });
  // A concealed hand excludes the winning draw. fromString may assume a draw
  // from tile count without considering fixed melds; explicitly clear it here.
  h._zimo = null;
  return h;
}
const YAKU_NAMES: Record<string, string> = {
  立直: 'Riichi',
  ダブル立直: 'Double riichi',
  一発: 'Ippatsu',
  門前清自摸和: 'Closed self-draw',
  門前清自模和: 'Closed self-draw',
  断幺九: 'All simples',
  平和: 'Pinfu',
  一盃口: 'Pure double sequence',
  '役牌 白': 'White dragon',
  '役牌 發': 'Green dragon',
  '役牌 中': 'Red dragon',
  '自風 東': 'Seat wind · East',
  '自風 南': 'Seat wind · South',
  '自風 西': 'Seat wind · West',
  '自風 北': 'Seat wind · North',
  '場風 東': 'Round wind · East',
  '場風 南': 'Round wind · South',
  '場風 西': 'Round wind · West',
  '場風 北': 'Round wind · North',
  海底摸月: 'Last tile draw',
  河底撈魚: 'Last discard',
  嶺上開花: 'Kong replacement win',
  槍槓: 'Robbing a kong',
  七対子: 'Seven pairs',
  対々和: 'All triplets',
  三暗刻: 'Three concealed triplets',
  三槓子: 'Three kongs',
  三色同刻: 'Triple pung',
  三色同順: 'Mixed triple sequence',
  一気通貫: 'Pure straight',
  混全帯幺九: 'Outside hand',
  純全帯幺九: 'Pure outside hand',
  混老頭: 'All terminals and honors',
  小三元: 'Little three dragons',
  混一色: 'Half flush',
  清一色: 'Full flush',
  二盃口: 'Twice pure double sequence',
  国士無双: 'Thirteen orphans',
  四暗刻: 'Four concealed triplets',
  大三元: 'Big three dragons',
  小四喜: 'Little four winds',
  大四喜: 'Big four winds',
  字一色: 'All honors',
  清老頭: 'All terminals',
  緑一色: 'All green',
  九蓮宝燈: 'Nine gates',
  四槓子: 'Four kongs',
  天和: 'Heavenly hand',
  地和: 'Earthly hand',
  ドラ: 'Dora',
  裏ドラ: 'Ura dora',
  赤ドラ: 'Red dora',
};
export function scoreHand(
  game: Game,
  seat: number,
  winning: Tile,
  from: number | null,
  robbing = false,
): Score | null {
  const p = game.players[seat],
    rules = game.rules;
  const self = from === null;
  const hand = [...p.hand];
  if (self) {
    const index = hand.indexOf(winning);
    if (index < 0) return null;
    hand.splice(index, 1);
  }
  const completed = [...hand, winning],
    all = [...completed, ...p.melds.flatMap((m) => m.tiles)];
  const complete = isComplete(completed, p.melds.length, rules.sevenPairs, rules.preset === 'mcr');
  if (rules.preset === 'singapore')
    return singaporeScore(game, seat, completed, winning, from, robbing, complete);
  if (!complete) return null;
  if (rules.preset === 'mcr') {
    const h = Object.assign(new Hand(hand.map(janpai)), { allowSevenPairs: rules.sevenPairs });
    for (const m of p.melds) {
      const t = janpai(Math.min(...m.tiles));
      h.fix(
        m.kind === 'chow'
          ? Mentsu.createChowMentsu(t)
          : m.kind === 'pung'
            ? Mentsu.createPungMentsu(t)
            : Mentsu.createKongMentsu(t, m.concealed),
      );
    }
    const lastWall = game.wall.length <= game.reserve;
    const replacement = self && p.drawSource === 'kong';
    const type = robbing
      ? COMPLETE_TYPE.ROBBING_A_KONG
      : self
        ? lastWall && replacement
          ? COMPLETE_TYPE.FINAL_DRAW_AND_WIN_ON_KONG
          : replacement
            ? COMPLETE_TYPE.WIN_ON_KONG
            : lastWall
              ? COMPLETE_TYPE.FINAL_DRAW
              : COMPLETE_TYPE.DRAW
        : lastWall
          ? COMPLETE_TYPE.FINAL_DISCARD
          : COMPLETE_TYPE.DISCARD;
    const publicCopies = game.players.reduce(
      (n, x) =>
        n +
        x.discards.filter((d) => !d.claimed && kind(d.tile) === kind(winning) && d.tile !== winning)
          .length +
        x.melds.flatMap((m) => m.tiles).filter((t) => kind(t) === kind(winning) && t !== winning)
          .length,
      0,
    );
    const result = McrUtil.complete(
      h,
      new CompleteInfo(
        janpai(winning),
        publicCopies === 3,
        wind[game.round],
        wind[seatWind(game, seat)],
        type,
      ),
    );
    let patterns = result.yakuList.map((y) => ({
      name: y.englishName.replace('Cncealed', 'Concealed'),
      value: y.point as number,
    }));
    patterns = addHouseBonuses(game, seat, all, completed, self, patterns);
    const base = patterns.reduce((n, x) => n + x.value, 0);
    if (base < rules.minimum) return null;
    if (p.bonuses.length) patterns.push({ name: 'Flowers & seasons', value: p.bonuses.length });
    const value = patterns.reduce((n, x) => n + x.value, 0);
    const payments = game.players.map((_, i) =>
      i === seat ? 0 : -(8 + (self || i === from ? value : 0)),
    );
    payments[seat] = -payments.reduce((a, b) => a + b, 0);
    return {
      unit: 'fan',
      value,
      patterns,
      payments: payments.map((n) => n * rules.scoreMultiplier),
    };
  }
  const h = coreHand(hand, p.melds, seat);
  if (self) h.zimo(tileCode(winning), false);
  const result = Majiang.Util.hule(
    h,
    self ? null : tileCode(winning) + direction(seat, from!),
    Majiang.Util.hule_param({
      rule: Majiang.rule({
        七対子あり: rules.sevenPairs,
        クイタンあり: rules.openTanyao,
        連風牌は2符: true,
        切り上げ満貫あり: rules.kiriage,
        役満の複合あり: false,
        ダブル役満あり: false,
        数え役満あり: false,
        役満パオあり: false,
        赤牌: { m: 0, p: 0, s: 0 },
      }),
      menfeng: seatWind(game, seat),
      zhuangfeng: game.round,
      lizhi: p.riichi,
      yifa: p.ippatsu,
      qianggang: robbing,
      lingshang: self && p.drawSource === 'kong',
      haidi: game.wall.length === 0 && !(self && p.drawSource === 'kong') ? (self ? 1 : 2) : 0,
      tianhu: self && !p.hasDiscarded && !game.interrupted ? (seat === game.dealer ? 1 : 2) : 0,
      baopai: game.dora.map(tileCode),
      fubaopai:
        p.riichi && rules.uraDora ? game.ura.slice(0, game.dora.length).map(tileCode) : undefined,
      changbang: game.honba,
      lizhibang: game.riichiPot,
    }),
  );
  const renhou = !self && !p.hasDrawn && !game.interrupted && seat !== game.dealer;
  if (!result?.hupai?.length && !renhou) return null; // Dora cannot establish a yaku.
  let patterns =
    result?.hupai?.map((y) => ({
      name: YAKU_NAMES[y.name] || y.name,
      value: typeof y.fanshu === 'number' ? y.fanshu : 13,
    })) || [];
  let value = result?.damanguan ? 13 : result?.fanshu || 0;
  let payments = Array<number>(4).fill(0);
  if (result?.fenpei)
    for (let i = 0; i < 4; i++) payments[(game.dealer + i) % 4] = result.fenpei[i];
  // EMA Renhou is an exclusive five-han alternative, choose the more valuable result.
  if (renhou && (!result?.defen || result.defen < 8000)) {
    patterns = [{ name: 'Renhou · blessing of man', value: 5 }];
    value = 5;
    payments = riichiPayments(game, seat, from, 2000);
  }
  if (value < rules.minimum) return null;
  // Responsibility payment for the final exposed dragon/wind set, including
  // previously declared concealed kongs (EMA June 2026 annotation).
  if (result?.damanguan) {
    const target = patterns.some((x) => x.name === 'Big three dragons')
      ? [31, 32, 33]
      : patterns.some((x) => x.name === 'Big four winds')
        ? [27, 28, 29, 30]
        : [];
    let seen = new Set<number>(),
      liable: number | null = null;
    for (const m of p.melds)
      if (m.kind !== 'chow' && target.includes(kind(m.tiles[0]))) {
        seen.add(kind(m.tiles[0]));
        if (seen.size === target.length && !m.concealed) liable = m.from;
      }
    if (liable !== null) {
      const amount = seat === game.dealer ? 48000 : 32000;
      payments = [0, 0, 0, 0];
      if (self || from === liable) payments[liable] = -(amount + game.honba * 300);
      else {
        payments[liable] = -amount / 2;
        payments[from!] = -amount / 2 - game.honba * 300;
      }
      payments[seat] = amount + game.honba * 300 + game.riichiPot * 1000;
    }
  }
  // Custom bonuses are flat point transfers, applied after official han/fu scoring.
  const house = housePatterns(game, seat, all, completed, self);
  for (const bonus of house)
    for (let i = 0; i < 4; i++)
      if (i !== seat && (self || i === from)) {
        payments[i] -= bonus.value;
        payments[seat] += bonus.value;
      }
  patterns.push(...house.map((x) => ({ name: `${x.name} · points`, value: x.value })));
  return {
    unit: 'han',
    value,
    fu: result?.fu,
    patterns,
    payments: payments.map((n) => n * rules.scoreMultiplier),
  };
}
function riichiPayments(game: Game, seat: number, from: number | null, base: number): number[] {
  const pay = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++)
    if (i !== seat && (from === null || from === i))
      pay[i] = -(
        Math.ceil(
          (base *
            (from !== null
              ? seat === game.dealer
                ? 6
                : 4
              : i === game.dealer || seat === game.dealer
                ? 2
                : 1)) /
            100,
        ) *
          100 +
        game.honba * (from === null ? 100 : 300)
      );
  pay[seat] = -pay.reduce((a, b) => a + b, 0) + game.riichiPot * 1000;
  return pay;
}
function housePatterns(game: Game, seat: number, all: Tile[], completed: Tile[], self: boolean) {
  const p = game.players[seat];
  return game.rules.houseBonuses
    .filter((b) =>
      b.condition === 'self-draw'
        ? self
        : b.condition === 'closed'
          ? closed(p)
          : b.condition === 'full-flush'
            ? fullFlush(all)
            : standardShapes(completed, p.melds.length).some((s) =>
                s.sets.every((m) => m.kind === 'pung'),
              ) && p.melds.every((m) => m.kind !== 'chow'),
    )
    .map((b) => ({ name: b.name, value: b.points }));
}
function addHouseBonuses(
  game: Game,
  seat: number,
  all: Tile[],
  completed: Tile[],
  self: boolean,
  patterns: Score['patterns'],
) {
  return [...patterns, ...housePatterns(game, seat, all, completed, self)];
}

export function singaporeSpecial(p: Player, completed: Tile[]) {
  const all = [...completed, ...p.melds.flatMap((m) => m.tiles)],
    c = counts(all);
  if ([27, 28, 29, 30].every((k) => c[k] >= 3)) return { name: 'All winds', value: 12 };
  if ([31, 32, 33].every((k) => c[k] >= 3)) return { name: 'All dragons', value: 7 };
  if (p.bonuses.filter((t) => t < 144).length === 8) return { name: 'Eight flowers', value: 12 };
  return null;
}
function singaporeScore(
  game: Game,
  seat: number,
  completed: Tile[],
  winning: Tile,
  from: number | null,
  robbing: boolean,
  complete: boolean,
): Score | null {
  const p = game.players[seat],
    rules = game.rules,
    self = from === null;
  const special = singaporeSpecial(p, completed);
  if (!complete && !special) return null;
  const all = [...completed, ...p.melds.flatMap((m) => m.tiles)],
    c = counts(all),
    sw = seatWind(game, seat);
  const orphan = p.melds.length === 0 && isOrphans(completed);
  let best: Score['patterns'] = special ? [special] : [];
  if (!special) {
    if (orphan) best = [{ name: 'Thirteen wonders', value: 8 }];
    else {
      const shapes = standardShapes(completed, p.melds.length);
      if (p.melds.length === 0 && rules.sevenPairs && isSevenPairs(completed))
        best = [{ name: 'Seven pairs · house rule', value: 2 }];
      for (const shape of shapes) {
        const sets = [
          ...shape.sets,
          ...p.melds.map((m) => ({
            kind: m.kind === 'chow' ? 'chow' : 'pung',
            tile: kind(m.tiles[0]),
          })),
        ];
        const patterns: Score['patterns'] = [];
        if (sets.every((m) => m.kind === 'pung')) patterns.push({ name: 'All pungs', value: 2 });
        if (sets.every((m) => m.kind === 'chow')) {
          const valuedPair =
            shape.pair >= 31 || shape.pair === 27 + sw || shape.pair === 27 + game.round;
          const before = [...completed];
          before.splice(before.indexOf(winning), 1);
          const multiWait = structuralWaits(before, p.melds.length, rules.sevenPairs).length > 1;
          if (!valuedPair && (self || multiWait))
            patterns.push({
              name: p.bonuses.length ? 'All chows' : 'Pure pinghu',
              value: p.bonuses.length ? 1 : 4,
            });
        }
        if (sets.filter((m) => m.kind === 'pung' && m.tile >= 31).length === 2 && shape.pair >= 31)
          patterns.push({ name: 'Little dragons', value: 1 });
        const littleWinds =
          sets.filter((m) => m.kind === 'pung' && m.tile >= 27 && m.tile <= 30).length === 3 &&
          shape.pair >= 27 &&
          shape.pair <= 30;
        if (littleWinds) patterns.push({ name: 'Little winds', value: 4 });
        for (const m of sets)
          if (m.kind === 'pung') {
            if (m.tile >= 31)
              patterns.push({
                name: ['White dragon', 'Green dragon', 'Red dragon'][m.tile - 31],
                value: 1,
              });
            if (!littleWinds && m.tile === 27 + sw) patterns.push({ name: 'Seat wind', value: 1 });
            if (!littleWinds && m.tile === 27 + game.round)
              patterns.push({ name: 'Round wind', value: 1 });
          }
        if (patterns.reduce((a, b) => a + b.value, 0) > best.reduce((a, b) => a + b.value, 0))
          best = patterns;
      }
      if (fullFlush(all) || all.every((t) => kind(t) >= 27))
        best.push({
          name: all.every((t) => kind(t) >= 27) ? 'All honors' : 'Full flush',
          value: 4,
        });
      else if (
        new Set(all.filter((t) => kind(t) < 27).map((t) => suit(kind(t)))).size === 1 &&
        all.some((t) => kind(t) >= 27)
      )
        best.push({ name: 'Half flush', value: 2 });
      if (all.every((t) => kind(t) < 27 && [1, 9].includes(rank(kind(t)))))
        best = [{ name: 'Pure terminals', value: 9 }];
      else if (all.every((t) => kind(t) >= 27 || [1, 9].includes(rank(kind(t)))))
        best.push({ name: 'Terminals and honors', value: 2 });
    }
    if (self && p.drawSource !== 'wall') best.push({ name: 'Replacement tile win', value: 1 });
    if (game.wall.length <= game.reserve) best.push({ name: 'Last tile', value: 1 });
    if (robbing) best.push({ name: 'Robbing a kong', value: 1 });
    const bonus = p.bonuses;
    const animalCount = bonus.filter((t) => t >= 144).length;
    if (animalCount)
      best.push({ name: 'Animals', value: animalCount + (animalCount === 4 ? 1 : 0) });
    const own = bonus.filter((t) => t < 144 && (t - 136) % 4 === sw).length;
    if (own) best.push({ name: 'Own flowers & seasons', value: own });
    for (const base of [136, 140])
      if ([0, 1, 2, 3].every((n) => bonus.includes(base + n)))
        best.push({ name: base === 136 ? 'Complete flowers' : 'Complete seasons', value: 1 });
    best = addHouseBonuses(game, seat, all, completed, self, best);
  }
  const total = best.reduce((a, b) => a + b.value, 0);
  if (total < rules.minimum) return null;
  const value = Math.min(total, rules.taiCap),
    unit = rules.sgBase * 2 ** value;
  const payments = game.players.map((_, i) =>
    i === seat ? 0 : -unit * (self || orphan ? rules.sgSelfDraw : i === from ? 2 : 1),
  );
  // Source's liability for feeding the last exposed dragon/wind set or a
  // pure-flush completion with at least three already exposed suit melds.
  const exposed = p.melds.filter((m) => !m.concealed);
  if (from !== null) {
    const k = kind(winning),
      specialFeed =
        special && c[k] >= 3 && (special.name === 'All dragons' ? k >= 31 : k >= 27 && k <= 30);
    const flushFeed = fullFlush(all) && exposed.length >= 3;
    const freshLate =
      game.wall.length - game.reserve < 4 &&
      game.players.every((x) => x.discards.every((d) => d.tile === winning || kind(d.tile) !== k));
    const exposedFan =
      exposed.reduce(
        (n, m) =>
          n +
          (kind(m.tiles[0]) >= 31 ? 1 : 0) +
          (kind(m.tiles[0]) === 27 + sw ? 1 : 0) +
          (kind(m.tiles[0]) === 27 + game.round ? 1 : 0),
        0,
      ) + p.bonuses.filter((t) => t >= 144 || (t - 136) % 4 === sw).length;
    const valueFeed =
      exposedFan >= rules.taiCap - 1 &&
      (k >= 31 || k === 27 + sw || k === 27 + game.round) &&
      c[k] >= 3;
    if (specialFeed || flushFeed || freshLate || valueFeed) {
      const sum = -payments.reduce((a, b) => a + b, 0);
      payments.fill(0);
      payments[from] = -sum;
    }
  }
  payments[seat] = -payments.reduce((a, b) => a + b, 0);
  return {
    unit: 'tai',
    value,
    patterns: best,
    payments: payments.map((n) => n * rules.scoreMultiplier),
  };
}
