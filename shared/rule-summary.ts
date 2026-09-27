import { PRESETS } from './rules';
import type { Rules } from './types';

export const ruleLabels: Partial<Record<keyof Rules, string>> = {
  rounds: 'Winds',
  claimSeconds: 'Claim clock',
  turnSeconds: 'Turn clock',
  nextHandSeconds: 'Next hand clock',
  advanceWhenReady: 'Advance when all ready',
  hostCanAdvance: 'Host may advance',
  allowChow: 'Chow',
  allowKong: 'Kong',
  sevenPairs: 'Seven pairs',
  minimum: 'Minimum',
  points: 'Points',
  chips: 'Fake chips',
  startingPoints: 'Starting points',
  startingChips: 'Starting chips',
  chipsPerPoint: 'Chips / point',
  scoreMultiplier: 'Settlement ×',
  meldPriority: 'Call priority',
  dealerRepeats: 'Dealer repeats',
  openTanyao: 'Open tanyao',
  kiriage: 'Kiriage mangan',
  uraDora: 'Ura dora',
  taiCap: 'Tai cap',
  sgAnimals: 'Animals',
  sgFlowers: 'Flowers',
  sgInstantBonuses: 'Instant bonuses',
  sgBonusUnit: 'Bonus unit',
  sgBase: 'Base unit',
  sgSelfDraw: 'Self draw ×',
  houseBonuses: 'House bonuses',
};
const riichiKeys = ['openTanyao', 'kiriage', 'uraDora'];
const singaporeKeys = [
  'taiCap',
  'sgAnimals',
  'sgFlowers',
  'sgInstantBonuses',
  'sgBonusUnit',
  'sgBase',
  'sgSelfDraw',
];
export function activeRuleKeys(rules: Rules): (keyof Rules)[] {
  return (Object.keys(ruleLabels) as (keyof Rules)[]).filter(
    (key) =>
      (!riichiKeys.includes(key) || rules.preset === 'riichi') &&
      (!singaporeKeys.includes(key) || rules.preset === 'singapore') &&
      (key !== 'dealerRepeats' || rules.preset !== 'mcr'),
  );
}
export function ruleChanges(rules: Rules) {
  const base = PRESETS[rules.preset];
  return activeRuleKeys(rules).filter(
    (key) => JSON.stringify(rules[key]) !== JSON.stringify(base[key]),
  );
}
export function ruleValue(rules: Rules, key: keyof Rules): string {
  const value = rules[key];
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (key === 'houseBonuses')
    return (
      rules.houseBonuses.map((b) => `${b.name} +${b.points} (${b.condition})`).join(' · ') || 'None'
    );
  if (key === 'meldPriority')
    return {
      equal: 'Win › earliest meld',
      'pung-first': 'Win › pung / kong › chow',
      'chow-first': 'Win › chow › pung / kong',
    }[rules.meldPriority];
  if (key === 'nextHandSeconds') return value ? `${value}s` : 'Off';
  if (key === 'claimSeconds' || key === 'turnSeconds') return `${value}s`;
  if (key === 'minimum')
    return `${value} ${rules.preset === 'mcr' ? 'fan' : rules.preset === 'riichi' ? 'han' : 'tai'}`;
  return String(value);
}
