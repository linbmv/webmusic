import type {
  AudioQuality,
  AudioUrlResult,
  MusicSourceId,
  NormalizedPlaylist,
  NormalizedSong,
  ProviderId,
  ToplistGroup,
} from "@/types/music";
import { zh } from "@/i18n/zh";
import { createClientId } from "@/utils/id";

interface FreeSong {
  id: string | number;
  name: string;
  artist?: string;
  album?: string;
  album_id?: string | number;
  duration?: number;
  cover?: string;
  link?: string;
  source?: MusicSourceId;
}

interface KarpovSong {
  id: string | number;
  title?: string;
  name?: string;
  subtitle?: string;
  duration?: number;
  artists?: Array<{ name?: string } | string>;
  album?: { id?: string | number; name?: string; picUrl?: string; coverUrl?: string };
  provider?: MusicSourceId;
}

interface GdStudioSong {
  id: string | number;
  name: string;
  artist?: string[];
  album?: string;
  pic_id?: string;
  lyric_id?: string | number;
  source?: MusicSourceId;
}

// NeteaseCloudMusicApi (binaryify) 歌曲结构
interface NcmSong {
  id: string | number;
  name?: string;
  ar?: Array<{ name?: string }>;
  artists?: Array<{ name?: string }>;
  al?: { id?: string | number; name?: string; picUrl?: string };
  album?: { id?: string | number; name?: string; picUrl?: string };
  dt?: number;
  duration?: number;
}

interface NcmPlaylist {
  id?: string | number;
  name?: string;
  description?: string;
  coverImgUrl?: string;
  picUrl?: string;
  playCount?: number;
  trackCount?: number;
}

interface FreePlaylist {
  id?: string | number;
  playlist_id?: string | number;
  name: string;
  cover?: string;
  description?: string;
  play_count?: number;
  track_count?: number;
  source?: MusicSourceId;
}

export function cleanupPlaybackUrl(url: string): string {
  return url.replace("http://", "https://").replace(".kwcdn.kuwo.cn", ".kuwo.cn");
}

export function normalizeFreeMusicSong(raw: FreeSong, providerId: ProviderId = "freeMusic"): NormalizedSong {
  const source = raw.source ?? "netease";
  const id = String(raw.id);
  const artists = splitArtists(raw.artist ?? zh.names.unknownArtist);
  return {
    stableId: `${providerId}:${source}:song:${id}`,
    providerSongId: id,
    provider: { providerId, source },
    name: raw.name,
    artists,
    artistText: artists.join(" / "),
    album: raw.album ? { providerAlbumId: raw.album_id ? String(raw.album_id) : undefined, name: raw.album, coverUrl: raw.cover } : undefined,
    durationMs: raw.duration ? raw.duration * 1000 : undefined,
    coverUrl: raw.cover,
    pageUrl: raw.link,
    raw,
  };
}

export function normalizeKarpovSong(raw: KarpovSong): NormalizedSong {
  const source = raw.provider ?? "netease";
  const id = String(raw.id);
  const artists = normalizeKarpovArtists(raw.artists, raw.subtitle);
  const coverUrl = raw.album?.picUrl ?? raw.album?.coverUrl;
  return {
    stableId: `karpov:${source}:song:${id}`,
    providerSongId: id,
    provider: { providerId: "karpov", source },
    name: raw.title ?? raw.name ?? id,
    artists,
    artistText: artists.join(" / "),
    album: raw.album?.name ? { providerAlbumId: raw.album.id ? String(raw.album.id) : undefined, name: raw.album.name, coverUrl } : undefined,
    durationMs: raw.duration,
    coverUrl,
    raw,
  };
}

export function normalizeGdStudioSong(raw: GdStudioSong): NormalizedSong {
  const source = raw.source ?? "netease";
  const id = String(raw.id);
  const artists = raw.artist?.length ? raw.artist : [zh.names.unknownArtist];
  const coverUrl = raw.pic_id ? `/api/music/gdstudio?types=pic&source=${encodeURIComponent(source)}&id=${encodeURIComponent(raw.pic_id)}&size=300` : undefined;
  return {
    stableId: `gdStudio:${source}:song:${id}`,
    providerSongId: id,
    provider: { providerId: "gdStudio", source },
    name: raw.name,
    artists,
    artistText: artists.join(" / "),
    album: raw.album ? { name: raw.album, coverUrl } : undefined,
    coverUrl,
    raw,
  };
}

