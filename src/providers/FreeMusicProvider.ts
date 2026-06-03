import { parseLyrics } from "@/lyrics/parser";
import { zh } from "@/i18n/zh";
import { createClientId } from "@/utils/id";
import { FetchHttpClient } from "@/providers/http";
import type { MusicProvider } from "@/providers/MusicProvider";
import {
  cleanupPlaybackUrl,
  normalizeAudioUrl,
  normalizeFreeMusicPlaylist,
  normalizeFreeMusicSong,
  normalizeToplist,
} from "@/providers/normalizers";
import type {
  AlbumSongsRequest,
  AudioUrlResult,
  LyricRequest,
  MusicSourceId,
  NormalizedPlaylist,
  NormalizedSong,
  PageRequest,
  PageResult,
  PersonalFmTrack,
  ParsedLyric,
  PlaylistRequest,
  ProviderConfigEntry,
  ProviderHealth,
  ProviderSourceInfo,
  QualityOption,
  SearchRequest,
  SearchListItem,
  SongUrlRequest,
  SwitchSourceRequest,
  ToplistGroup,
} from "@/types/music";

interface SearchResponse { songs?: unknown[]; list?: unknown[]; data?: unknown[]; total?: number; hasMore?: boolean }
interface TypedSearchResponse { albums?: unknown[]; artists?: unknown[]; playlists?: unknown[]; total?: number; hasMore?: boolean }
interface AlbumSongsResponse { songs?: unknown[]; list?: unknown[]; data?: unknown[]; total?: number; hasMore?: boolean }
interface RecommendResponse { playlists?: unknown[]; page?: number; pageSize?: number; hasMore?: boolean }
interface SourcesResponse { all_sources?: MusicSourceId[]; descriptions?: Record<string, string> }
interface PersonalFmResponse { songs?: unknown[]; tracks?: unknown[]; data?: unknown[] }

const defaultQualities: QualityOption[] = [
  { label: '128k MP3', value: '128kmp3', bitrate: 128 },
  { label: '320k MP3', value: '320kmp3', bitrate: 320 },
  { label: 'FLAC', value: 'flac' },
];

export class FreeMusicProvider implements MusicProvider {
  readonly id = "freeMusic" as const;
  readonly displayName = "FreeMusic";
  readonly capabilities = {
    search: true,
    toplists: true,
    lyrics: true,
    queueSwitch: true,
    playlists: true,
    recommendations: true,
    personalFm: true,
  };
  readonly defaultSources: ProviderSourceInfo[] = [
    { id: "netease", name: zh.names.netease },
    { id: "kuwo", name: zh.names.kuwo },
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
    await this.listSources();
    return { ok: true, latencyMs: Math.round(performance.now() - startedAt) };
  }

  async listSources(): Promise<ProviderSourceInfo[]> {
    const data = await this.http.getJson<SourcesResponse>("/sources");
    return (data.all_sources ?? ["netease", "kuwo"]).map((id) => ({
      id,
      name: data.descriptions?.[id] ?? id,
    }));
  }

  async search(req: SearchRequest): Promise<PageResult<NormalizedSong>> {
    const page = req.page ?? 1;
    const pageSize = req.pageSize ?? 30;
    const data = await this.http.getJson<SearchResponse>("/search", {
      q: req.q,
      type: req.type ?? "song",
      page,
      pageSize,
      sources: req.sources,
    });
    const items = (data.songs ?? data.list ?? data.data ?? []).map((item) => normalizeFreeMusicSong(item as never));
    return { items, page, pageSize, hasMore: Boolean(data.hasMore), total: data.total };
  }

