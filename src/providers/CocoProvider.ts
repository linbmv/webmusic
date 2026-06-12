import { zh } from "@/i18n/zh";
import { FetchHttpClient } from "@/providers/http";
import type { MusicProvider } from "@/providers/MusicProvider";
import type {
  AudioUrlResult,
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

// coco-downloader / lx-music-api-server 兼容
interface CocoSearchResult {
  list?: Array<{
    id: string;
    name: string;
    singer: string;
    source: string;
    interval: string;
  }>;
}

interface CocoUrlResult {
  url?: string;
}

export class CocoProvider implements MusicProvider {
  readonly id = "coco" as const;
  readonly displayName = "Coco音源";
  readonly capabilities = {
    search: true,
    toplists: false,
    lyrics: false,
    queueSwitch: false,
    playlists: false,
    recommendations: false,
    personalFm: false,
  };
  readonly defaultSources: ProviderSourceInfo[] = [
    { id: "kuwo", name: zh.names.kuwo },
    { id: "kugou", name: "酷狗" },
    { id: "netease", name: zh.names.netease },
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
    try {
      const result = await this.search({ q: "测试", type: "song", page: 1, pageSize: 1, sources: ["netease"] });
      if (!result.items.length) throw new Error("Coco health check returned no results");
      return { ok: true, latencyMs: Math.round(performance.now() - startedAt) };
    } catch (error) {
      return { ok: false, latencyMs: Math.round(performance.now() - startedAt) };
    }
  }

  async listSources(): Promise<ProviderSourceInfo[]> {
    return this.defaultSources;
  }

  async search(req: SearchRequest): Promise<PageResult<NormalizedSong>> {
    const page = req.page ?? 1;
    const pageSize = req.pageSize ?? 30;
    const sources = req.sources ?? [this.defaultSources[0].id];
    const source = sources[0];

    const data = await this.http.getJson<CocoSearchResult>("/search", {
      keyword: req.q,
      source,
      page,
      limit: pageSize,
    });

    const songs = (data.list ?? []).map((item) => ({
      stableId: `${this.id}:${source}:${item.id}`,
      providerSongId: item.id,
      name: item.name,
      artists: item.singer.split(/[,/、]/).map(s => s.trim()),
      artistText: item.singer,
      albumText: "",
      durationMs: parseInt(item.interval) * 1000 || 0,
      provider: { providerId: this.id, source },
      raw: item,
    }));

    return {
      items: songs,
      page,
      pageSize,
      hasMore: songs.length >= pageSize
    };
  }

  async getSongUrl(req: SongUrlRequest): Promise<AudioUrlResult> {
    const data = await this.http.getJson<CocoUrlResult>("/url", {
      id: req.id,
      source: req.source,
      quality: this.mapQuality(req.br ?? "320kmp3"),
    });

    if (!data.url) {
      throw new Error("No audio URL returned");
    }

    return {
      url: data.url,
      quality: req.br ?? "320kmp3",
      direct: true,
      providerId: this.id,
      source: req.source
    };
  }

  private mapQuality(quality: string): string {
    if (quality === "flac") return "flac";
    if (quality === "320kmp3") return "320k";
    return "128k";
  }

  async getQualities(song: NormalizedSong): Promise<QualityOption[]> {
    return [
      { value: "flac", label: "无损", bitrate: undefined },
      { value: "320kmp3", label: "极高", bitrate: 320 },
      { value: "128kmp3", label: "标准", bitrate: 128 },
    ];
  }

  async getToplist(): Promise<NormalizedPlaylist[]> {
    throw new Error("Toplists not supported");
  }

  async getPlaylist(req: PlaylistRequest): Promise<NormalizedPlaylist> {
    throw new Error("Playlists not supported");
  }

  async getLyric(): Promise<ParsedLyric | null> {
    return null;
  }

  getAccountSummary = undefined;
}
