import type { AudioQuality, AudioUrlResult, NormalizedSong } from "@/types/music";

export type AudioElementFactory = () => HTMLAudioElement;

export interface CachedAudio {
  result: AudioUrlResult;
  audio: HTMLAudioElement | null;
}

type CacheEntry = { result: AudioUrlResult; expiresAt: number };
type PreloadedAudio = CacheEntry & { audio: HTMLAudioElement };

const defaultTtlMs = 15 * 60 * 1000;
const defaultMaxEntries = 12;

export class AudioPreloadCache {
  private readonly urls = new Map<string, CacheEntry>();
  private readonly audios = new Map<string, PreloadedAudio>();

  constructor(
    private readonly createAudio: AudioElementFactory,
    private readonly ttlMs = defaultTtlMs,
    private readonly maxEntries = defaultMaxEntries,
  ) {}

  take(song: NormalizedSong, quality: AudioQuality): CachedAudio | null {
    const key = cacheKey(song, quality);
    const preloaded = this.takePreloaded(key);
    if (preloaded) return { result: preloaded.result, audio: preloaded.audio };
    const cached = this.takeUrl(key);
    return cached ? { result: cached.result, audio: null } : null;
  }

  has(song: NormalizedSong, quality: AudioQuality): boolean {
    const key = cacheKey(song, quality);
    return this.isFresh(this.urls.get(key)) || this.isFresh(this.audios.get(key));
  }

  store(song: NormalizedSong, quality: AudioQuality, result: AudioUrlResult): void {
    const key = cacheKey(song, quality);
    const expiresAt = Date.now() + this.ttlMs;
    this.deleteKey(key);
    this.trimForInsert();
    this.urls.set(key, { result, expiresAt });
    this.audios.set(key, { result, expiresAt, audio: this.createPreloadedAudio(result) });
  }

  clear(): void {
    for (const entry of this.audios.values()) disposeAudio(entry.audio);
    this.urls.clear();
    this.audios.clear();
  }

  private takePreloaded(key: string): PreloadedAudio | null {
    const entry = this.audios.get(key);
    if (!entry) return null;
    this.urls.delete(key);
    this.audios.delete(key);
    if (entry.expiresAt <= Date.now()) {
      disposeAudio(entry.audio);
      return null;
    }
    return entry;
  }

  private takeUrl(key: string): CacheEntry | null {
    const entry = this.urls.get(key);
    if (!entry) return null;
    this.urls.delete(key);
    if (entry.expiresAt <= Date.now()) return null;
    return entry;
  }

  private createPreloadedAudio(result: AudioUrlResult): HTMLAudioElement {
    const audio = this.createAudio();
    prepareAudioElement(audio);
    audio.src = result.url;
    try {
      audio.load();
    } catch {
      // Preloading is an optimization; playback can still use the cached URL.
    }
    return audio;
  }

  private isFresh(entry: CacheEntry | undefined): boolean {
    return Boolean(entry && entry.expiresAt > Date.now());
  }

  private trimForInsert(): void {
    while (this.urls.size >= this.maxEntries) {
      const oldestKey = oldestCacheKey(this.urls);
      if (!oldestKey) return;
      this.deleteKey(oldestKey);
    }
  }

  private deleteKey(key: string): void {
    this.urls.delete(key);
    const preloaded = this.audios.get(key);
    if (preloaded) disposeAudio(preloaded.audio);
    this.audios.delete(key);
  }
}

export function createBrowserAudioElement(): HTMLAudioElement {
  return new Audio();
}

export function prepareAudioElement(audio: HTMLAudioElement): void {
  audio.preload = "auto";
  audio.setAttribute("playsinline", "true");

  // iOS 后台播放关键配置
  // 设置 audio 为媒体播放器，允许后台和锁屏播放
  audio.setAttribute("x-webkit-airplay", "allow");

  // 确保音频会话被正确初始化（iOS 需要）
  // 这会让 iOS 识别这是一个媒体播放应用
  if ('mediaSession' in navigator) {
    // MediaSession API 会自动处理音频会话类型
    // 但我们需要确保在第一次播放前就初始化
    try {
      // 设置一个默认的 metadata，确保 iOS 将其识别为音频播放器
      if (!navigator.mediaSession.metadata) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'Loading...',
          artist: '',
          album: '',
        });
      }
    } catch {
      // 某些浏览器可能不支持 MediaMetadata
    }
  }
}

export function disposeAudio(audio: HTMLAudioElement): void {
  try {
    audio.pause();
  } catch {
    // The media element may already be detached or unavailable in test DOMs.
  }
  audio.removeAttribute("src");
}

function oldestCacheKey(entries: Map<string, CacheEntry>): string | null {
  let oldestKey: string | null = null;
  let oldestExpiry = Infinity;
  for (const [key, entry] of entries.entries()) {
    if (entry.expiresAt < oldestExpiry) {
      oldestExpiry = entry.expiresAt;
      oldestKey = key;
    }
  }
  return oldestKey;
}

function cacheKey(song: NormalizedSong, quality: AudioQuality): string {
  return `${song.stableId}:${quality}`;
}