  async searchTyped(req: SearchRequest): Promise<PageResult<SearchListItem>> {
    const page = req.page ?? 1;
    const pageSize = req.pageSize ?? 30;
    const type = req.type ?? "song";
    if (type === "song") {
      const result = await this.search(req);
      return { ...result, items: result.items.map(songToSearchItem) };
    }
    const data = await this.http.getJson<TypedSearchResponse>("/search", {
      q: req.q,
      type,
      page,
      pageSize,
      sources: req.sources,
    });
    const rawItems = typedItems(data, type);
    if (type === "artist" && !rawItems.length) {
      return this.searchTypedArtistsFallback(req);
    }
    return {
      items: rawItems.map((item) => normalizeTypedSearchItem(item, type)),
      page,
      pageSize,
      hasMore: Boolean(data.hasMore),
      total: data.total,
    };
  }

  async getAlbumSongs(req: AlbumSongsRequest): Promise<PageResult<NormalizedSong>> {
    const page = req.page ?? 0;
    const pageSize = req.size ?? 60;
    const data = await this.http.getJson<AlbumSongsResponse>("/album/songs", {
      name: req.name,
      artist: req.artist ?? "",
      page,
      size: pageSize,
    });
    const rawItems = data.songs ?? data.list ?? data.data ?? [];
    return {
      items: rawItems.map((item) => normalizeFreeMusicSong(item as never)),
      page,
      pageSize,
      hasMore: Boolean(data.hasMore),
      total: data.total,
    };
  }

  async getHotSearches(): Promise<string[]> {
    const data = await this.http.getJson<{ hot?: string[] }>("/search/hot");
    return data.hot ?? [];
  }

  async getSuggestions(q: string): Promise<string[]> {
    const data = await this.http.getJson<{ suggestions?: string[] }>("/search/suggest", { q });
    return data.suggestions ?? [];
  }

  async getRecommendPlaylists(req: PageRequest): Promise<PageResult<NormalizedPlaylist>> {
    const page = req.page ?? 1;
    const pageSize = req.pageSize ?? 10;
    const data = await this.http.getJson<RecommendResponse>("/recommend-playlists", { page, pageSize });
    return {
      items: (data.playlists ?? []).map((item) => normalizeFreeMusicPlaylist(item as never)),
      page,
      pageSize,
      hasMore: Boolean(data.hasMore),
    };
  }

  async getToplists(source: MusicSourceId = "netease"): Promise<ToplistGroup[]> {
    if (source === "kuwo") return this.getKuwoToplists();
    const data = await this.http.getJson<{ official?: Record<string, unknown>[] }>("/toplist/netease");
    return (data.official ?? []).map((item) => normalizeToplist(item, "netease"));
  }

  async getPlaylist(req: PlaylistRequest): Promise<NormalizedPlaylist> {
    const data = await this.http.getJson<Record<string, unknown>>("/playlist", { id: req.id, source: req.source ?? "netease" });
    return normalizeFreeMusicPlaylist((data.playlist ?? data) as never);
  }

  async getPlaylistPage(req: PlaylistRequest): Promise<PageResult<NormalizedSong>> {
    const offset = req.offset ?? 0;
    const size = req.size ?? 30;
    const data = await this.http.getJson<{ songs?: unknown[]; list?: unknown[]; tracks?: unknown[]; hasMore?: boolean }>("/playlist/page", {
      id: req.id,
      source: req.source ?? "netease",
      offset,
      size,
    });
    const items = (data.songs ?? data.list ?? data.tracks ?? []).map((item) => normalizeFreeMusicSong(item as never));
    return { items, page: Math.floor(offset / size) + 1, pageSize: size, hasMore: Boolean(data.hasMore) };
  }

  async getQualities(song: NormalizedSong): Promise<QualityOption[]> {
    const data = await this.http.getJson<unknown>("/qualities", {
      name: song.name,
      artist: song.artistText,
      duration: song.durationMs ? Math.round(song.durationMs / 1000) : undefined,
    });
    const parsed = normalizeQualityResponse(data, song.provider.source);
    return parsed.length ? parsed : defaultQualities;
  }

