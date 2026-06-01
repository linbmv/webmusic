import { ProviderError, type MusicProvider } from "@/providers/MusicProvider";
import { zh } from "@/i18n/zh";
import type {
  AudioUrlResult,
  LyricRequest,
  NormalizedPlaylist,
  NormalizedSong,
  PageRequest,
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

export class CustomProvider implements MusicProvider {
  readonly id = "custom" as const;
  readonly displayName = "Custom API";
  readonly defaultSources: ProviderSourceInfo[] = [{ id: "netease", name: zh.names.netease }];
  readonly capabilities = { search: true, toplists: false, lyrics: true, queueSwitch: false, playlists: true, recommendations: false, personalFm: false };

  constructor(private readonly config: ProviderConfigEntry) {}

  async healthCheck(): Promise<ProviderHealth> {
    return { ok: this.config.enabled, message: this.config.enabled ? undefined : "Custom provider disabled" };
  }

  async listSources(): Promise<ProviderSourceInfo[]> { return this.defaultSources; }
  async search(_req: SearchRequest): Promise<PageResult<NormalizedSong>> { throw this.notImplemented(); }
  async getRecommendPlaylists(_req: PageRequest): Promise<PageResult<NormalizedPlaylist>> { throw this.notImplemented(); }
  async getPlaylist(_req: PlaylistRequest): Promise<NormalizedPlaylist> { throw this.notImplemented(); }
  async getQualities(_song: NormalizedSong): Promise<QualityOption[]> { return [{ label: "320k MP3", value: "320kmp3" }]; }
  async getLyric(_req: LyricRequest): Promise<ParsedLyric | null> { return null; }
  async getSongUrl(_req: SongUrlRequest): Promise<AudioUrlResult> { throw this.notImplemented(); }

  private notImplemented(): ProviderError {
    return new ProviderError("CustomProvider needs your API adapter implementation", this.id);
  }
}
