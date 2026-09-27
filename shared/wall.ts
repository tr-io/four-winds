import type { WallSetup } from './types';

/** Each side runs from its player's right to left; stacks are consumed top first. */
export function wallSides(total: number) {
  const stacks = total / 2;
  return Array.from(
    { length: 4 },
    (_, seat) => Math.floor(stacks / 4) + (seat < stacks % 4 ? 1 : 0),
  );
}
export function wallBreak(total: number, dealer: number, dice: number[][]) {
  const sums = dice.map((roll) => roll.reduce((a, b) => a + b, 0));
  const breakSeat = (dealer + sums[0] - 1) % 4;
  const breakStack = sums.reduce((a, b) => a + b, 0);
  const start =
    wallSides(total)
      .slice(0, (4 - breakSeat) % 4)
      .reduce((a, b) => a + b, 0) * 2;
  return { breakSeat, breakStack, breakIndex: (start + breakStack * 2) % total };
}
export function wallSlot(setup: WallSetup, offset: number) {
  return (setup.breakIndex + offset + setup.total) % setup.total;
}
export function remainingWallSlots(setup: WallSetup) {
  const live = Array.from({ length: Math.max(0, setup.total - setup.front - setup.back) }, (_, i) =>
    wallSlot(setup, setup.front + i),
  );
  return [
    ...live,
    ...Array.from({ length: setup.dead }, (_, i) => wallSlot(setup, setup.total - setup.dead + i)),
  ];
}
