import type { AudioQuality, MusicSourceId, NormalizedSong, PlaybackMode, ProviderId } from "@/types/music";

export const playerStorageKey = "music:player:v1";

const maxStoredTracks = 500;
const playbackModes: PlaybackMode[] = ["list", "single", "shuffle"];
const audioQualities: AudioQuality[] = ["128kmp3", "320kmp3", "flac"];
const providerIds: ProviderId[] = ["mock", "freeMusic", "karpov", "gdStudio", "custom"];
const sourceIds: MusicSourceId[] = ["netease", "kuwo", "qqmusic", "kugou", "joox"];

export interface PlayerSnapshot {
  mode: PlaybackMode;
  quality: AudioQuality;
  queue: NormalizedSong[];
  cursor: number;
  currentTimeMs: number;
  updatedAt: number;
}

interface StoredSong {
  stableId: string;
  providerSongId: string;
  provider: { providerId: ProviderId; source: MusicSourceId };
  name: string;
  artists: string[];
  artistText: string;
  album?: { providerAlbumId?: string; name: string; coverUrl?: string };
  durationMs?: number;
  coverUrl?: string;
  pageUrl?: string;
}

interface StoredSnapshot {
  mode: PlaybackMode;
  quality: AudioQuality;
  queue: StoredSong[];
  cursor: number;
  currentTimeMs: number;
  updatedAt: number;
}

export function loadPlayerSnapshot(): PlayerSnapshot | null {
  const raw = readStorage();
  if (!raw) return null;
  try {
    return normalizeSnapshot(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function savePlayerSnapshot(snapshot: PlayerSnapshot): void {
  writeStorage(JSON.stringify(toStoredSnapshot(snapshot)));
}

export function clearPlayerSnapshot(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(playerStorageKey);
}

export function createProgressSnapshotSaver(intervalMs = 5000): (snapshot: PlayerSnapshot) => void {
  let lastProgressMs = 0;
  return (snapshot) => {
    if (Math.abs(snapshot.currentTimeMs - lastProgressMs) < intervalMs) return;
    lastProgressMs = snapshot.currentTimeMs;
    savePlayerSnapshot(snapshot);
  };
}

function toStoredSnapshot(snapshot: PlayerSnapshot): StoredSnapshot {
  const queue = snapshot.queue.slice(0, maxStoredTracks).map(toStoredSong);
  return {
    mode: snapshot.mode,
    quality: snapshot.quality,
    queue,
    cursor: clamp(snapshot.cursor, queue.length),
    currentTimeMs: Math.max(0, Math.round(snapshot.currentTimeMs)),
    updatedAt: snapshot.updatedAt,
  };
}

function toStoredSong(song: NormalizedSong): StoredSong {
  return {
    stableId: song.stableId,
    providerSongId: song.providerSongId,
    provider: { providerId: song.provider.providerId, source: song.provider.source },
    name: song.name,
    artists: [...song.artists],
    artistText: song.artistText,
    album: song.album ? { ...song.album } : undefined,
    durationMs: song.durationMs,
    coverUrl: song.coverUrl,
    pageUrl: song.pageUrl,
  };
}

function normalizeSnapshot(value: unknown): PlayerSnapshot | null {
  if (!isObject(value)) return null;
  const mode = playbackModes.includes(value.mode as PlaybackMode) ? value.mode as PlaybackMode : "list";
  const quality = audioQualities.includes(value.quality as AudioQuality) ? value.quality as AudioQuality : "flac";
  const queue = Array.isArray(value.queue) ? value.queue.map(normalizeSong).filter((song): song is NormalizedSong => Boolean(song)) : [];
  const limitedQueue = queue.slice(0, maxStoredTracks);
  return {
    mode,
    quality,
    queue: limitedQueue,
    cursor: clamp(numberValue(value.cursor), limitedQueue.length),
    currentTimeMs: Math.max(0, numberValue(value.currentTimeMs)),
    updatedAt: Math.max(0, numberValue(value.updatedAt)),
  };
}

function normalizeSong(value: unknown): NormalizedSong | null {
  if (!isObject(value) || !isObject(value.provider)) return null;
  const providerId = value.provider.providerId;
  const source = value.provider.source;
  if (!providerIds.includes(providerId as ProviderId) || !sourceIds.includes(source as MusicSourceId)) return null;
  if (!isNonEmptyString(value.stableId) || !isNonEmptyString(value.providerSongId)) return null;
  if (!isNonEmptyString(value.name) || !isNonEmptyString(value.artistText)) return null;
  return {
    stableId: value.stableId,
    providerSongId: value.providerSongId,
    provider: { providerId: providerId as ProviderId, source: source as MusicSourceId },
    name: value.name,
    artists: stringArray(value.artists),
    artistText: value.artistText,
    album: normalizeAlbum(value.album),
    durationMs: optionalNumber(value.durationMs),
    coverUrl: optionalString(value.coverUrl),
    pageUrl: optionalString(value.pageUrl),
    raw: {},
  };
}

function normalizeAlbum(value: unknown): NormalizedSong["album"] {
  if (!isObject(value) || !isNonEmptyString(value.name)) return undefined;
  return {
    providerAlbumId: optionalString(value.providerAlbumId),
    name: value.name,
    coverUrl: optionalString(value.coverUrl),
  };
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function clamp(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.max(Math.floor(index), 0), length - 1);
}

function readStorage(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(playerStorageKey);
}

function writeStorage(value: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(playerStorageKey, value);
}
