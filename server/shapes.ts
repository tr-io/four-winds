import { counts, kind, suit } from '../shared/tiles';
import type { Tile } from '../shared/types';
export type Shape = { pair: number; sets: { kind: 'chow' | 'pung'; tile: number }[] };
export function standardShapes(tiles: Tile[], meldCount = 0): Shape[] {
  if (tiles.length !== 14 - meldCount * 3) return [];
  const c = counts(tiles),
    results: Shape[] = [];
  const walk = (pair: number, sets: Shape['sets']) => {
    const i = c.findIndex((n) => n > 0);
    if (i === -1) {
      if (sets.length + meldCount === 4) results.push({ pair, sets: [...sets] });
      return;
    }
    if (c[i] >= 3) {
      c[i] -= 3;
      walk(pair, [...sets, { kind: 'pung', tile: i }]);
      c[i] += 3;
    }
    if (i < 27 && i % 9 <= 6 && c[i + 1] && c[i + 2]) {
      c[i]--;
      c[i + 1]--;
      c[i + 2]--;
      walk(pair, [...sets, { kind: 'chow', tile: i }]);
      c[i]++;
      c[i + 1]++;
      c[i + 2]++;
    }
  };
  for (let i = 0; i < 34; i++)
    if (c[i] >= 2) {
      c[i] -= 2;
      walk(i, []);
      c[i] += 2;
    }
  return results;
}
export const ORPHANS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
export function isOrphans(tiles: Tile[]) {
  const c = counts(tiles);
  return (
    tiles.length === 14 &&
    ORPHANS.every((k) => c[k]) &&
    tiles.every((t) => ORPHANS.includes(kind(t)))
  );
}
export function isSevenPairs(tiles: Tile[], quadAsTwo = false) {
  const c = counts(tiles);
  return tiles.length === 14 && c.every((n) => n === 0 || n === 2 || (quadAsTwo && n === 4));
}
export function knittedShape(tiles: Tile[], meldCount: number) {
  if (tiles.length !== 14 - meldCount * 3) return false;
  const c = counts(tiles);
  for (const perm of [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ]) {
    const knitted = perm.flatMap((s, i) => [i, i + 3, i + 6].map((n) => s * 9 + n));
    if (
      meldCount === 0 &&
      tiles.every((t) => kind(t) >= 27 || knitted.includes(kind(t))) &&
      c.every((n) => n <= 1)
    )
      return true;
    if (meldCount <= 1 && knitted.every((k) => c[k])) {
      const rest = [...tiles];
      for (const k of knitted)
        rest.splice(
          rest.findIndex((t) => kind(t) === k),
          1,
        );
      // The knitted nine tiles count as three fixed sets.
      if (standardShapes(rest, meldCount + 3).length) return true;
    }
  }
  return false;
}
export function isComplete(tiles: Tile[], meldCount: number, sevenPairs: boolean, mcr = false) {
  return (
    standardShapes(tiles, meldCount).length > 0 ||
    (meldCount === 0 && (isOrphans(tiles) || (sevenPairs && isSevenPairs(tiles, mcr)))) ||
    (mcr && knittedShape(tiles, meldCount))
  );
}
export function structuralWaits(
  tiles: Tile[],
  meldCount: number,
  sevenPairs: boolean,
  mcr = false,
): number[] {
  const c = counts(tiles);
  return Array.from({ length: 34 }, (_, k) => k).filter(
    (k) => c[k] < 4 && isComplete([...tiles, k * 4], meldCount, sevenPairs, mcr),
  );
}
export function fullFlush(tiles: Tile[]) {
  return (
    tiles.length > 0 && tiles.every((t) => kind(t) < 27 && suit(kind(t)) === suit(kind(tiles[0])))
  );
}
