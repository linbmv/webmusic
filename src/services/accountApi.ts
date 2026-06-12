import type { AudioQuality, LocalPlaylist, NormalizedSong, RecentPlay } from "@/types/music";

export interface AccountUser {
  id: string;
  username: string;
  createdAt: number;
}

export interface LibrarySnapshot {
  // v2 携带完整歌曲目录 songs，使另一台设备能还原非收藏的歌单歌曲；v1 快照无 version/songs
  version?: 2;
  songs?: NormalizedSong[];
  favorites: NormalizedSong[];
  playlists: LocalPlaylist[];
  recents: RecentPlay[];
}

export interface ServerDownload {
  id: string;
  song: NormalizedSong;
  quality: AudioQuality;
  sizeBytes: number;
  mimeType?: string;
  streamUrl: string;
  createdAt: number;
}

interface MeResponse { user: AccountUser | null }
interface AuthResponse { user: AccountUser }
interface ConfigResponse { registrationEnabled: boolean }
export interface LibraryResponse { library: LibrarySnapshot; updatedAt: number | null }
interface DownloadsResponse { downloads: ServerDownload[]; totalBytes: number }
interface DownloadResponse { download: ServerDownload }

export class LibraryConflictError extends Error {
  constructor(readonly response: LibraryResponse) {
    super("曲库快照版本冲突");
  }
}

class ApiError extends Error {
  constructor(readonly status: number, readonly payload: unknown) {
    super(String((payload as { error?: string }).error ?? `HTTP ${status}`));
  }
}

export async function getConfig(): Promise<ConfigResponse> {
  return request<ConfigResponse>("/api/config");
}

export async function getMe(): Promise<AccountUser | null> {
  return (await request<MeResponse>("/api/auth/me")).user;
}

export async function login(username: string, password: string): Promise<AccountUser> {
  return (await request<AuthResponse>("/api/auth/login", { method: "POST", body: { username, password } })).user;
}

export async function register(username: string, password: string): Promise<AccountUser> {
  return (await request<AuthResponse>("/api/auth/register", { method: "POST", body: { username, password } })).user;
}

export async function logout(): Promise<void> {
  await request("/api/auth/logout", { method: "POST" });
}

export async function getLibrary(): Promise<LibraryResponse> {
  return request<LibraryResponse>("/api/me/library");
}

export async function saveLibrary(library: LibrarySnapshot, baseUpdatedAt: number | null = null): Promise<LibraryResponse> {
  return request<LibraryResponse>("/api/me/library", { method: "PUT", body: { library, baseUpdatedAt } });
}

export async function listDownloads(): Promise<DownloadsResponse> {
  return request<DownloadsResponse>("/api/me/downloads");
}

export async function createServerDownload(song: NormalizedSong, quality: AudioQuality, audioUrl: string): Promise<ServerDownload> {
  return (await request<DownloadResponse>("/api/me/downloads", { method: "POST", body: { song, quality, audioUrl } })).download;
}

export async function getPlayback(): Promise<{ state: unknown; updatedAt: number | null }> {
  return request<{ state: unknown; updatedAt: number | null }>("/api/me/playback");
}

export async function savePlayback(state: unknown): Promise<{ state: unknown; updatedAt: number }> {
  return request<{ state: unknown; updatedAt: number }>("/api/me/playback", { method: "PUT", body: { state } });
}

async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? "GET",
    cache: "no-store",
    credentials: "same-origin",
    headers: options.body ? { "content-type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 409 && isLibraryResponse(payload)) throw new LibraryConflictError(payload);
    throw new ApiError(response.status, payload);
  }
  return payload as T;
}

function isLibraryResponse(value: unknown): value is LibraryResponse {
  return typeof value === "object" && value !== null && "library" in value && "updatedAt" in value;
}
