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
interface LibraryResponse { library: LibrarySnapshot; updatedAt: number | null }
interface DownloadsResponse { downloads: ServerDownload[]; totalBytes: number }
interface DownloadResponse { download: ServerDownload }

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

export async function saveLibrary(library: LibrarySnapshot): Promise<LibraryResponse> {
  return request<LibraryResponse>("/api/me/library", { method: "PUT", body: { library } });
}

export async function listDownloads(): Promise<DownloadsResponse> {
  return request<DownloadsResponse>("/api/me/downloads");
}

export async function createServerDownload(song: NormalizedSong, quality: AudioQuality, audioUrl: string): Promise<ServerDownload> {
  return (await request<DownloadResponse>("/api/me/downloads", { method: "POST", body: { song, quality, audioUrl } })).download;
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
  if (!response.ok) throw new Error(String((payload as { error?: string }).error ?? `HTTP ${response.status}`));
  return payload as T;
}
