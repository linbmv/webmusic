import type { LibrarySnapshot } from "@/services/accountApi";
import type { LocalPlaylist, NormalizedSong, RecentPlay } from "@/types/music";

// 同步元数据 v2：除指纹外保存上次成功同步的紧凑基线 baseline，
// 用于三方合并判定"一端删除且另一端未改动"时删除生效，避免并集合并导致删除复活
export interface LibrarySyncBaseline {
  favoriteIds: string[];
  playlists: Array<{ id: string; trackIds: string[]; updatedAt: number }>;
  recentIds: string[];
  songIds: string[];
}

export interface LibrarySyncMeta {
  version: 2;
  lastSyncedAt: number;
  fingerprint: string;
  baseline: LibrarySyncBaseline;
}

const syncMetaPrefix = "music-clone-library-sync:";
const maxSyncedRecents = 30;

export function isEmptyLibrary(library: LibrarySnapshot): boolean {
  return favoritesOf(library).length === 0 && playlistsOf(library).length === 0 && recentsOf(library).length === 0;
}

// 无基线时的兜底合并：纯并集，保证不丢数据（删除暂不生效，等基线重建后恢复删除语义）
export function mergeLibraries(local: LibrarySnapshot, server: LibrarySnapshot): LibrarySnapshot {
  return {
    version: 2,
    songs: mergeSongs([local, server]),
    favorites: mergeFavorites(favoritesOf(local), favoritesOf(server)),
    playlists: mergePlaylists(playlistsOf(local), playlistsOf(server)),
    recents: mergeRecents(recentsOf(local), recentsOf(server)),
  };
}

// 三方合并：以 baseline 为共同祖先，分别比较 local/server 的增删，删除可生效
export function mergeLibrariesWithBaseline(local: LibrarySnapshot, server: LibrarySnapshot, baseline: LibrarySyncBaseline): LibrarySnapshot {
  const favorites = threeWayFavorites(favoritesOf(local), favoritesOf(server), baseline.favoriteIds);
  const playlists = threeWayPlaylists(playlistsOf(local), playlistsOf(server), baseline.playlists);
  const recents = mergeRecents(recentsOf(local), recentsOf(server));
  const referencedIds = collectReferencedIds(favorites, playlists, recents);
  const songs = mergeSongs([local, server]).filter((song) => referencedIds.has(song.stableId));
  return { version: 2, songs, favorites, playlists, recents };
}

export function sameLibrary(left: LibrarySnapshot, right: LibrarySnapshot): boolean {
  return libraryFingerprint(left) === libraryFingerprint(right);
}

export function libraryFingerprint(library: LibrarySnapshot): string {
  return hashString(stableStringify(comparableLibrary(library)));
}

export function baselineFromLibrary(library: LibrarySnapshot): LibrarySyncBaseline {
  return {
    favoriteIds: favoritesOf(library).map((song) => song.stableId),
    playlists: playlistsOf(library).map((playlist) => ({ id: playlist.id, trackIds: [...playlist.trackIds], updatedAt: playlist.updatedAt })),
    recentIds: recentsOf(library).map((recent) => recent.id),
    songIds: songsOf(library).map((song) => song.stableId),
  };
}

