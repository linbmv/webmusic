import type { LibrarySnapshot } from "@/services/accountApi";
import type { LocalPlaylist, NormalizedSong, RecentPlay } from "@/types/music";

export interface LibrarySyncMeta {
  lastSyncedAt: number;
  fingerprint: string;
}

const syncMetaPrefix = "music-clone-library-sync:";
const maxSyncedRecents = 30;

export function isEmptyLibrary(library: LibrarySnapshot): boolean {
  return library.favorites.length === 0 && library.playlists.length === 0 && library.recents.length === 0;
}

export function mergeLibraries(local: LibrarySnapshot, server: LibrarySnapshot): LibrarySnapshot {
  return {
    favorites: mergeFavorites(local.favorites, server.favorites),
    playlists: mergePlaylists(local.playlists, server.playlists),
    recents: mergeRecents(local.recents, server.recents),
  };
}

export function sameLibrary(left: LibrarySnapshot, right: LibrarySnapshot): boolean {
  return libraryFingerprint(left) === libraryFingerprint(right);
}

export function libraryFingerprint(library: LibrarySnapshot): string {
  return hashString(stableStringify(comparableLibrary(library)));
}

export function readLibrarySyncMeta(userId: string): LibrarySyncMeta | null {
  const raw = localStorage.getItem(syncMetaKey(userId));
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
  localStorage.setItem(syncMetaKey(userId), JSON.stringify({
    lastSyncedAt,
    fingerprint: libraryFingerprint(library),
  }));
}

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

function comparableLibrary(library: LibrarySnapshot): LibrarySnapshot {
  return {
    favorites: [...library.favorites].sort((left, right) => left.stableId.localeCompare(right.stableId)),
    playlists: [...library.playlists].sort((left, right) => left.id.localeCompare(right.id)),
    recents: [...library.recents].sort((left, right) => right.playedAt - left.playedAt || left.id.localeCompare(right.id)),
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

function isLibrarySyncMeta(value: unknown): value is LibrarySyncMeta {
  return isRecord(value) && typeof value.lastSyncedAt === "number" && typeof value.fingerprint === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
