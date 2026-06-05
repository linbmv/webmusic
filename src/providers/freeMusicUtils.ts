import { createClientId } from "@/utils/id";
import { cleanupPlaybackUrl } from "@/providers/normalizers";
import type { MusicSourceId, NormalizedSong, QualityOption, SearchListItem } from "@/types/music";

interface TypedSearchResponse { albums?: unknown[]; artists?: unknown[]; playlists?: unknown[] }

export function normalizeQualityResponse(input: unknown, source: MusicSourceId): QualityOption[] {
  const raw = extractQualityItems(input);
  return raw.map((item) => normalizeQualityItem(item, source)).filter((item): item is QualityOption => Boolean(item));
}

export function typedItems(data: TypedSearchResponse, type: string): unknown[] {
  if (type === "album") return data.albums ?? [];
  if (type === "artist") return data.artists ?? [];
  if (type === "playlist") return data.playlists ?? [];
  return [];
}

export function normalizeTypedSearchItem(input: unknown, type: string): SearchListItem {
  const raw = isRecord(input) ? input : {};
  const source = asSource(raw.source);
  const id = String(raw.id ?? raw.albumid ?? raw.artistid ?? raw.name ?? createClientId("fm"));
  const title = decodeText(String(raw.name ?? raw.title ?? id));
  const subtitle = typedSubtitle(raw, type);
  const coverUrl = stringValue(raw.cover) ?? stringValue(raw.pic);
  return { id: `freeMusic:${source}:${type}:${id}`, title, subtitle, coverUrl, source, raw: input };
}

export function songToSearchItem(song: NormalizedSong): SearchListItem {
  return {
    id: song.stableId,
    title: song.name,
    subtitle: song.artistText,
    coverUrl: song.coverUrl ?? song.album?.coverUrl,
    source: song.provider.source,
    raw: song.raw,
  };
}

export function albumNameWithoutArtist(name: string, artist?: string): string {
  const decoded = decodeText(name);
  if (!artist) return decoded;
  const decodedArtist = decodeText(artist);
  for (const separator of albumPrefixSeparators) {
    const prefix = `${decodedArtist}${separator}`;
    if (decoded.startsWith(prefix)) return decoded.slice(prefix.length).trim() || decoded;
  }
  return decoded;
}

export function songMatchesAlbumArtist(song: NormalizedSong, albumArtist: string): boolean {
  const tokens = decodeText(albumArtist)
    .replace(/\\/g, "")
    .split(/[&/、,]/)
    .map((token) => token.trim())
    .filter(Boolean);
  if (!tokens.length) return true;
  return tokens.some((token) => song.artistText.includes(token));
}

export function lyricLineCount(text: string): number {
  if (!text) return 0;
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\[[^\]]*\]/g, "").trim())
    .filter((line) => line && !placeholderLyrics.includes(line))
    .length;
}

export function isPlaceholderLyric(text: string): boolean {
  return lyricLineCount(text) === 0;
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

const albumPrefixSeparators = [" - ", " – ", " — ", " · ", "-", "–", "—", "·"];
const placeholderLyrics = ["暂无歌词", "纯音乐，请欣赏", "纯音乐", "暂无动态歌词"];