export function readLibrarySyncMeta(userId: string): LibrarySyncMeta | null {
  const raw = safeGetItem(syncMetaKey(userId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isLibrarySyncMeta(parsed) ? parsed : null;
  } catch (caught) {
    console.warn("Invalid library sync metadata", caught);
    return null;
  }
}

export function writeLibrarySyncMeta(userId: string, lastSyncedAt: number, library: LibrarySnapshot): void {
  const meta: LibrarySyncMeta = {
    version: 2,
    lastSyncedAt,
    fingerprint: libraryFingerprint(library),
    baseline: baselineFromLibrary(library),
  };
  // localStorage 写入可能因 iOS 隐私模式 QuotaExceededError 抛错；降级为 warning，不让同步流程崩溃
  safeSetItem(syncMetaKey(userId), JSON.stringify(meta));
}

// ---- 三方合并：收藏 ----

function threeWayFavorites(local: NormalizedSong[], server: NormalizedSong[], baselineIds: string[]): NormalizedSong[] {
  const base = new Set(baselineIds);
  const localById = new Map(local.map((song) => [song.stableId, song]));
  const serverById = new Map(server.map((song) => [song.stableId, song]));
  const ids = new Set([...localById.keys(), ...serverById.keys()]);
  const result: NormalizedSong[] = [];
  ids.forEach((id) => {
    if (keepAfterThreeWay(localById.has(id), serverById.has(id), base.has(id))) {
      const song = localById.get(id) ?? serverById.get(id);
      if (song) result.push(song);
    }
  });
  return result;
}

// ---- 三方合并：歌单 ----

function threeWayPlaylists(local: LocalPlaylist[], server: LocalPlaylist[], baseline: LibrarySyncBaseline["playlists"]): LocalPlaylist[] {
  const base = new Map(baseline.map((entry) => [entry.id, entry]));
  const localById = new Map(local.map((playlist) => [playlist.id, playlist]));
  const serverById = new Map(server.map((playlist) => [playlist.id, playlist]));
  const ids = new Set([...localById.keys(), ...serverById.keys()]);
  const result: LocalPlaylist[] = [];
  ids.forEach((id) => {
    const localPlaylist = localById.get(id);
    const serverPlaylist = serverById.get(id);
    if (localPlaylist && serverPlaylist) {
      result.push(mergePlaylistTracks(localPlaylist, serverPlaylist, base.get(id)));
      return;
    }
    // 一端整体删除歌单：仅当另一端自基线后未修改它时，删除生效
    const survivor = localPlaylist ?? serverPlaylist;
    if (!survivor) return;
    const counterpartHadIt = base.has(id);
    const survivorChanged = !base.get(id) || survivor.updatedAt > (base.get(id)?.updatedAt ?? 0);
    if (!counterpartHadIt || survivorChanged) result.push(survivor);
  });
  return result.sort((left, right) => right.updatedAt - left.updatedAt);
}

function mergePlaylistTracks(local: LocalPlaylist, server: LocalPlaylist, base: LibrarySyncBaseline["playlists"][number] | undefined): LocalPlaylist {
  const baseTracks = base?.trackIds ?? [];
  const merged = threeWayIds(local.trackIds, server.trackIds, baseTracks);
  const latest = local.updatedAt >= server.updatedAt ? local : server;
  return { ...latest, trackIds: merged, updatedAt: Math.max(local.updatedAt, server.updatedAt) };
}

// 基于基线的 ID 集合三方合并：保留新增、移除一端删除项（顺序优先沿用 local）
function threeWayIds(local: string[], server: string[], baseline: string[]): string[] {
  const base = new Set(baseline);
  const localSet = new Set(local);
  const serverSet = new Set(server);
  const ordered = [...local, ...server.filter((id) => !localSet.has(id))];
  const result: string[] = [];
  const seen = new Set<string>();
  ordered.forEach((id) => {
    if (seen.has(id)) return;
    seen.add(id);
    if (keepAfterThreeWay(localSet.has(id), serverSet.has(id), base.has(id))) result.push(id);
  });
  return result;
}

// 三方存在性判定：基线存在 + 某端删除 = 删除生效；基线不存在 + 某端新增 = 新增保留
function keepAfterThreeWay(inLocal: boolean, inServer: boolean, inBaseline: boolean): boolean {
  if (inLocal && inServer) return true;
  if (inBaseline) return inLocal && inServer; // 双端都还在才保留；任一端删除则删除
  return inLocal || inServer; // 基线没有：任一端新增即保留
}

// ---- 并集合并（兜底/songs）----

function mergeFavorites(local: NormalizedSong[], server: NormalizedSong[]): NormalizedSong[] {
  const byId = new Map(server.map((song) => [song.stableId, song]));
  local.forEach((song) => byId.set(song.stableId, song));
  return Array.from(byId.values());
}

function mergePlaylists(local: LocalPlaylist[], server: LocalPlaylist[]): LocalPlaylist[] {
  const byId = new Map(server.map((playlist) => [playlist.id, playlist]));
  local.forEach((playlist) => {
    const existing = byId.get(playlist.id);
    byId.set(playlist.id, existing ? mergePlaylist(playlist, existing) : playlist);
  });
  return Array.from(byId.values()).sort((left, right) => right.updatedAt - left.updatedAt);
}

function mergePlaylist(local: LocalPlaylist, server: LocalPlaylist): LocalPlaylist {
  const latest = local.updatedAt >= server.updatedAt ? local : server;
  return {
    ...latest,
    trackIds: Array.from(new Set([...server.trackIds, ...local.trackIds])),
    updatedAt: Math.max(local.updatedAt, server.updatedAt),
  };
}

function mergeRecents(local: RecentPlay[], server: RecentPlay[]): RecentPlay[] {
  const byId = new Map(server.map((recent) => [recent.id, recent]));
  local.forEach((recent) => {
    const existing = byId.get(recent.id);
    if (!existing || recent.playedAt >= existing.playedAt) byId.set(recent.id, recent);
  });
  return Array.from(byId.values())
    .sort((left, right) => right.playedAt - left.playedAt)
    .slice(0, maxSyncedRecents);
}

function mergeSongs(libraries: LibrarySnapshot[]): NormalizedSong[] {
  const byId = new Map<string, NormalizedSong>();
  libraries.forEach((library) => {
    // server 在前、local 在后，重复时 local payload 覆盖（视为较新）
    [...songsOf(library), ...favoritesOf(library), ...recentsOf(library).map((recent) => recent.song)].forEach((song) => {
      if (song?.stableId) byId.set(song.stableId, song);
    });
  });
  return Array.from(byId.values());
}

function collectReferencedIds(favorites: NormalizedSong[], playlists: LocalPlaylist[], recents: RecentPlay[]): Set<string> {
  const ids = new Set<string>();
  favorites.forEach((song) => ids.add(song.stableId));
  playlists.forEach((playlist) => playlist.trackIds.forEach((id) => ids.add(id)));
  recents.forEach((recent) => ids.add(recent.song.stableId));
  return ids;
}

// ---- 字段访问（兼容 v1 缺省）----

function songsOf(library: LibrarySnapshot): NormalizedSong[] {
  return Array.isArray(library.songs) ? library.songs : [];
}

function favoritesOf(library: LibrarySnapshot): NormalizedSong[] {
  return Array.isArray(library.favorites) ? library.favorites : [];
}

function playlistsOf(library: LibrarySnapshot): LocalPlaylist[] {
  return Array.isArray(library.playlists) ? library.playlists : [];
}

function recentsOf(library: LibrarySnapshot): RecentPlay[] {
  return Array.isArray(library.recents) ? library.recents : [];
}

// ---- 指纹与稳定序列化 ----

function comparableLibrary(library: LibrarySnapshot): Record<string, unknown> {
  return {
    favorites: [...favoritesOf(library)].sort((left, right) => left.stableId.localeCompare(right.stableId)).map((song) => song.stableId),
    playlists: [...playlistsOf(library)]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((playlist) => ({ id: playlist.id, name: playlist.name, updatedAt: playlist.updatedAt, trackIds: playlist.trackIds })),
    recents: [...recentsOf(library)].sort((left, right) => right.playedAt - left.playedAt || left.id.localeCompare(right.id)).map((recent) => recent.id),
  };
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortObjectKeys(value));
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObjectKeys(value[key])]));
}

function hashString(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return String(hash >>> 0);
}

function syncMetaKey(userId: string): string {
  return `${syncMetaPrefix}${userId}`;
}

function safeGetItem(key: string): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(key);
  } catch (caught) {
    console.warn("Failed to read library sync metadata", caught);
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, value);
  } catch (caught) {
    console.warn("Failed to persist library sync metadata", caught);
  }
}

function isLibrarySyncMeta(value: unknown): value is LibrarySyncMeta {
  return isRecord(value)
    && value.version === 2
    && typeof value.lastSyncedAt === "number"
    && typeof value.fingerprint === "string"
    && isBaseline(value.baseline);
}

function isBaseline(value: unknown): value is LibrarySyncBaseline {
  return isRecord(value)
    && Array.isArray(value.favoriteIds)
    && Array.isArray(value.playlists)
    && Array.isArray(value.recentIds)
    && Array.isArray(value.songIds);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
