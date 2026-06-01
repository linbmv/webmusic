import type { MusicProvider } from "@/providers/MusicProvider";
import type { AudioQuality, AudioUrlResult, NormalizedSong } from "@/types/music";

// 音质从高到低的降级阶梯：默认请求最高 flac，逐级下调至可用
const switchTargets = ["netease", "kuwo"] as const;
const qualityLadder: AudioQuality[] = ["flac", "320kmp3", "128kmp3"];

export class PlaybackFallbackService {
  constructor(private readonly providers: MusicProvider[]) {}

  async resolvePlayableUrl(song: NormalizedSong, quality: AudioQuality): Promise<AudioUrlResult> {
    // 从请求音质起按阶梯向下尝试，确保跨所有源拿到当前可用的最高音质
    const startIndex = Math.max(0, qualityLadder.indexOf(quality));
    const qualities = qualityLadder.slice(startIndex);
    const attempted = new Set<string>();
    let lastError: unknown;
    for (const targetQuality of qualities) {
      for (const provider of this.providers) {
        const attemptKey = `${provider.id}:${targetQuality}`;
        if (attempted.has(attemptKey)) continue;
        attempted.add(attemptKey);
        try {
          return await resolveFromProvider(provider, song, targetQuality);
        } catch (error) {
          lastError = error;
          continue;
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error(`No playable url found for ${song.name}`);
  }
}

async function resolveFromProvider(provider: MusicProvider, song: NormalizedSong, quality: AudioQuality): Promise<AudioUrlResult> {
  const duration = song.durationMs ? Math.round(song.durationMs / 1000) : undefined;
  try {
    return await provider.getSongUrl({
      id: song.providerSongId,
      source: song.provider.source,
      name: song.name,
      artist: song.artistText,
      duration,
      br: quality,
    });
  } catch (error) {
    const switched = await resolveSwitchedSource(provider, song, quality, duration);
    if (switched) return switched;
    throw error;
  }
}

async function resolveSwitchedSource(provider: MusicProvider, song: NormalizedSong, quality: AudioQuality, duration?: number): Promise<AudioUrlResult | null> {
  if (!provider.switchSource) return null;
  for (const target of switchTargets) {
    if (target === song.provider.source) continue;
    const switched = await provider.switchSource({
      id: song.providerSongId,
      source: song.provider.source,
      target,
      name: song.name,
      artist: song.artistText,
      duration,
    });
    if (!switched) continue;
    return provider.getSongUrl({
      id: switched.providerSongId,
      source: switched.provider.source,
      name: switched.name,
      artist: switched.artistText,
      duration: switched.durationMs ? Math.round(switched.durationMs / 1000) : duration,
      br: quality,
    });
  }
  return null;
}
