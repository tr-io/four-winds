import { expect, it } from 'vitest';
import { wallLayout, wallPosition, TILE_SIZE } from '../client/table-layout';
import { wallBreak, remainingWallSlots } from '../shared/wall';
import type { WallSetup } from '../shared/types';
const setup = (total = 144): WallSetup => ({
  total,
  dice: [
    [2, 3],
    [1, 4],
  ],
  ...wallBreak(total, 0, [
    [2, 3],
    [1, 4],
  ]),
  front: 0,
  back: 0,
  dead: 0,
  deal: [],
});
it('removes only the next wall slot and preserves every other physical position', () => {
  const a = setup();
  const before = wallLayout(a, 0);
  a.front++;
  const after = wallLayout(a, 0);
  const removed = before.filter((p) => !after.some((n) => n.slot === p.slot));
  expect(removed.map((p) => p.slot)).toEqual([a.breakIndex]);
  for (const p of after) expect(p).toEqual(before.find((n) => n.slot === p.slot));
});
it('keeps full wall corners separate for all tile sets and viewpoints', () => {
  for (const total of [136, 140, 144, 148])
    for (let me = 0; me < 4; me++) {
      const points = Array.from({ length: total / 2 }, (_, i) => wallPosition(i * 2, total, me));
      for (let i = 0; i < points.length; i++)
        for (let j = i + 1; j < points.length; j++) {
          const a = points[i],
            b = points[j],
            aw = Math.abs(Math.cos(a.r)) > 0.5 ? TILE_SIZE.width : TILE_SIZE.depth,
            ad = aw === TILE_SIZE.width ? TILE_SIZE.depth : TILE_SIZE.width,
            bw = Math.abs(Math.cos(b.r)) > 0.5 ? TILE_SIZE.width : TILE_SIZE.depth,
            bd = bw === TILE_SIZE.width ? TILE_SIZE.depth : TILE_SIZE.width;
          expect(
            Math.abs(a.x - b.x) >= (aw + bw) / 2 - 0.001 ||
              Math.abs(a.z - b.z) >= (ad + bd) / 2 - 0.001,
          ).toBe(true);
        }
    }
});
it('keeps dead-wall slots while drawing from both live ends', () => {
  const a = setup(136);
  a.dead = 14;
  a.back = 16;
  a.front = 53;
  const slots = remainingWallSlots(a);
  expect(slots).toHaveLength(81);
  expect(new Set(slots).size).toBe(slots.length);
});
it('walks adjacent stacks clockwise across every wall corner', () => {
  for (const total of [136, 140, 144, 148])
    for (let slot = 0; slot < total; slot += 2) {
      const a = wallPosition(slot, total, 0),
        b = wallPosition((slot + 2) % total, total, 0);
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(1.5);
    }
});
