import type { AppState, SavedTable } from '../shared/types';

type Bookmark = Omit<SavedTable, 'available'>;

/** Bookmarks belong to this browser and guest identity, never the room directory. */
export class SavedTables {
  constructor(private storage: Storage) {}

  key(player: string) {
    return `four-winds-saved-tables:${player}`;
  }

  read(player: string): Bookmark[] {
    try {
      const value: unknown = JSON.parse(this.storage.getItem(this.key(player)) ?? '[]');
      if (!Array.isArray(value)) return [];
      return value.filter(
        (r): r is Bookmark =>
          !!r &&
          typeof r.code === 'string' &&
          /^[A-Z0-9]{6}$/.test(r.code) &&
          typeof r.name === 'string' &&
          typeof r.lobby === 'string',
      );
    } catch {
      return [];
    }
  }

  list(state: AppState): SavedTable[] {
    return this.read(state.profile.id).map((bookmark) => {
      const room = state.rooms.find((r) => r.code === bookmark.code);
      return {
        ...bookmark,
        name: room?.name ?? bookmark.name,
        // Rooms outside the current lobby are resolved when resuming by code.
        available: bookmark.lobby !== state.lobby.code || !!room,
      };
    });
  }

  save(player: string, bookmark: Bookmark) {
    this.write(player, [...this.read(player).filter((r) => r.code !== bookmark.code), bookmark]);
  }

  remove(player: string, code: string) {
    this.write(
      player,
      this.read(player).filter((r) => r.code !== code),
    );
  }

  private write(player: string, bookmarks: Bookmark[]) {
    try {
      this.storage.setItem(this.key(player), JSON.stringify(bookmarks));
    } catch {
      throw new Error(
        'This browser could not save your bookmarks. Allow browser storage and try again.',
      );
    }
  }
}