export function normalizeFreeMusicPlaylist(raw: FreePlaylist): NormalizedPlaylist {
  const source = raw.source ?? "netease";
  const id = String(raw.playlist_id ?? raw.id ?? raw.name);
  return {
    id,
    name: raw.name,
    description: raw.description,
    coverUrl: raw.cover,
    playCount: raw.play_count,
    trackCount: raw.track_count,
    source,
    raw,
  };
}

export function normalizeNcmSong(raw: NcmSong): NormalizedSong {
  const id = String(raw.id);
  const artistList = (raw.ar ?? raw.artists ?? []).map((a) => a?.name).filter((n): n is string => Boolean(n));
  const artists = artistList.length ? artistList : [zh.names.unknownArtist];
  const album = raw.al ?? raw.album;
  const coverUrl = album?.picUrl;
  return {
    stableId: `neteaseCloud:netease:song:${id}`,
    providerSongId: id,
    provider: { providerId: "neteaseCloud", source: "netease" },
    name: raw.name ?? id,
    artists,
    artistText: artists.join(" / "),
    album: album?.name ? { providerAlbumId: album.id ? String(album.id) : undefined, name: album.name, coverUrl } : undefined,
    durationMs: raw.dt ?? (raw.duration ? raw.duration : undefined),
    coverUrl,
    raw,
  };
}

export function normalizeNcmPlaylist(raw: NcmPlaylist, fallbackId: string): NormalizedPlaylist {
  return {
    id: String(raw.id ?? fallbackId),
    name: raw.name ?? fallbackId,
    description: raw.description,
    coverUrl: raw.coverImgUrl ?? raw.picUrl,
    playCount: raw.playCount,
    trackCount: raw.trackCount,
    source: "netease",
    raw,
  };
}

export function normalizeToplist(raw: Record<string, unknown>, source: MusicSourceId): ToplistGroup {
  const tracks = Array.isArray(raw.tracks) ? raw.tracks : [];
  return {
    id: String(raw.id ?? raw.name ?? createClientId("toplist")),
    name: String(raw.name ?? zh.app.toplist),
    source,
    coverUrl: typeof raw.cover === "string" ? raw.cover : undefined,
    updateTip: typeof raw.update_tip === "string" ? raw.update_tip : undefined,
    tracks: tracks.map((item) => ({
      first: String((item as Record<string, unknown>).first ?? ""),
      second: String((item as Record<string, unknown>).second ?? ""),
    })),
    raw,
  };
}

export function normalizeAudioUrl(raw: Record<string, unknown>, fallback: { providerId: ProviderId; source: MusicSourceId; quality: AudioQuality }): AudioUrlResult {
  const url = String(raw.url ?? "");
  if (!url) throw new Error("song_url response missing url");
  return {
    url: cleanupPlaybackUrl(url),
    direct: Boolean(raw.direct),
    providerId: fallback.providerId,
    source: (raw.source as MusicSourceId | undefined) ?? fallback.source,
    quality: fallback.quality,
  };
}

export function normalizeKarpovAudioUrl(raw: Record<string, unknown>, fallback: { source: MusicSourceId; quality: AudioQuality }): AudioUrlResult {
  return normalizeAudioUrl({ ...raw, direct: true }, { providerId: "karpov", source: fallback.source, quality: fallback.quality });
}

export function normalizeGdStudioAudioUrl(raw: Record<string, unknown>, fallback: { source: MusicSourceId; quality: AudioQuality }): AudioUrlResult {
  return normalizeAudioUrl({ ...raw, direct: true }, { providerId: "gdStudio", source: fallback.source, quality: fallback.quality });
}

export function normalizeNcmAudioUrl(raw: Record<string, unknown>, fallback: { quality: AudioQuality }): AudioUrlResult {
  return normalizeAudioUrl({ ...raw, direct: true }, { providerId: "neteaseCloud", source: "netease", quality: fallback.quality });
}

function splitArtists(value: string): string[] {
  return value.split(/[?,/]/).map((item) => item.trim()).filter(Boolean);
}

function normalizeKarpovArtists(artists: KarpovSong["artists"], subtitle?: string): string[] {
  const names = artists?.map((artist) => typeof artist === "string" ? artist : artist.name).filter((name): name is string => Boolean(name?.trim()));
  if (names?.length) return names;
  return splitArtists(subtitle ?? zh.names.unknownArtist);
}
