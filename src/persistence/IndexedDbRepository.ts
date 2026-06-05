import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { defaultLibrarySettings } from "@/config/providerConfig";
import { createClientId } from "@/utils/id";
import type { LibrarySettings, LocalPlaylist, NormalizedSong, RecentPlay } from "@/types/music";

interface MusicDb extends DBSchema {
  // 歌曲元数据唯一目录：收藏、歌单、最近播放共享，按 stableId 反查完整 NormalizedSong
  librarySongs: { key: string; value: NormalizedSong };
  favoriteSongs: { key: string; value: NormalizedSong };
  playlists: { key: string; value: LocalPlaylist };
  recentPlays: { key: string; value: RecentPlay; indexes: { playedAt: number } };
  settings: { key: string; value: LibrarySettings };
}

const dbName = "music-clone-library";
const dbVersion = 2;
const settingsKey = "default";
const maxStoredRecents = 60;

// IndexedDB 的结构化克隆无法序列化 Vue 的 reactive 代理（会抛 DataCloneError），
// 存库前必须剥离响应式包装还原为纯对象；NormalizedSong 全字段 JSON 安全，round-trip 无损
function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class IndexedDbRepository {
  private readonly dbPromise = this.open();

  private open(): Promise<IDBPDatabase<MusicDb>> {
    return openDB<MusicDb>(dbName, dbVersion, {
      upgrade(db, oldVersion, _newVersion, tx) {
        if (!db.objectStoreNames.contains("favoriteSongs")) db.createObjectStore("favoriteSongs");
        if (!db.objectStoreNames.contains("playlists")) db.createObjectStore("playlists");
        if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings");
        if (!db.objectStoreNames.contains("recentPlays")) {
          db.createObjectStore("recentPlays", { keyPath: "id" }).createIndex("playedAt", "playedAt");
        }
        if (!db.objectStoreNames.contains("librarySongs")) db.createObjectStore("librarySongs");
        // v1 → v2：把旧收藏与最近播放的歌曲补入新的歌曲目录，保证歌单读取不再依赖收藏表
        if (oldVersion < 2) {
          const songs = tx.objectStore("librarySongs");
          void tx.objectStore("favoriteSongs").getAll().then((favorites) => {
            favorites.forEach((song) => void songs.put(song, song.stableId));
          });
          void tx.objectStore("recentPlays").getAll().then((recents) => {
            recents.forEach((recent) => {
              if (recent.song) void songs.put(recent.song, recent.song.stableId);
            });
          });
        }
      },
    });
  }

  async listLibrarySongs(): Promise<NormalizedSong[]> {
    const db = await this.dbPromise;
    return db.getAll("librarySongs");
  }

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
    const plain = toPlain(song);
    const tx = db.transaction(["favoriteSongs", "librarySongs"], "readwrite");
    tx.objectStore("favoriteSongs").put(plain, plain.stableId);
    tx.objectStore("librarySongs").put(plain, plain.stableId);
    await tx.done;
  }

  // 仅移除收藏关系，不删除 librarySongs：歌单或最近播放可能仍引用该歌曲元数据
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
    const playlist: LocalPlaylist = { id: createClientId("playlist"), name, trackIds: [], updatedAt: Date.now() };
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

  // 加入歌单同时把歌曲写入 librarySongs（不再强制等同于收藏），单事务保证歌单与歌曲目录一致
  async addTrackToPlaylist(playlistId: string, song: NormalizedSong): Promise<void> {
    const db = await this.dbPromise;
    const plain = toPlain(song);
    const tx = db.transaction(["playlists", "librarySongs"], "readwrite");
    const playlists = tx.objectStore("playlists");
    const playlist = await playlists.get(playlistId);
    if (!playlist) throw new Error(`Playlist not found: ${playlistId}`);
    const trackIds = Array.from(new Set([...playlist.trackIds, plain.stableId]));
    playlists.put({ ...playlist, trackIds, updatedAt: Date.now() }, playlistId);
    tx.objectStore("librarySongs").put(plain, plain.stableId);
    await tx.done;
  }

  // 批量加入整张专辑/歌单时只更新一次 playlist 和歌曲目录，避免逐首触发多次事务与同步通知
  async addTracksToPlaylist(playlistId: string, songs: NormalizedSong[]): Promise<void> {
    if (!songs.length) return;
    const db = await this.dbPromise;
    const plainSongs = songs.map((song) => toPlain(song));
    const tx = db.transaction(["playlists", "librarySongs"], "readwrite");
    const playlists = tx.objectStore("playlists");
    const playlist = await playlists.get(playlistId);
    if (!playlist) throw new Error(`Playlist not found: ${playlistId}`);
    const nextIds = plainSongs.map((song) => song.stableId);
    const trackIds = Array.from(new Set([...playlist.trackIds, ...nextIds]));
    playlists.put({ ...playlist, trackIds, updatedAt: Date.now() }, playlistId);
    plainSongs.forEach((song) => tx.objectStore("librarySongs").put(song, song.stableId));
    await tx.done;
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

  // 记录最近播放同时写入歌曲目录，并在写入后裁剪超量历史，避免移动端长期占用增长
  async recordRecentPlay(song: NormalizedSong, playedAt = Date.now()): Promise<void> {
    const db = await this.dbPromise;
    const plain = toPlain(song);
    const tx = db.transaction(["recentPlays", "librarySongs"], "readwrite");
    tx.objectStore("recentPlays").put(toPlain({ id: plain.stableId, song: plain, playedAt }));
    tx.objectStore("librarySongs").put(plain, plain.stableId);
    await tx.done;
    await this.pruneRecents();
  }

  private async pruneRecents(): Promise<void> {
    const db = await this.dbPromise;
    const items = await db.getAllFromIndex("recentPlays", "playedAt");
    if (items.length <= maxStoredRecents) return;
    const stale = items.sort((a, b) => b.playedAt - a.playedAt).slice(maxStoredRecents);
    const tx = db.transaction("recentPlays", "readwrite");
    stale.forEach((recent) => tx.objectStore("recentPlays").delete(recent.id));
    await tx.done;
  }

  async getSettings(): Promise<LibrarySettings> {
    const db = await this.dbPromise;
    return (await db.get("settings", settingsKey)) ?? defaultLibrarySettings;
  }

  async saveSettings(settings: LibrarySettings): Promise<void> {
    const db = await this.dbPromise;
    await db.put("settings", settings, settingsKey);
  }

  // 整库替换（同步拉取/合并后调用）：同步排队所有 clear/put 后只等待 tx.done，
  // 避免在 await Promise.all(clear) 后再排队写入触发部分浏览器（尤其移动端）事务失活
  async replaceLibrary(data: { songs: NormalizedSong[]; favorites: NormalizedSong[]; playlists: LocalPlaylist[]; recents: RecentPlay[] }): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction(["librarySongs", "favoriteSongs", "playlists", "recentPlays"], "readwrite");
    const songs = tx.objectStore("librarySongs");
    const favorites = tx.objectStore("favoriteSongs");
    const playlists = tx.objectStore("playlists");
    const recents = tx.objectStore("recentPlays");
    songs.clear();
    favorites.clear();
    playlists.clear();
    recents.clear();
    // 合并所有歌曲元数据来源（独立目录 + 收藏 + 最近播放），保证歌单 trackId 都能反查到歌曲
    const songCatalog = mergeSongs(data.songs, data.favorites, data.recents.map((recent) => recent.song));
    songCatalog.forEach((song) => songs.put(toPlain(song), song.stableId));
    data.favorites.forEach((song) => favorites.put(toPlain(song), song.stableId));
    data.playlists.forEach((playlist) => playlists.put(toPlain(playlist), playlist.id));
    data.recents.forEach((recent) => recents.put(toPlain(recent)));
    await tx.done;
  }
}

function mergeSongs(...groups: Array<Array<NormalizedSong | undefined>>): NormalizedSong[] {
  const byId = new Map<string, NormalizedSong>();
  groups.forEach((group) => {
    group.forEach((song) => {
      if (song?.stableId) byId.set(song.stableId, song);
    });
  });
  return Array.from(byId.values());
}
