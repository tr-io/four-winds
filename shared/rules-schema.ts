import { z } from 'zod';

export const rulesSchema = z
  .object({
    id: z.string().min(1).max(64),
    name: z.string().trim().min(1).max(40),
    preset: z.enum(['mcr', 'riichi', 'singapore']),
    rounds: z.number().int().min(1).max(4),
    claimSeconds: z.number().int().min(3).max(30),
    turnSeconds: z.number().int().min(10).max(120),
    nextHandSeconds: z.number().int().min(0).max(300).default(60),
    advanceWhenReady: z.boolean().default(true),
    hostCanAdvance: z.boolean().default(true),
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
    if (!r.nextHandSeconds && !r.advanceWhenReady && !r.hostCanAdvance)
      ctx.addIssue({
        code: 'custom',
        message: 'Enable a next-hand clock, ready advance, or host advance.',
      });
    if (r.preset === 'riichi' && r.minimum > 13)
      ctx.addIssue({ code: 'custom', message: 'Riichi minimum must be at most 13 han.' });
    if (r.preset === 'singapore' && r.minimum > r.taiCap)
      ctx.addIssue({ code: 'custom', message: 'Minimum tai cannot exceed the tai cap.' });
  });
