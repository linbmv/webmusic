import { openDB, type DBSchema } from "idb";
import { defaultLibrarySettings } from "@/config/providerConfig";
import type { LibrarySettings, LocalPlaylist, NormalizedSong, RecentPlay } from "@/types/music";

interface MusicDb extends DBSchema {
  favoriteSongs: { key: string; value: NormalizedSong };
  playlists: { key: string; value: LocalPlaylist };
  recentPlays: { key: string; value: RecentPlay; indexes: { playedAt: number } };
  settings: { key: string; value: LibrarySettings };
}

const dbName = "music-clone-library";
const settingsKey = "default";

// IndexedDB 的结构化克隆无法序列化 Vue 的 reactive 代理（会抛 DataCloneError），
// 存库前必须剥离响应式包装还原为纯对象；NormalizedSong 全字段 JSON 安全，round-trip 无损
function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class IndexedDbRepository {
  private readonly dbPromise = openDB<MusicDb>(dbName, 1, {
    upgrade(db) {
      db.createObjectStore("favoriteSongs");
      db.createObjectStore("playlists");
      db.createObjectStore("settings");
      db.createObjectStore("recentPlays", { keyPath: "id" }).createIndex("playedAt", "playedAt");
    },
  });

  async getFavoriteSongIds(): Promise<string[]> {
    const db = await this.dbPromise;
    return db.getAllKeys("favoriteSongs") as Promise<string[]>;
  }

  async listFavoriteSongs(): Promise<NormalizedSong[]> {
    const db = await this.dbPromise;
    return db.getAll("favoriteSongs");
  }

  async addFavoriteSong(song: NormalizedSong): Promise<void> {
    const db = await this.dbPromise;
    await db.put("favoriteSongs", toPlain(song), song.stableId);
  }

  async removeFavoriteSong(id: string): Promise<void> {
    const db = await this.dbPromise;
    await db.delete("favoriteSongs", id);
  }

  async listPlaylists(): Promise<LocalPlaylist[]> {
    const db = await this.dbPromise;
    return db.getAll("playlists");
  }

  async createPlaylist(name: string): Promise<LocalPlaylist> {
    const db = await this.dbPromise;
    const playlist: LocalPlaylist = { id: crypto.randomUUID(), name, trackIds: [], updatedAt: Date.now() };
    await db.put("playlists", playlist, playlist.id);
    return playlist;
  }

  async renamePlaylist(id: string, name: string): Promise<void> {
    const db = await this.dbPromise;
    const playlist = await db.get("playlists", id);
    if (!playlist) throw new Error(`Playlist not found: ${id}`);
    await db.put("playlists", { ...playlist, name, updatedAt: Date.now() }, id);
  }

  async deletePlaylist(id: string): Promise<void> {
    const db = await this.dbPromise;
    await db.delete("playlists", id);
  }

  async addTrackToPlaylist(playlistId: string, song: NormalizedSong): Promise<void> {
    const db = await this.dbPromise;
    const playlist = await db.get("playlists", playlistId);
    if (!playlist) throw new Error(`Playlist not found: ${playlistId}`);
    const trackIds = Array.from(new Set([...playlist.trackIds, song.stableId]));
    await db.put("playlists", { ...playlist, trackIds, updatedAt: Date.now() }, playlistId);
    await this.addFavoriteSong(song);
  }

  async removeTrackFromPlaylist(playlistId: string, songId: string): Promise<void> {
    const db = await this.dbPromise;
    const playlist = await db.get("playlists", playlistId);
    if (!playlist) throw new Error(`Playlist not found: ${playlistId}`);
    await db.put("playlists", { ...playlist, trackIds: playlist.trackIds.filter((id) => id !== songId), updatedAt: Date.now() }, playlistId);
  }

  async listRecentPlays(limit = 30): Promise<RecentPlay[]> {
    const db = await this.dbPromise;
    const items = await db.getAllFromIndex("recentPlays", "playedAt");
    return items.sort((a, b) => b.playedAt - a.playedAt).slice(0, limit);
  }

  async recordRecentPlay(song: NormalizedSong, playedAt = Date.now()): Promise<void> {
    const db = await this.dbPromise;
    await db.put("recentPlays", toPlain({ id: song.stableId, song, playedAt }));
  }

  async getSettings(): Promise<LibrarySettings> {
    const db = await this.dbPromise;
    return (await db.get("settings", settingsKey)) ?? defaultLibrarySettings;
  }

  async saveSettings(settings: LibrarySettings): Promise<void> {
    const db = await this.dbPromise;
    await db.put("settings", settings, settingsKey);
  }
}
