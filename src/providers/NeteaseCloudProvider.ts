import { parseLyrics } from "@/lyrics/parser";
import { zh } from "@/i18n/zh";
import { FetchHttpClient } from "@/providers/http";
import type { MusicProvider } from "@/providers/MusicProvider";
import { normalizeNcmAudioUrl, normalizeNcmPlaylist, normalizeNcmSong } from "@/providers/normalizers";
import type {
  AudioQuality,
  AudioUrlResult,
  LyricRequest,
  NormalizedPlaylist,
  NormalizedSong,
  PageResult,
  ParsedLyric,
  PlaylistRequest,
  ProviderConfigEntry,
  ProviderHealth,
  ProviderSourceInfo,
  QualityOption,
  SearchRequest,
  SongUrlRequest,
} from "@/types/music";

// 兼容 binaryify/NeteaseCloudMusicApi 常见返回结构
interface SearchResult { result?: { songs?: unknown[]; songCount?: number } }
interface PlaylistDetailResult { playlist?: Record<string, unknown> }
interface PlaylistTracksResult { songs?: unknown[] }
interface SongUrlResult { data?: Array<{ url?: string | null; br?: number }> }
interface LyricResult { lrc?: { lyric?: string }; tlyric?: { lyric?: string } }

export class NeteaseCloudProvider implements MusicProvider {
  readonly id = "neteaseCloud" as const;
  readonly displayName = "网易云(自建)";
  readonly capabilities = {
    search: true,
    toplists: false,
    lyrics: true,
    queueSwitch: false,
    playlists: true,
    recommendations: false,
    personalFm: false,
  };
  readonly defaultSources: ProviderSourceInfo[] = [{ id: "netease", name: zh.names.netease }];
  private readonly http: FetchHttpClient;

  constructor(config: ProviderConfigEntry, useProxy: boolean) {
    this.http = new FetchHttpClient({
      baseUrl: useProxy ? config.proxyBaseUrl ?? config.baseUrl : config.baseUrl,
      providerId: this.id,
      timeoutMs: config.timeoutMs,
    });
  }

  async healthCheck(): Promise<ProviderHealth> {
    const startedAt = performance.now();
    const result = await this.search({ q: zh.names.yinTian, page: 1, pageSize: 1 });
    if (!result.items.length) throw new Error("NeteaseCloud health check returned no playable search result");
    return { ok: true, latencyMs: Math.round(performance.now() - startedAt) };
  }

  async listSources(): Promise<ProviderSourceInfo[]> {
    return this.defaultSources;
  }

  async search(req: SearchRequest): Promise<PageResult<NormalizedSong>> {
    const page = req.page ?? 1;
    const pageSize = req.pageSize ?? 30;
    const offset = (page - 1) * pageSize;
    const data = await this.http.getJson<SearchResult>("/search", {
      keywords: req.q,
      type: 1,
      limit: pageSize,
      offset,
    });
    const songs = data.result?.songs ?? [];
    const total = data.result?.songCount;
    return {
      items: songs.map((item) => normalizeNcmSong(item as never)),
      page,
      pageSize,
      hasMore: total !== undefined ? offset + songs.length < total : songs.length >= pageSize,
      total,
    };
  }

  async getPlaylist(req: PlaylistRequest): Promise<NormalizedPlaylist> {
    const data = await this.http.getJson<PlaylistDetailResult>("/playlist/detail", { id: req.id });
    return normalizeNcmPlaylist((data.playlist ?? {}) as never, req.id);
  }

  async getPlaylistPage(req: PlaylistRequest): Promise<PageResult<NormalizedSong>> {
    const offset = req.offset ?? 0;
    const size = req.size ?? 30;
    const data = await this.http.getJson<PlaylistTracksResult>("/playlist/track/all", {
      id: req.id,
      limit: size,
      offset,
    });
    const songs = (data.songs ?? []).map((item) => normalizeNcmSong(item as never));
    return { items: songs, page: Math.floor(offset / size) + 1, pageSize: size, hasMore: songs.length >= size };
  }

  async getQualities(): Promise<QualityOption[]> {
    return [
      { label: "128k MP3", value: "128kmp3", bitrate: 128 },
      { label: "320k MP3", value: "320kmp3", bitrate: 320 },
      { label: "FLAC", value: "flac" },
    ];
  }

  async getLyric(req: LyricRequest): Promise<ParsedLyric | null> {
    const data = await this.http.getJson<LyricResult>("/lyric", { id: req.id });
    const lrc = mergeLrc(data.lrc?.lyric, data.tlyric?.lyric);
    return lrc ? parseLyrics({ lrc }) : null;
  }

  async getSongUrl(req: SongUrlRequest): Promise<AudioUrlResult> {
    const data = await this.http.getJson<SongUrlResult>("/song/url/v1", {
      id: req.id,
      level: toNcmLevel(req.br ?? "320kmp3"),
    });
    const entry = data.data?.[0];
    if (!entry?.url) throw new Error("NeteaseCloud song url unavailable");
    return normalizeNcmAudioUrl({ url: entry.url }, { quality: req.br ?? "320kmp3" });
  }
}

function toNcmLevel(quality: AudioQuality): string {
  if (quality === "128kmp3") return "standard";
  if (quality === "flac") return "lossless";
  return "exhigh";
}

function mergeLrc(primary?: string, translated?: string): string {
  return [primary, translated].filter(Boolean).join("\n");
}
