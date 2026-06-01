import type { MusicProvider } from "@/providers/MusicProvider";
import { PlaybackFallbackService } from "@/playback/fallback";
import { PlaybackQueue } from "@/playback/PlaybackQueue";
import type { AudioQuality, NormalizedSong, PlaybackMode } from "@/types/music";

type EngineState = "idle" | "loading" | "playing" | "paused" | "error";
type WakeLockSentinelLike = { release: () => Promise<void>; addEventListener: (type: "release", listener: () => void) => void };

export class AudioEngine {
  private readonly audio: HTMLAudioElement;
  private queue = new PlaybackQueue();
  private state: EngineState = "idle";
  private currentQuality: AudioQuality = "flac";
  private currentSong: NormalizedSong | null = null;
  private wakeLock: WakeLockSentinelLike | null = null;
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
      const resolved = await this.fallback.resolvePlayableUrl(song, quality);
      this.audio.src = resolved.url;
      await this.requestWakeLock();
      await this.audio.play();
      this.currentSong = song;
      this.setState("playing");
      this.emitTrackChange();
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
