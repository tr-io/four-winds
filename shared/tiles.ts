import type { Preset, Tile } from './types';
export const WINDS = ['East', 'South', 'West', 'North'];
export const WIND_SYMBOLS = ['東', '南', '西', '北'];
export const BONUS_NAMES = [
  'Plum',
  'Orchid',
  'Chrysanthemum',
  'Bamboo flower',
  'Spring',
  'Summer',
  'Autumn',
  'Winter',
  'Cat',
  'Rat',
  'Rooster',
  'Centipede',
];
export const kind = (tile: Tile) => (tile < 136 ? Math.floor(tile / 4) : tile - 102);
export const isBonus = (tile: Tile) => tile >= 136;
export const suit = (k: number) => (k < 27 ? Math.floor(k / 9) : 3);
export const rank = (k: number) => (k < 27 ? (k % 9) + 1 : k - 26);
export const tileName = (tile: Tile) => {
  if (isBonus(tile)) return BONUS_NAMES[tile - 136] || 'Bonus';
  const k = kind(tile);
  return k < 27
    ? `${rank(k)} ${['characters', 'circles', 'bamboo'][suit(k)]}`
    : [...WINDS, 'White dragon', 'Green dragon', 'Red dragon'][k - 27];
};
export const tileCode = (tile: Tile) => {
  const k = kind(tile);
  return `${['m', 'p', 's', 'z'][suit(k)]}${rank(k)}`;
};
export function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function makeWall(preset: Preset, seed: number, flowers = true, animals = true): Tile[] {
  const tiles = Array.from({ length: 136 }, (_, i) => i);
  if (preset === 'mcr' || (preset === 'singapore' && flowers))
    tiles.push(...Array.from({ length: 8 }, (_, i) => i + 136));
  if (preset === 'singapore' && animals) tiles.push(144, 145, 146, 147);
  const random = seededRandom(seed);
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return tiles;
}
export const sorted = (tiles: Tile[]) => [...tiles].sort((a, b) => a - b);
export function counts(tiles: Tile[]) {
  const c = Array<number>(34).fill(0);
  for (const t of tiles) if (!isBonus(t)) c[kind(t)]++;
  return c;
}
export function combinations<T>(values: T[], size: number): T[][] {
  if (!size) return [[]];
  return values.flatMap((v, i) =>
    combinations(values.slice(i + 1), size - 1).map((tail) => [v, ...tail]),
  );
}
