import { parseLyrics } from "@/lyrics/parser";
import { zh } from "@/i18n/zh";
import type { MusicProvider } from "@/providers/MusicProvider";
import type {
  AlbumSongsRequest,
  AudioUrlResult,
  LyricRequest,
  NormalizedPlaylist,
  NormalizedSong,
  PageRequest,
  PageResult,
  PlaylistRequest,
  ProviderHealth,
  ProviderSourceInfo,
  QualityOption,
  SearchRequest,
  SearchListItem,
  SongUrlRequest,
  ToplistGroup,
} from "@/types/music";

const songs: NormalizedSong[] = [
  {
    stableId: "mock:netease:song:276840",
    providerSongId: "276840",
    provider: { providerId: "mock", source: "netease" },
    name: zh.names.yinTianLive,
    artists: [zh.names.moWenWei],
    artistText: zh.names.moWenWei,
    album: { name: zh.names.huiWei },
    durationMs: 247_000,
    coverUrl: "",
    raw: {},
  },
  {
    stableId: "mock:kuwo:song:glass",
    providerSongId: "glass",
    provider: { providerId: "mock", source: "kuwo" },
    name: zh.names.glass,
    artists: [zh.names.haiYuNi],
    artistText: zh.names.haiYuNi,
    album: { name: zh.names.hot },
    durationMs: 218_000,
    coverUrl: "",
    raw: {},
  },
];

export class MockProvider implements MusicProvider {
  readonly id = "mock" as const;
  readonly displayName = "Mock Music";
  readonly capabilities = { search: true, toplists: true, lyrics: true, queueSwitch: true, playlists: true, recommendations: true, personalFm: true };
  readonly defaultSources: ProviderSourceInfo[] = [{ id: "netease", name: zh.names.netease }, { id: "kuwo", name: zh.names.kuwo }];

  async healthCheck(): Promise<ProviderHealth> { return { ok: true, latencyMs: 1 }; }
  async listSources(): Promise<ProviderSourceInfo[]> { return this.defaultSources; }
  async getHotSearches(): Promise<string[]> { return [zh.names.glass, zh.names.yinTian, zh.names.qingTian, zh.names.daoXiang, zh.names.haiYuNi]; }
  async getSuggestions(q: string): Promise<string[]> { return [q, `${q} live`, `${q} ${zh.names.popularSongs}`].filter(Boolean); }

  async search(req: SearchRequest): Promise<PageResult<NormalizedSong>> {
    const keyword = req.q.trim().toLowerCase();
    const items = songs.filter((song) => `${song.name}${song.artistText}`.toLowerCase().includes(keyword));
    return { items: items.length ? items : songs, page: req.page ?? 1, pageSize: req.pageSize ?? 30, hasMore: false };
  }

  async searchTyped(req: SearchRequest): Promise<PageResult<SearchListItem>> {
    const result = await this.search(req);
    const type = req.type ?? "song";
    return {
      items: result.items.map((song) => ({
        id: `${song.stableId}:${type}`,
        title: type === "album" ? song.album?.name ?? song.name : type === "artist" ? song.artistText : `${song.name} ${zh.music.playlists}`,
        subtitle: type === "album" ? song.artistText : type === "artist" ? "Mock artist" : `${song.artistText} · ${zh.common.songUnit}`,
        coverUrl: song.coverUrl,
        source: song.provider.source,
        raw: song.raw,
      })),
      page: result.page,
      pageSize: result.pageSize,
      hasMore: false,
    };
  }

  async getAlbumSongs(req: AlbumSongsRequest): Promise<PageResult<NormalizedSong>> {
    const artist = req.artist?.trim().toLowerCase();
    const album = req.name.trim().toLowerCase();
    const items = songs.filter((song) => {
      const matchesAlbum = (song.album?.name ?? song.name).toLowerCase().includes(album);
      const matchesArtist = !artist || song.artistText.toLowerCase().includes(artist);
      return matchesAlbum && matchesArtist;
    });
    return { items: items.length ? items : songs, page: req.page ?? 0, pageSize: req.size ?? 60, hasMore: false };
  }

  async getRecommendPlaylists(req: PageRequest): Promise<PageResult<NormalizedPlaylist>> {
    return { items: mockPlaylists(), page: req.page ?? 1, pageSize: req.pageSize ?? 10, hasMore: false };
  }

  async getToplists(): Promise<ToplistGroup[]> {
    return [{ id: "mock-rising", name: zh.music.neteaseRising, source: "netease", tracks: [{ first: zh.names.yinTian, second: zh.names.moWenWei }, { first: zh.names.glass, second: zh.names.haiYuNi }], raw: {} }];
  }

  async getPlaylist(req: PlaylistRequest): Promise<NormalizedPlaylist> {
    return mockPlaylists().find((item) => item.id === req.id) ?? mockPlaylists()[0];
  }

  async getPlaylistPage(req: PlaylistRequest): Promise<PageResult<NormalizedSong>> {
    return { items: songs, page: 1, pageSize: req.size ?? 30, hasMore: false };
  }

  async getQualities(): Promise<QualityOption[]> {
    return [{ label: "320k MP3", value: "320kmp3", bitrate: 320 }, { label: "128k MP3", value: "128kmp3", bitrate: 128 }];
  }

  async getLyric(_req: LyricRequest) {
    return parseLyrics({ lrc: `[00:00.00]${zh.names.yinTian}\n[00:12.00]${zh.music.previousLyric}\n[00:24.00]${zh.music.currentLyric}` });
  }

  async getSongUrl(req: SongUrlRequest): Promise<AudioUrlResult> {
    return { url: "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==", direct: true, providerId: "mock", source: req.source, quality: req.br ?? "320kmp3" };
  }
}

function mockPlaylists(): NormalizedPlaylist[] {
  return [
    { id: "2250011882", name: zh.names.douyinRank, coverUrl: "", description: zh.names.popularSongs, playCount: 884970752, trackCount: 82, source: "netease", raw: {} },
    { id: "night-walk", name: zh.names.nightWalk, coverUrl: "", description: zh.names.chineseSlow, playCount: 128000, trackCount: 36, source: "kuwo", raw: {} },
  ];
}
