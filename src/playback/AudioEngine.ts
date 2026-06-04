import type { MusicProvider } from "@/providers/MusicProvider";
import { PlaybackFallbackService } from "@/playback/fallback";
import { PlaybackQueue } from "@/playback/PlaybackQueue";
import type { AudioQuality, AudioUrlResult, NormalizedSong, PlaybackMode } from "@/types/music";

type EngineState = "idle" | "loading" | "playing" | "paused" | "error";
type WakeLockSentinelLike = { release: () => Promise<void>; addEventListener: (type: "release", listener: () => void) => void };
type CachedAudioUrl = { result: AudioUrlResult; expiresAt: number };

const preResolvedTtlMs = 5 * 60 * 1000;

export class AudioEngine {
  private readonly audio: HTMLAudioElement;
  private queue = new PlaybackQueue();
  private state: EngineState = "idle";
  private currentQuality: AudioQuality = "flac";
  private currentSong: NormalizedSong | null = null;
  private wakeLock: WakeLockSentinelLike | null = null;
  private readonly preResolvedUrls = new Map<string, CachedAudioUrl>();
  private readonly handleVisibilityChange = (): void => {
    if (document.visibilityState === "visible" && this.state === "playing") void this.requestWakeLock();
  };

  private timeListeners = new Set<(timeMs: number, durationMs: number) => void>();
  private stateListeners = new Set<(state: EngineState) => void>();
  private trackListeners = new Set<(song: NormalizedSong, index: number) => void>();

  constructor(
    private readonly providers: MusicProvider[],
    private readonly fallback = new PlaybackFallbackService(providers),
    audio?: HTMLAudioElement,
  ) {
    this.audio = audio ?? new Audio();
    this.audio.preload = "auto";
    this.audio.setAttribute("playsinline", "true");
    this.bindEvents();
  }

  getState(): EngineState {
    return this.state;
  }

  getCurrentSong(): NormalizedSong | null {
    return this.currentSong;
  }

  getCurrentTime(): number {
    return this.audio.currentTime * 1000;
  }

  getDuration(): number {
    return Number.isFinite(this.audio.duration) ? this.audio.duration * 1000 : 0;
  }

  onTime(listener: (timeMs: number, durationMs: number) => void): () => void {
    this.timeListeners.add(listener);
    return () => this.timeListeners.delete(listener);
  }