  async getLyric(req: LyricRequest): Promise<ParsedLyric | null> {
    const [plain, structured] = await Promise.allSettled([
      this.http.getText("/lyric", { id: req.id, source: req.source, name: req.name, artist: req.artist }),
      this.http.getText("/yrc", { id: req.id, source: req.source }),
    ]);
    let lrc = plain.status === "fulfilled" ? plain.value : "";
    let yrc = "";
    // /yrc 实际返回 JSON {lrc, yrc} 而非纯文本，必须先解析再取字段
    if (structured.status === "fulfilled") {
      try {
        const json = JSON.parse(structured.value) as { lrc?: string; yrc?: string };
        yrc = json.yrc ?? "";
        // /yrc 同时带回含时间轴的 lrc；当它比 /lyric 含更多有效歌词行时优先采用，
        // 以躲开 /lyric 偶发返回的 "[00:00.00] 暂无歌词" 占位（占位本身也带时间戳）
        if (json.lrc && lyricLineCount(json.lrc) > lyricLineCount(lrc)) lrc = json.lrc;
      } catch {
        yrc = structured.value;
      }
    }
    // 无逐字且 lrc 仅是占位（暂无歌词/纯音乐）时视为无歌词
    if (!yrc && isPlaceholderLyric(lrc)) return null;
    return parseLyrics({ lrc, yrc });
  }

  async getSongUrl(req: SongUrlRequest): Promise<AudioUrlResult> {
    const data = await this.http.getJson<Record<string, unknown>>("/song_url", {
      id: req.id,
      source: req.source,
      name: req.name,
      artist: req.artist,
      duration: req.duration,
      br: req.br ?? "320kmp3",
    });
    return normalizeAudioUrl(data, { providerId: this.id, source: req.source, quality: req.br ?? "320kmp3" });
  }

  async switchSource(req: SwitchSourceRequest): Promise<NormalizedSong | null> {
    const data = await this.http.getJson<Record<string, unknown> | null>("/switch_source", {
      name: req.name,
      artist: req.artist,
      source: req.source,
      target: req.target,
      duration: req.duration,
    });
    return data ? normalizeFreeMusicSong(data as never) : null;
  }

  async getPersonalFm(): Promise<PersonalFmTrack[]> {
    const data = await this.http.getJson<PersonalFmResponse | unknown[]>("/personal_fm");
    const rawTracks = Array.isArray(data) ? data : data.songs ?? data.tracks ?? data.data ?? [];
    return rawTracks.map((item) => ({ song: normalizeFreeMusicSong(item as never) }));
  }

  private async getKuwoToplists(): Promise<ToplistGroup[]> {
    const data = await this.http.getJson<{ menu?: Record<string, unknown>[]; list?: Record<string, unknown>[] }>("/toplist/kuwo/menu");
    return (data.menu ?? data.list ?? []).map((item) => normalizeToplist(item, "kuwo"));
  }

  private async searchTypedArtistsFallback(req: SearchRequest): Promise<PageResult<SearchListItem>> {
    const songResult = await this.search({ ...req, type: "song" });
    const grouped = new Map<string, SearchListItem>();
    for (const song of songResult.items) {
      for (const artist of song.artists) {
        const key = `${song.provider.source}:${artist}`;
        if (grouped.has(key)) continue;
        grouped.set(key, {
          id: `freeMusic:${song.provider.source}:artist:${encodeURIComponent(artist)}`,
          title: artist,
          subtitle: song.album?.name ? `${song.album.name} · ${song.name}` : song.name,
          coverUrl: song.coverUrl ?? song.album?.coverUrl,
          source: song.provider.source,
          raw: song.raw,
        });
      }
    }
    const items = Array.from(grouped.values());
    return { items, page: songResult.page, pageSize: songResult.pageSize, hasMore: songResult.hasMore, total: items.length };
  }
}

function normalizeQualityResponse(input: unknown, source: MusicSourceId): QualityOption[] {
  const raw = extractQualityItems(input);
  return raw.map((item) => normalizeQualityItem(item, source)).filter((item): item is QualityOption => Boolean(item));
}

