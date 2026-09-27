export type Environment = 'garden' | 'rain' | 'pond';
export type LocalPreferences = {
  rotate: boolean;
  zoom: boolean;
  notifications: boolean;
  ambient: boolean;
  volume: number;
  environment: Environment;
};
const defaults: LocalPreferences = {
  rotate: false,
  zoom: false,
  notifications: false,
  ambient: false,
  volume: 0.3,
  environment: 'garden',
};
export function readPreferences(player: string): LocalPreferences {
  try {
    const p = JSON.parse(localStorage.getItem(`four-winds-preferences:${player}`) ?? '{}');
    return {
      rotate: p.rotate === true,
      zoom: p.zoom === true,
      notifications: p.notifications === true,
      ambient: p.ambient === true,
      volume:
        typeof p.volume === 'number' && Number.isFinite(p.volume)
          ? Math.max(0, Math.min(1, p.volume))
          : 0.3,
      environment: ['garden', 'rain', 'pond'].includes(p.environment) ? p.environment : 'garden',
    };
  } catch {
    return { ...defaults };
  }
}
export function savePreferences(player: string, p: LocalPreferences) {
  try {
    localStorage.setItem(`four-winds-preferences:${player}`, JSON.stringify(p));
  } catch {
    /* Continue for this visit. */
  }
}
