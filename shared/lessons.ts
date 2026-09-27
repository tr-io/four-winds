import type { Preset, Score } from './types';
export const LESSON_TILES = [72, 73, 74, 76, 77, 78, 80, 81, 82, 84, 85, 86, 88, 89];
export const LESSON_HANDS: Record<Preset, number[]> = {
  mcr: LESSON_TILES,
  riichi: [0, 4, 8, 36, 40, 44, 72, 76, 80, 96, 100, 104, 52, 53],
  singapore: [0, 1, 2, 40, 41, 42, 80, 81, 82, 124, 125, 126, 108, 109],
};
export type LessonCheck = { valid: boolean; message: string; score?: Score };
export type LessonClaims = {
  discard: number;
  responses: { seat: number; name: string; kind: string; tiles: number[]; priority: number }[];
  winner: number;
  meldWinner: number;
  explanation: string;
};
export const LESSONS: Record<
  Preset,
  {
    title: string;
    subtitle: string;
    tiles: number;
    pung: string;
    chow: string;
    kong: string;
    win: string;
    minimum: string;
    bonus: string;
    scoring: string;
    claim: string;
    special: string;
    source: string;
  }
> = {
  mcr: {
    title: 'Chinese MCR',
    subtitle: 'Patterns & possibilities',
    tiles: 144,
    pung: 'Pung',
    chow: 'Chow',
    kong: 'Kong',
    win: 'Hu',
    minimum: '8 fan before flowers',
    bonus:
      'Eight flowers and seasons are exposed and replaced from the back. They add points only after the eight-fan minimum is met.',
    scoring:
      'A complete shape is only the beginning. Combine qualifying patterns to reach at least eight fan. Flowers cannot make an under-eight-fan hand legal.',
    claim: 'Win first, then pung or kong, then chow. Only the next player may chow.',
    special:
      'Seven pairs, thirteen orphans and knitted hands are also supported. The activity below teaches the ordinary four-set shape.',
    source: 'https://mahjong-europe.org/portal/images/docs/mcr_EN.pdf',
  },
  riichi: {
    title: 'Japanese Riichi',
    subtitle: 'Yaku & careful timing',
    tiles: 136,
    pung: 'Pon',
    chow: 'Chi',
    kong: 'Kan',
    win: 'Ron / Tsumo',
    minimum: 'At least one yaku',
    bonus:
      'No flowers or animals. A fourteen-tile dead wall holds kan replacements and dora indicators. Dora add han but cannot supply the required yaku.',
    scoring:
      'Riichi is one possible yaku, not a requirement for every win. Closed self-draw is another. Han and fu determine payment; furiten can prevent a discard win.',
    claim:
      'Win first. This EMA preset gives chi, pon and kan equal priority; the earliest valid server receipt wins. Only the next player may chi.',
    special:
      'Seven pairs and thirteen orphans are supported. A kan has four physical tiles, receives a replacement, and counts as one set.',
    source: 'https://mahjong-europe.org/portal/images/docs/Riichi-rules-2025-EN.pdf',
  },
  singapore: {
    title: 'Singapore',
    subtitle: 'Flowers, animals & tai',
    tiles: 148,
    pung: 'Pung',
    chow: 'Chow',
    kong: 'Kong',
    win: 'Mahjong',
    minimum: '1 tai · cap of 5',
    bonus:
      'Eight flowers and seasons plus cat, rat, rooster and centipede. Expose and replace from the back. Own flowers and animals can score tai; selected pairs and sets pay immediately.',
    scoring:
      'The default needs one tai and caps ordinary hand payments at five. Open and added kongs pay two points from each opponent: +6 to the caller, −2 to each other seat.',
    claim: 'Win first, then pung or kong, then chow. Only the next player may chow.',
    special:
      'The last fifteen wall tiles are reserved. Special flower, dragon and wind wins are supported. Seven pairs is off in this preset and can be enabled as a house rule.',
    source: 'https://singaporemahjong.com/rules/',
  },
};
