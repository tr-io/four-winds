import { describe, expect, it } from 'vitest';
import { reconcileOrder, moveTile } from '../client/hand-rack';
import { summarizeDiscards } from '../client/discards';

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