function typedItems(data: TypedSearchResponse, type: string): unknown[] {
  if (type === "album") return data.albums ?? [];
  if (type === "artist") return data.artists ?? [];
  if (type === "playlist") return data.playlists ?? [];
  return [];
}

function normalizeTypedSearchItem(input: unknown, type: string): SearchListItem {
  const raw = isRecord(input) ? input : {};
  const source = asSource(raw.source);
  const id = String(raw.id ?? raw.albumid ?? raw.artistid ?? raw.name ?? createClientId("fm"));
  const title = decodeText(String(raw.name ?? raw.title ?? id));
  const subtitle = typedSubtitle(raw, type);
  const coverUrl = stringValue(raw.cover) ?? stringValue(raw.pic);
  return { id: `freeMusic:${source}:${type}:${id}`, title, subtitle, coverUrl, source, raw: input };
}

function songToSearchItem(song: NormalizedSong): SearchListItem {
  return {
    id: song.stableId,
    title: song.name,
    subtitle: song.artistText,
    coverUrl: song.coverUrl ?? song.album?.coverUrl,
    source: song.provider.source,
    raw: song.raw,
  };
}

function typedSubtitle(raw: Record<string, unknown>, type: string): string | undefined {
  if (type === "album") return [raw.artist, raw.musiccnt ? `${raw.musiccnt} 首` : undefined, raw.pub].filter(Boolean).map(String).join(" · ");
  if (type === "artist") return raw.songnum ? `${raw.songnum} 首` : undefined;
  if (type === "playlist") return [raw.creator, raw.track_count ? `${raw.track_count} 首` : undefined].filter(Boolean).map(String).join(" · ");
  return undefined;
}

function asSource(value: unknown): MusicSourceId {
  return value === "kuwo" ? "kuwo" : "netease";
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value ? cleanupPlaybackUrl(decodeText(value)) : undefined;
}

function decodeText(value: string): string {
  return value.replace(/&nbsp;/g, " ").replace(/&apos;/g, "'").trim();
}

function extractQualityItems(input: unknown): unknown[] {
  if (Array.isArray(input)) return input;
  if (!isRecord(input)) return [];
  if (Array.isArray(input.qualities)) return input.qualities;
  if (Array.isArray(input.data)) return input.data;
  return [];
}

function normalizeQualityItem(input: unknown, source: MusicSourceId): QualityOption | null {
  if (typeof input === "string") return qualityFromValue(input, source);
  if (!isRecord(input)) return null;
  const value = String(input.value ?? input.br ?? input.quality ?? "");
  const option = qualityFromValue(value, source);
  if (!option) return null;
  return { ...option, label: String(input.label ?? input.name ?? option.label) };
}

function qualityFromValue(value: string, source: MusicSourceId): QualityOption | null {
  if (value === "128kmp3" || value === "128") return { label: "128k MP3", value: "128kmp3", bitrate: 128, source };
  if (value === "320kmp3" || value === "320") return { label: "320k MP3", value: "320kmp3", bitrate: 320, source };
  if (value.toLowerCase() === "flac" || value === "2000kflac") return { label: "FLAC", value: "flac", source };
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// 已知的"无歌词"占位文案：上游在缺词时会返回这些而非空串
const placeholderLyrics = ["暂无歌词", "纯音乐，请欣赏", "纯音乐", "暂无动态歌词"];

// 去掉时间戳/元信息后，统计真正承载歌词内容的行数，用于在两份 lrc 间择优
function lyricLineCount(text: string): number {
  if (!text) return 0;
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\[[^\]]*\]/g, "").trim())
    .filter((line) => line && !placeholderLyrics.includes(line))
    .length;
}

// 整段歌词去掉时间戳后只剩占位文案（或为空）时，视为无歌词
function isPlaceholderLyric(text: string): boolean {
  return lyricLineCount(text) === 0;
}
