import type { NormalizedPlaylist, NormalizedSong, ProviderId, ToplistGroup } from "@/types/music";

const discoverCacheKey = "music:discover:v1";
const discoverTtlMs = 30 * 60 * 1000;
const toplistTtlMs = 2 * 60 * 60 * 1000;

export interface DiscoverCacheSnapshot {
  providerId: ProviderId;
  playlists: NormalizedPlaylist[];
  discoverSongs: NormalizedSong[];
  toplists: ToplistGroup[];
  discoverUpdatedAt: number;
  toplistsUpdatedAt: number;
}

export function readDiscoverCache(providerId: ProviderId): DiscoverCacheSnapshot | null {
  const value = readRawCache();
  if (!value || value.providerId !== providerId) return null;
  return value;
}

export function hasFreshDiscover(snapshot: DiscoverCacheSnapshot, now = Date.now()): boolean {
  return now - snapshot.discoverUpdatedAt < discoverTtlMs;
}

export function hasFreshToplists(snapshot: DiscoverCacheSnapshot, now = Date.now()): boolean {
  return now - snapshot.toplistsUpdatedAt < toplistTtlMs;
}

export function writeDiscoverCache(next: Partial<DiscoverCacheSnapshot> & { providerId: ProviderId }): void {
  if (typeof localStorage === "undefined") return;
  const previous = readRawCache();
  const snapshot: DiscoverCacheSnapshot = {
    providerId: next.providerId,
    playlists: next.playlists ?? previous?.playlists ?? [],
    discoverSongs: next.discoverSongs ?? previous?.discoverSongs ?? [],
    toplists: next.toplists ?? previous?.toplists ?? [],
    discoverUpdatedAt: next.discoverUpdatedAt ?? previous?.discoverUpdatedAt ?? 0,
    toplistsUpdatedAt: next.toplistsUpdatedAt ?? previous?.toplistsUpdatedAt ?? 0,
  };
  localStorage.setItem(discoverCacheKey, JSON.stringify(snapshot));
}

function readRawCache(): DiscoverCacheSnapshot | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(discoverCacheKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DiscoverCacheSnapshot;
    return isCacheSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isCacheSnapshot(value: DiscoverCacheSnapshot): boolean {
  return typeof value.providerId === "string"
    && Array.isArray(value.playlists)
    && Array.isArray(value.discoverSongs)
    && Array.isArray(value.toplists)
    && typeof value.discoverUpdatedAt === "number"
    && typeof value.toplistsUpdatedAt === "number";
}
