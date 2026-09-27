import { z } from 'zod';
import type { Preset, Rules } from './types';
const common = {
  rounds: 4,
  claimSeconds: 8,
  turnSeconds: 35,
  allowChow: true,
  allowKong: true,
  sevenPairs: true,
  points: true,
  chips: false,
  startingPoints: 0,
  startingChips: 1000,
  chipsPerPoint: 1,
  scoreMultiplier: 1,
  meldPriority: 'pung-first' as const,
  dealerRepeats: false,
  openTanyao: true,
  kiriage: true,
  uraDora: true,
  taiCap: 5,
  sgAnimals: true,
  sgFlowers: true,
  sgInstantBonuses: true,
  sgBonusUnit: 2,
  sgBase: 1,
  sgSelfDraw: 2,
  houseBonuses: [],
};
export const PRESETS: Record<Preset, Rules> = {
  mcr: { ...common, id: 'mcr', name: 'Chinese MCR', preset: 'mcr', minimum: 8 },
  riichi: {
    ...common,
    id: 'riichi',
    name: 'Japanese Riichi',
    preset: 'riichi',
    rounds: 2,
    minimum: 1,
    startingPoints: 30000,
    dealerRepeats: true,
    meldPriority: 'equal',
  },
  singapore: {
    ...common,
    id: 'singapore',
    name: 'Singapore',
    preset: 'singapore',
    minimum: 1,
    sevenPairs: false,
    dealerRepeats: true,
  },
};
export const PRESET_DETAILS = {
  mcr: {
    subtitle: 'The art of possibility',
    region: 'CHINESE OFFICIAL',
    description: '81 scoring patterns. A world of ways to win.',
    tiles: 144,
    minimum: '8 fan minimum',
    source: 'WMO · 2006 Competition Rules',
  },
  riichi: {
    subtitle: 'Every discard tells a story',
    region: 'JAPANESE',
    description: 'Declare riichi. Read the table. Find your moment.',
    tiles: 136,
    minimum: '1 yaku minimum',
    source: 'EMA · 2025 + June 2026 annotations',
  },
  singapore: {
    subtitle: 'A little more good fortune',
    region: 'SINGAPOREAN',
    description: 'Flowers, animals, and familiar table traditions.',
    tiles: 148,
    minimum: '1 tai minimum',
    source: 'SingaporeMahjong.com · Four Winds profile v1',
  },
};
export const rulesSchema = z
  .object({
    id: z.string().min(1).max(64),
    name: z.string().trim().min(1).max(40),
    preset: z.enum(['mcr', 'riichi', 'singapore']),
    rounds: z.number().int().min(1).max(4),
    claimSeconds: z.number().int().min(3).max(30),
    turnSeconds: z.number().int().min(10).max(120),
    allowChow: z.boolean(),
    allowKong: z.boolean(),
    sevenPairs: z.boolean(),
    minimum: z.number().int().min(0).max(88),
    points: z.boolean(),
    chips: z.boolean(),
    startingPoints: z.number().int().min(0).max(100000),
    startingChips: z.number().int().min(0).max(1000000),
    chipsPerPoint: z.number().min(0.001).max(1000),
    scoreMultiplier: z.number().int().min(1).max(10),
    meldPriority: z.enum(['pung-first', 'equal', 'chow-first']),
    dealerRepeats: z.boolean(),
    openTanyao: z.boolean(),
    kiriage: z.boolean(),
    uraDora: z.boolean(),
    taiCap: z.number().int().min(1).max(12),
    sgAnimals: z.boolean(),
    sgFlowers: z.boolean(),
    sgInstantBonuses: z.boolean(),
    sgBonusUnit: z.number().int().min(1).max(100),
    sgBase: z.number().int().min(1).max(100),
    sgSelfDraw: z.number().int().min(1).max(4),
    houseBonuses: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(30),
          condition: z.enum(['self-draw', 'closed', 'all-pungs', 'full-flush']),
          points: z.number().int().min(1).max(100),
        }),
      )
      .max(8),
  })
  .superRefine((r, ctx) => {
    if (r.preset === 'riichi' && r.minimum > 13)
      ctx.addIssue({ code: 'custom', message: 'Riichi minimum must be at most 13 han.' });
    if (r.preset === 'singapore' && r.minimum > r.taiCap)
      ctx.addIssue({ code: 'custom', message: 'Minimum tai cannot exceed the tai cap.' });
  });
