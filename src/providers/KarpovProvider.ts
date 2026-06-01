import { parseLyrics } from "@/lyrics/parser";
import { FetchHttpClient } from "@/providers/http";
import type { MusicProvider } from "@/providers/MusicProvider";
import { normalizeKarpovAudioUrl, normalizeKarpovSong } from "@/providers/normalizers";
import type {
  AudioQuality,
  AudioUrlResult,
  LyricRequest,
  MusicSourceId,
  NormalizedPlaylist,
  NormalizedSong,
  PageResult,
  ParsedLyric,
  PlaylistRequest,
  ProviderAccountSummary,
  ProviderConfigEntry,
  ProviderHealth,
  ProviderSourceInfo,
  QualityOption,
  SearchRequest,
  SongUrlRequest,
} from "@/types/music";

interface SearchData { items?: unknown[]; total?: number; page?: number; pageSize?: number; hasMore?: boolean }
interface PlaylistData { id?: string | number; name?: string; creator?: string; picUrl?: string; songs?: unknown[] }
interface LyricData { lrc?: string; trans?: string }

const supportedSources: MusicSourceId[] = ["netease", "qqmusic", "kugou"];

export class KarpovProvider implements MusicProvider {
  readonly id = "karpov" as const;
  readonly displayName = "Karpov Gateway";
  readonly capabilities = {
    search: true,
    toplists: false,
    lyrics: true,
    queueSwitch: false,
    playlists: true,
    recommendations: false,
    personalFm: false,
  };
  readonly defaultSources: ProviderSourceInfo[] = [
    { id: "netease", name: "Netease" },
    { id: "qqmusic", name: "QQ Music" },
    { id: "kugou", name: "Kugou" },
  ];
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
    await this.getAccountSummary();
    return { ok: true, latencyMs: Math.round(performance.now() - startedAt) };
  }

  async getAccountSummary(): Promise<ProviderAccountSummary> {
    const [usage, balance] = await Promise.all([
      this.http.getData<ProviderAccountSummary["usage"]>("/v1/usage/summary"),
      this.http.getData<ProviderAccountSummary["balance"]>("/v1/billing/balance"),
    ]);
    return { usage, balance };
  }

  async listSources(): Promise<ProviderSourceInfo[]> {
    return this.defaultSources;
  }

  async search(req: SearchRequest): Promise<PageResult<NormalizedSong>> {
    const page = req.page ?? 1;
    const pageSize = req.pageSize ?? 30;
    const source = chooseSource(req.sources);
    const data = await this.http.getData<SearchData>(`/v1/${source}/search/songs`, {
      q: req.q,
      page,
      page_size: pageSize,
    });
    return {
      items: (data.items ?? []).map((item) => normalizeKarpovSong(item as never)),
      page: data.page ?? page,
      pageSize: data.pageSize ?? pageSize,
      hasMore: Boolean(data.hasMore),
      total: data.total,
    };
  }

  async getPlaylist(req: PlaylistRequest): Promise<NormalizedPlaylist> {
    const source = assertSupportedSource(req.source ?? "netease");
    const data = await this.http.getData<PlaylistData>(`/v1/${source}/playlists/${encodeURIComponent(req.id)}`);
    return {
      id: String(data.id ?? req.id),
      name: data.name ?? String(data.id ?? req.id),
      description: data.creator,
      coverUrl: data.picUrl,
      trackCount: data.songs?.length,
      source,
      raw: data,
    };
  }

  async getPlaylistPage(req: PlaylistRequest): Promise<PageResult<NormalizedSong>> {
    const source = assertSupportedSource(req.source ?? "netease");
    const data = await this.http.getData<PlaylistData>(`/v1/${source}/playlists/${encodeURIComponent(req.id)}`);
    const offset = req.offset ?? 0;
    const size = req.size ?? 30;
    const songs = (data.songs ?? []).map((item) => normalizeKarpovSong(item as never));
    return { items: songs.slice(offset, offset + size), page: Math.floor(offset / size) + 1, pageSize: size, hasMore: offset + size < songs.length };
  }

  async getQualities(): Promise<QualityOption[]> {
    return [
      { label: "128k MP3", value: "128kmp3", bitrate: 128 },
      { label: "320k MP3", value: "320kmp3", bitrate: 320 },
      { label: "FLAC", value: "flac" },
    ];
  }

  async getLyric(req: LyricRequest): Promise<ParsedLyric | null> {
    const source = assertSupportedSource(req.source ?? "netease");
    const data = await this.http.getData<LyricData>(`/v1/${source}/songs/${encodeURIComponent(req.id)}/lyric`);
    return parseLyrics({ lrc: mergeLrc(data.lrc, data.trans) });
  }

  async getSongUrl(req: SongUrlRequest): Promise<AudioUrlResult> {
    const source = assertSupportedSource(req.source);
    const data = await this.http.getData<Record<string, unknown>>(`/v1/${source}/songs/${encodeURIComponent(req.id)}/url`, {
      quality: toKarpovQuality(req.br ?? "320kmp3"),
    });
    return normalizeKarpovAudioUrl(data, { source, quality: req.br ?? "320kmp3" });
  }
}

function chooseSource(sources?: MusicSourceId[]): MusicSourceId {
  return sources?.find((source) => supportedSources.includes(source)) ?? "netease";
}

function assertSupportedSource(source: MusicSourceId): MusicSourceId {
  if (supportedSources.includes(source)) return source;
  throw new Error(`Karpov source not supported: ${source}`);
}

function toKarpovQuality(quality: AudioQuality): string {
  if (quality === "128kmp3") return "MP3_128";
  if (quality === "flac") return "FLAC";
  return "MP3_320";
}

function mergeLrc(primary?: string, translated?: string): string {
  return [primary, translated].filter(Boolean).join("\n");
}
