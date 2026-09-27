/** Presentation only: theme preferences never enter a room or gameplay command. */
export const TABLE_THEMES = {
  'jade-night': {
    name: 'Jade Night',
    description: 'Forest, mint & a little lantern glow.',
    felt: 0x164d3d,
    frame: 0x342b23,
    trim: 0xa58754,
    sky: 0xffefd8,
    ground: 0x102a23,
    light: 2,
  },
  'porcelain-day': {
    name: 'Porcelain Day',
    description: 'Warm porcelain, navy & daylight.',
    felt: 0x387e76,
    frame: 0xc0a57e,
    trim: 0xe5cf9f,
    sky: 0xfffcf3,
    ground: 0x617d89,
    light: 2.6,
  },
} as const;
export type TableTheme = keyof typeof TABLE_THEMES;
export function isTableTheme(value: unknown): value is TableTheme {
  return value === 'jade-night' || value === 'porcelain-day';
}
export function themeStorageKey(player: string) {
  return `four-winds-theme:${player}`;
}
export function readTableTheme(player: string): TableTheme {
  try {
    const value = localStorage.getItem(themeStorageKey(player));
    return isTableTheme(value) ? value : 'jade-night';
  } catch {
    return 'jade-night';
  }
}
export function saveTableTheme(player: string, theme: TableTheme): boolean {
  try {
    localStorage.setItem(themeStorageKey(player), theme);
    return true;
  } catch {
    return false;
  }
}
