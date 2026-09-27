import type { WallSetup } from '../shared/types';
import { remainingWallSlots, wallSides } from '../shared/wall';
export const TILE_SIZE = { width: 0.29, depth: 0.42, height: 0.16 };
export function seatPoint(x: number, z: number, relative: number) {
  const a = (-relative * Math.PI) / 2;
  return { x: x * Math.cos(a) - z * Math.sin(a), z: x * Math.sin(a) + z * Math.cos(a), r: -a };
}
export function wallPosition(slot: number, total: number, me: number) {
  const sides = wallSides(total);
  let seat = 0,
    n = slot;
  while (n >= sides[seat] * 2 && seat < 3) {
    n -= sides[seat] * 2;
    seat++;
  }
  const col = Math.floor(n / 2),
    layer = n % 2;
  return {
    ...seatPoint(
      ((sides[seat] - 1) / 2) * 0.32 - col * 0.32,
      3.45,
      (((4 - seat) % 4) - me + 4) % 4,
    ),
    y: 0.095 + (1 - layer) * 0.17,
  };
}
export function wallLayout(setup: WallSetup, me: number) {
  return remainingWallSlots(setup).map((slot) => ({
    slot,
    ...wallPosition(slot, setup.total, me),
  }));
}
