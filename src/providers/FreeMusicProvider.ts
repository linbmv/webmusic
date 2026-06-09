import { parseLyrics } from "@/lyrics/parser";
import { zh } from "@/i18n/zh";
import { FetchHttpClient } from "@/providers/http";
import type { MusicProvider } from "@/providers/MusicProvider";
import {
  albumNameWithoutArtist,
  isPlaceholderLyric,
  lyricLineCount,
  normalizeQualityResponse,
  normalizeTypedSearchItem,
  songMatchesAlbumArtist,
  songToSearchItem,
  typedItems,
} from "@/providers/freeMusicUtils";
import {
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

const defaultQualities: QualityOption[] = [{ label: "128k MP3", value: "128kmp3", bitrate: 128 }, { label: "320k MP3", value: "320kmp3", bitrate: 320 }, { label: "FLAC", value: "flac" }];

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
    // 只用 netease 健康检查：kuwo 上游近期 25s 不返回，会拖死整个 provider
    const result = await this.search({ q: zh.names.yinTian, type: "song", page: 1, pageSize: 1, sources: ["netease"] });
    if (!result.items.length) throw new Error("FreeMusic health check returned no playable search result");
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
    // 未显式指定来源时只走 netease，避免上游自行扫到很慢的 kuwo
    const sources = req.sources ?? ["netease"];
    const data = await this.http.getJson<SearchResponse>("/search", {
      q: req.q,
      type: req.type ?? "song",
      page,
      pageSize,
      sources,
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
    // 搜索结果里专辑名常是 "歌手 - 专辑名"，但上游 /album/songs 只认纯专辑名（如 "LPCD45"）；
    // 且必须带 source，否则跨源（如 kuwo 专辑按 netease 查）匹配不到。
    const data = await this.http.getJson<AlbumSongsResponse>("/album/songs", {
      name: albumNameWithoutArtist(req.name, req.artist),
      source: req.source ?? "netease",
      page,
      size: pageSize,
    });
    const rawItems = data.songs ?? data.list ?? data.data ?? [];
    let items = rawItems.map((item) => normalizeFreeMusicSong(item as never));
    // 上游按专辑名模糊匹配，会带回同名合辑里其他歌手的歌；而把 artist 传给上游会直接返回空。
    // 因此本地按专辑歌手过滤回该专辑曲目；过滤后为空则保留原始结果，避免误伤。
    if (req.artist) {
      const filtered = items.filter((song) => songMatchesAlbumArtist(song, req.artist as string));
      if (filtered.length) items = filtered;
    }
    return {
      items,
      page,
      pageSize,
      hasMore: false,
      total: items.length,
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
    const source = req.source ?? "netease";
    const data = await this.http.getJson<Record<string, unknown>>("/playlist", { id: req.id, source });
    const rawPlaylist = (data.playlist ?? data) as Record<string, unknown>;
    const detail = normalizeFreeMusicPlaylist(rawPlaylist as never);
    // /playlist 有时只返回 { songs, playlist_link }，没有 name/id/cover；用请求 id 兜底，保证歌单页稳定
    if (!detail.name || detail.name === "undefined" || !detail.id || detail.id === "undefined") {
      const songCount = Array.isArray(rawPlaylist.songs) ? rawPlaylist.songs.length : detail.trackCount;
      return { ...detail, id: req.id, name: detail.name && detail.name !== "undefined" ? detail.name : `歌单 ${req.id}`, trackCount: songCount, source };
    }
    return detail;
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
