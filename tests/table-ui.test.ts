import { describe, expect, it } from 'vitest';
import { reconcileOrder, moveTile } from '../client/hand-rack';
import { summarizeDiscards } from '../client/discards';
import { handInsight } from '../client/hand-insight';
import { ruleChanges } from '../shared/rule-summary';
import { PRESETS } from '../shared/rules';

it('describes concealed ingredients and declared melds without claiming scoring eligibility', () => {
  const insight = handInsight(
    [36, 37, 40, 44, 108, 109],
    [{ kind: 'pung', tiles: [48, 49, 50], concealed: false, from: 2 }],
  );
  expect(insight).toEqual({
    pairs: [36, 108],
    suits: [0, 7, 0, 2],
    route: 'One suit + honors',
    locked: 1,
    closed: false,
  });
  expect(handInsight([0, 36, 72], []).route).toBe('Mixed suits');
});
it('marks gameplay changes against the active preset, excluding unrelated variant fields', () => {
  expect(ruleChanges(PRESETS.mcr)).toEqual([]);
  expect(
    ruleChanges({
      ...PRESETS.mcr,
      name: 'Friendly',
      minimum: 0,
      sgAnimals: false,
      openTanyao: false,
    }),
  ).toEqual(['minimum']);
  expect(ruleChanges({ ...PRESETS.singapore, sgAnimals: false, chips: true })).toEqual([
    'chips',
    'sgAnimals',
  ]);
});

describe('local tile order', () => {
  it('keeps manual order as tiles are drawn, discarded, or moved into a meld', () => {
    expect(reconcileOrder([12, 0, 5, 4], [0, 4, 12, 80], 80)).toEqual([12, 0, 4, 80]);
    expect(reconcileOrder([], [80, 12, 0, 4], 12)).toEqual([0, 4, 80, 12]);
    expect(reconcileOrder([4, 4, 9, 0], [0, 4, 5], null)).toEqual([4, 0, 5]);
  });
  it('moves physical tiles without confusing identical faces or losing a tile', () => {
    const hand = [0, 1, 2, 36, 37];
    expect(moveTile(hand, 1, 4)).toEqual([0, 2, 36, 37, 1]);
    expect(moveTile(hand, 37, 0)).toEqual([37, 0, 1, 2, 36]);
    expect(moveTile(hand, 99, 0)).toEqual(hand);
    expect(hand).toEqual([0, 1, 2, 36, 37]);
  });
});

it('groups every discard by kind in suit order, including called tiles exactly once', () => {
  const discard = (tile: number, claimed = false) => ({ tile, claimed, riichi: false });
  const players = [
    { discards: [discard(123), discard(12), discard(36)] },
    { discards: [discard(14, true), discard(120)] },
    { discards: [discard(13)] },
    { discards: [discard(15)] },
  ];
  expect(summarizeDiscards(players)).toEqual([
    { tile: 12, count: 4, claimed: 1 },
    { tile: 36, count: 1, claimed: 0 },
    { tile: 120, count: 2, claimed: 0 },
  ]);
  expect(summarizeDiscards([{ discards: [] }])).toEqual([]);
});
