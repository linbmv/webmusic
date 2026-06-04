export type ProviderId = "mock" | "freeMusic" | "karpov" | "gdStudio" | "custom";
export type MusicSourceId = "netease" | "kuwo" | "qqmusic" | "kugou" | "joox";
export type SearchType = "song" | "playlist" | "artist" | "album";
export type AudioQuality = "128kmp3" | "320kmp3" | "flac";
export type PlaybackMode = "list" | "single" | "shuffle";

export interface ProviderCapabilities {
  search: boolean;
  toplists: boolean;
  lyrics: boolean;
  queueSwitch: boolean;
  playlists: boolean;
  recommendations: boolean;
  personalFm: boolean;
}

export interface ProviderHealth {
  ok: boolean;
  latencyMs?: number;
  message?: string;
}

export interface ProviderUsageSummary {
  today?: number;
  thisMonth?: number;
  total?: number;
  dailyLimit?: number;
  monthlyLimit?: number;
  dailyRemaining?: number;
  monthlyRemaining?: number;
}

export interface ProviderBalanceSummary {
  balanceCents?: number;
  currency?: string;
  updatedAt?: string;
}

export interface ProviderAccountSummary {
  usage?: ProviderUsageSummary;
  balance?: ProviderBalanceSummary;
}

export interface ProviderSourceInfo {
  id: MusicSourceId;
  name: string;
  description?: string;
}

export interface NormalizedSong {
  stableId: string;
  providerSongId: string;
  provider: {
    providerId: ProviderId;
    source: MusicSourceId;
  };
  name: string;
  artists: string[];
  artistText: string;
  album?: {
    providerAlbumId?: string;
    name: string;
    coverUrl?: string;
  };
  durationMs?: number;
  coverUrl?: string;
  pageUrl?: string;
  // 预解析的可直接播放 URL（本地文件 blob URL / WebDAV 直链）；存在时引擎跳过 provider 解析
  directUrl?: string;
  raw: unknown;
}

export interface NormalizedPlaylist {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string;
  playCount?: number;
  trackCount?: number;
  source: MusicSourceId;
  raw: unknown;
}

export interface SearchListItem {
  id: string;
  title: string;
  subtitle?: string;
  coverUrl?: string;
  source: MusicSourceId;
  raw: unknown;
}

export interface PersonalFmTrack {
  song: NormalizedSong;
  reason?: string;
}

export interface ToplistGroup {
  id: string;
  name: string;
  source: MusicSourceId;
  coverUrl?: string;
  updateTip?: string;
  tracks: Array<{ first: string; second: string }>;
  raw: unknown;
}

export interface QualityOption {
  label: string;
  value: AudioQuality;
  bitrate?: number;
  source?: MusicSourceId;
}

export interface LyricWord {
  text: string;
  startMs: number;
  durationMs: number;
}

export interface LyricLine {
  startMs: number;
  durationMs: number;
  text: string;
  words: LyricWord[];
}

export interface ParsedLyric {
  kind: "lrc" | "yrc" | "mixed";
  lines: LyricLine[];
}

export interface AudioUrlResult {
  url: string;
  direct: boolean;
  providerId: ProviderId;
  source: MusicSourceId;
  quality: AudioQuality;
  expiresAt?: number;
}

export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  total?: number;
}

export interface SearchRequest {
  q: string;
  type?: SearchType;
  page?: number;
  pageSize?: number;
  sources?: MusicSourceId[];
}

export interface AlbumSongsRequest {
  name: string;
  artist?: string;
  source?: MusicSourceId;
  page?: number;
  size?: number;
}

export interface PageRequest {
  page?: number;
  pageSize?: number;
}

export interface PlaylistRequest {
  id: string;
  source?: MusicSourceId;
  offset?: number;
  size?: number;
}

export interface LyricRequest {
  id: string;
  source?: MusicSourceId;
  name?: string;
  artist?: string;
}

export interface SongUrlRequest {
  id: string;
  source: MusicSourceId;
  name: string;
  artist: string;
  duration?: number;
  br?: AudioQuality;
}

export interface SwitchSourceRequest {
  id: string;
  source: MusicSourceId;
  target: MusicSourceId;
  name: string;
  artist: string;
  duration?: number;
}

export interface ProviderConfigEntry {
  enabled: boolean;
  baseUrl: string;
  proxyBaseUrl?: string;
  timeoutMs: number;
}

export interface ProviderRuntimeConfig {
  activeProviderId: ProviderId;
  fallbackProviderIds: ProviderId[];
  defaultQuality: AudioQuality;
  defaultSources: MusicSourceId[];
  useBffProxy: boolean;
  providers: Record<ProviderId, ProviderConfigEntry>;
}

export interface LocalPlaylist {
  id: string;
  name: string;
  trackIds: string[];
  coverUrl?: string;
  description?: string;
  updatedAt: number;
}

export interface RecentPlay {
  id: string;
  song: NormalizedSong;
  playedAt: number;
}

export interface LibrarySettings {
  provider: ProviderRuntimeConfig;
  darkMode: boolean;
  lyricSync: boolean;
  defaultQuality: AudioQuality;
}