  onStateChange(listener: (state: EngineState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onTrackChange(listener: (song: NormalizedSong, index: number) => void): () => void {
    this.trackListeners.add(listener);
    return () => this.trackListeners.delete(listener);
  }

  destroy(): void {
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.audio.pause();
    this.audio.src = "";
    void this.releaseWakeLock();
    this.timeListeners.clear();
    this.stateListeners.clear();
    this.trackListeners.clear();
  }

  setMode(mode: PlaybackMode): void {
    this.queue = this.queue.setMode(mode);
  }

  replaceQueue(items: NormalizedSong[], cursor = 0): void {
    this.queue = this.queue.replace(items, cursor);
    this.currentSong = this.queue.current;
  }

  enqueue(item: NormalizedSong): void {
    this.queue = this.queue.enqueue(item);
  }

  async playCurrent(quality = this.currentQuality): Promise<void> {
    const song = this.currentSong ?? this.queue.current;
    if (!song) return;
    this.currentQuality = quality;
    this.setState("loading");
    try {
      const resolved = await this.resolvePlayableUrl(song, quality);
      this.audio.src = resolved.url;
      await this.requestWakeLock();
      try {
        await this.audio.play();
      } catch {
        // 锁屏/后台自动切歌时，浏览器可能因缺少用户手势拒绝 play()；
        // 保持暂停态，等待 MediaSession 的 play 按钮（用户手势）恢复，而不是进入错误态。
        this.currentSong = song;
        this.setState("paused");
        this.emitTrackChange();
        return;
      }
      this.currentSong = song;
      this.setState("playing");
      this.emitTrackChange();
      this.preResolveNext(quality);
    } catch {
      this.setState("error");
      throw new Error(`Unable to play ${song.name}`);
    }
  }

  pause(): void {
    this.audio.pause();
    void this.releaseWakeLock();
    this.setState("paused");
  }

  async resume(): Promise<void> {
    if (!this.audio.src) {
      await this.playCurrent();
      return;
    }
    await this.requestWakeLock();
    await this.audio.play();
    this.setState("playing");
  }

  async next(): Promise<void> {
    this.queue = this.queue.next();
    this.currentSong = this.queue.current;
    await this.playCurrent();
  }

  async previous(): Promise<void> {
    this.queue = this.queue.previous();
    this.currentSong = this.queue.current;
    await this.playCurrent();
  }

  async jumpTo(index: number): Promise<void> {
    this.queue = this.queue.jumpTo(index);
    this.currentSong = this.queue.current;
    await this.playCurrent();
  }

  getQueueItems(): NormalizedSong[] {
    return this.queue.tracks;
  }

  getQueueIndex(): number {
    return this.queue.index;
  }

  seek(timeMs: number): void {
    this.audio.currentTime = Math.max(0, timeMs / 1000);
    this.emitTime();
  }

  async playSong(song: NormalizedSong, quality: AudioQuality = this.currentQuality): Promise<void> {
    this.queue = this.queue.replace([song], 0);
    this.currentSong = song;
    await this.playCurrent(quality);
  }

  private setState(state: EngineState): void {
    this.state = state;
    this.stateListeners.forEach((listener) => listener(state));
  }

  private emitTime(): void {
    const timeMs = this.getCurrentTime();
    const durationMs = this.getDuration();
    this.timeListeners.forEach((listener) => listener(timeMs, durationMs));
  }

  private emitTrackChange(): void {
    if (!this.currentSong) return;
    this.trackListeners.forEach((listener) => listener(this.currentSong as NormalizedSong, this.queue.index));
  }

  private async resolvePlayableUrl(song: NormalizedSong, quality: AudioQuality): Promise<AudioUrlResult> {
    const key = cacheKey(song, quality);
    const cached = this.preResolvedUrls.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      this.preResolvedUrls.delete(key);
      return cached.result;
    }
    return this.fallback.resolvePlayableUrl(song, quality);
  }

  private preResolveNext(quality: AudioQuality): void {
    if (document.visibilityState !== "visible") return;
    const next = this.queue.peekNext();
    if (!next || next.stableId === this.currentSong?.stableId) return;
    const key = cacheKey(next, quality);
    const cached = this.preResolvedUrls.get(key);
    if (cached && cached.expiresAt > Date.now()) return;
    void this.fallback.resolvePlayableUrl(next, quality)
      .then((result) => {
        this.preResolvedUrls.set(key, { result, expiresAt: Date.now() + preResolvedTtlMs });
      })
      .catch(() => {
        this.preResolvedUrls.delete(key);
      });
  }

  private bindEvents(): void {
    this.audio.addEventListener("ended", () => void this.next());
    this.audio.addEventListener("error", () => this.setState("error"));
    this.audio.addEventListener("play", () => { void this.requestWakeLock(); this.setState("playing"); });
    this.audio.addEventListener("pause", () => { if (this.state === "playing") this.setState("paused"); void this.releaseWakeLock(); });
    this.audio.addEventListener("timeupdate", () => this.emitTime());
    this.audio.addEventListener("loadedmetadata", () => this.emitTime());
    this.audio.addEventListener("durationchange", () => this.emitTime());
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
  }

  private async requestWakeLock(): Promise<void> {
    if (document.visibilityState !== "visible" || this.wakeLock) return;
    const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> } };
    if (!nav.wakeLock) return;
    try {
      this.wakeLock = await nav.wakeLock.request("screen");
      this.wakeLock.addEventListener("release", () => { this.wakeLock = null; });
    } catch {
      this.wakeLock = null;
    }
  }

  private async releaseWakeLock(): Promise<void> {
    const lock = this.wakeLock;
    this.wakeLock = null;
    try {
      await lock?.release();
    } catch {
      // Wake Lock release can fail after the browser has already revoked it.
    }
  }
}

function cacheKey(song: NormalizedSong, quality: AudioQuality): string {
  return `${song.stableId}:${quality}`;
}
