import { parseLyrics } from "@/lyrics/parser";
import { FetchHttpClient } from "@/providers/http";
import type { MusicProvider } from "@/providers/MusicProvider";
import { normalizeGdStudioAudioUrl, normalizeGdStudioSong } from "@/providers/normalizers";
import type {
  AudioUrlResult,
  LyricRequest,
  MusicSourceId,
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

interface LyricResponse { lyric?: string; tlyric?: string }

const supportedSources: MusicSourceId[] = ["netease", "kuwo", "joox"];

export class GdStudioProvider implements MusicProvider {
  readonly id = "gdStudio" as const;
  readonly displayName = "GD Studio";
  readonly capabilities = {
    search: true,
    toplists: false,
    lyrics: true,
    queueSwitch: false,
    playlists: false,
    recommendations: false,
    personalFm: false,
  };
  readonly defaultSources: ProviderSourceInfo[] = [
    { id: "netease", name: "Netease" },
    { id: "kuwo", name: "Kuwo" },
    { id: "joox", name: "JOOX" },
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
    await this.search({ q: "love", page: 1, pageSize: 1, sources: ["netease"] });
    return { ok: true, latencyMs: Math.round(performance.now() - startedAt), message: "5 min / 50 requests public limit" };
  }

  async listSources(): Promise<ProviderSourceInfo[]> {
    return this.defaultSources;
  }

  async search(req: SearchRequest): Promise<PageResult<NormalizedSong>> {
    const page = req.page ?? 1;
    const pageSize = req.pageSize ?? 30;
    const source = chooseSource(req.sources);
    const data = await this.http.getJson<unknown[]>("", {
      types: "search",
      source,
      name: req.q,
      count: pageSize,
      pages: page,
    });
    return { items: data.map((item) => normalizeGdStudioSong(item as never)), page, pageSize, hasMore: data.length >= pageSize };
  }

  async getPlaylist(_req: PlaylistRequest): Promise<NormalizedPlaylist> {
    throw new Error("GD Studio provider does not support playlists");
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
    const data = await this.http.getJson<LyricResponse>("", { types: "lyric", source, id: req.id });
    return parseLyrics({ lrc: mergeLrc(data.lyric, data.tlyric) });
  }

  async getSongUrl(req: SongUrlRequest): Promise<AudioUrlResult> {
    const source = assertSupportedSource(req.source);
    const data = await this.http.getJson<Record<string, unknown>>("", {
      types: "url",
      source,
      id: req.id,
      br: toGdStudioBitrate(req.br ?? "320kmp3"),
    });
    return normalizeGdStudioAudioUrl(data, { source, quality: req.br ?? "320kmp3" });
  }
}

function chooseSource(sources?: MusicSourceId[]): MusicSourceId {
  return sources?.find((source) => supportedSources.includes(source)) ?? "netease";
}

function assertSupportedSource(source: MusicSourceId): MusicSourceId {
  if (supportedSources.includes(source)) return source;
  throw new Error(`GD Studio source not supported: ${source}`);
}

function toGdStudioBitrate(quality: string): number {
  if (quality === "128kmp3") return 128;
  if (quality === "flac") return 740;
  return 320;
}

function mergeLrc(primary?: string, translated?: string): string {
  return [primary, translated].filter(Boolean).join("\n");
}
