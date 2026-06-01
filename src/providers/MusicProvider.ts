import type {
  AlbumSongsRequest,
  AudioUrlResult,
  LyricRequest,
  NormalizedPlaylist,
  NormalizedSong,
  PageRequest,
  PageResult,
  PersonalFmTrack,
  ParsedLyric,
  PlaylistRequest,
  ProviderAccountSummary,
  ProviderCapabilities,
  ProviderHealth,
  ProviderId,
  MusicSourceId,
  ProviderSourceInfo,
  QualityOption,
  SearchRequest,
  SearchListItem,
  SongUrlRequest,
  SwitchSourceRequest,
  ToplistGroup,
} from "@/types/music";

export interface MusicProvider {
  id: ProviderId;
  displayName: string;
  defaultSources: ProviderSourceInfo[];
  capabilities: ProviderCapabilities;
  healthCheck(): Promise<ProviderHealth>;
  getAccountSummary?(): Promise<ProviderAccountSummary>;
  listSources(): Promise<ProviderSourceInfo[]>;
  search(req: SearchRequest): Promise<PageResult<NormalizedSong>>;
  searchTyped?(req: SearchRequest): Promise<PageResult<SearchListItem>>;
  getAlbumSongs?(req: AlbumSongsRequest): Promise<PageResult<NormalizedSong>>;
  getHotSearches?(): Promise<string[]>;
  getSuggestions?(q: string): Promise<string[]>;
  getRecommendPlaylists?(req: PageRequest): Promise<PageResult<NormalizedPlaylist>>;
  getToplists?(source?: MusicSourceId): Promise<ToplistGroup[]>;
  getPlaylist(req: PlaylistRequest): Promise<NormalizedPlaylist>;
  getPlaylistPage?(req: PlaylistRequest): Promise<PageResult<NormalizedSong>>;
  getQualities(song: NormalizedSong): Promise<QualityOption[]>;
  getLyric(req: LyricRequest): Promise<ParsedLyric | null>;
  getSongUrl(req: SongUrlRequest): Promise<AudioUrlResult>;
  switchSource?(req: SwitchSourceRequest): Promise<NormalizedSong | null>;
  getPersonalFm?(): Promise<PersonalFmTrack[]>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly providerId: ProviderId,
    readonly status?: number,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
