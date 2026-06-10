import type { MusicProvider } from "@/providers/MusicProvider";
import { AudioPreloadCache, createBrowserAudioElement, disposeAudio, prepareAudioElement, type AudioElementFactory, type CachedAudio } from "@/playback/audioPreloadCache";
import { PlaybackFallbackService } from "@/playback/fallback";
import { PlaybackQueue } from "@/playback/PlaybackQueue";
import type { AudioQuality, NormalizedSong, PlaybackMode } from "@/types/music";

type EngineState = "idle" | "loading" | "playing" | "paused" | "error";
type WakeLockSentinelLike = { release: () => Promise<void>; addEventListener: (type: "release", listener: () => void) => void };

// 顺序播放时预解析当前之后的曲目数量
const PRELOAD_AHEAD = 2;

export class AudioEngine {
  private audio: HTMLAudioElement;
  private queue = new PlaybackQueue();
  private state: EngineState = "idle";
  private currentQuality: AudioQuality = "flac";
  private currentSong: NormalizedSong | null = null;
  private currentMode: PlaybackMode = "list";
  private wakeLock: WakeLockSentinelLike | null = null;
  private readonly preloads: AudioPreloadCache;
  private operationId = 0;

  private readonly handleVisibilityChange = (): void => {
    if (document.visibilityState === "visible" && this.state === "playing") void this.requestWakeLock();
  };
  private readonly onEnded = (): void => this.handleEnded();
  private readonly onError = (): void => this.setState("error");
  private readonly onPlay = (): void => { void this.requestWakeLock(); this.setState("playing"); };
  private readonly onPause = (): void => { if (this.state === "playing") this.setState("paused"); void this.releaseWakeLock(); };
  private readonly onTimeUpdate = (): void => this.emitTime();
  private readonly onLoadedMetadata = (): void => this.emitTime();
  private readonly onDurationChange = (): void => this.emitTime();

  private timeListeners = new Set<(timeMs: number, durationMs: number) => void>();
  private stateListeners = new Set<(state: EngineState) => void>();
  private trackListeners = new Set<(song: NormalizedSong, index: number) => void>();

  constructor(
    private readonly providers: MusicProvider[],
    private readonly fallback = new PlaybackFallbackService(providers),
    audio?: HTMLAudioElement,
    private readonly createAudio: AudioElementFactory = createBrowserAudioElement,
  ) {
    this.audio = audio ?? this.createAudio();
    this.preloads = new AudioPreloadCache(this.createAudio);
    prepareAudioElement(this.audio);
    this.bindEvents();
  }

  getState(): EngineState { return this.state; }
  getCurrentSong(): NormalizedSong | null { return this.currentSong; }
  getCurrentTime(): number { return this.audio.currentTime * 1000; }
  getDuration(): number { return Number.isFinite(this.audio.duration) ? this.audio.duration * 1000 : 0; }
  getQueueItems(): NormalizedSong[] { return this.queue.tracks; }
  getQueueIndex(): number { return this.queue.index; }

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
    this.unbindAudioEvents(this.audio);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    disposeAudio(this.audio);
    this.preloads.clear();
    void this.releaseWakeLock();
    this.timeListeners.clear();
    this.stateListeners.clear();
    this.trackListeners.clear();
  }

  setMode(mode: PlaybackMode): void {
    this.currentMode = mode;
    this.queue = this.queue.setMode(mode);
    this.audio.loop = mode === "single";
  }

  replaceQueue(items: NormalizedSong[], cursor = 0): void {
    this.preloads.clear();
    this.queue = this.queue.replace(items, cursor);
    this.currentSong = this.queue.current;
  }

  enqueue(item: NormalizedSong): void {
    this.queue = this.queue.enqueue(item);
  }

  async playCurrent(quality = this.currentQuality): Promise<void> {
    const op = ++this.operationId;
    const song = this.currentSong ?? this.queue.current;
    if (!song) return;
    this.currentQuality = quality;
    this.setState("loading");
    try {
      const resolved = await this.resolvePlayableAudio(song, quality);
      if (op !== this.operationId) {
        disposeResolvedAudio(resolved);
        return;
      }
      this.loadPlaybackSource(resolved);
      await this.requestWakeLock();
      if (!await this.tryPlayCurrentAudio(op, song)) return;
      this.preResolveNeighbors(quality);
    } catch {
      if (op !== this.operationId) return;
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
    if (this.playCachedAdvance("next")) return;
    this.queue = this.queue.next();
    this.currentSong = this.queue.current;
    await this.playCurrent();
  }

  async previous(): Promise<void> {
    if (this.playCachedAdvance("previous")) return;
    this.queue = this.queue.previous();
    this.currentSong = this.queue.current;
    await this.playCurrent();
  }

  async jumpTo(index: number): Promise<void> {
    this.queue = this.queue.jumpTo(index);
    this.currentSong = this.queue.current;
    await this.playCurrent();
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

  private async tryPlayCurrentAudio(op: number, song: NormalizedSong): Promise<boolean> {
    try {
      await this.audio.play();
    } catch {
      if (op !== this.operationId) return false;
      this.currentSong = song;
      this.setState("paused");
      this.emitTrackChange();
      return false;
    }
    if (op !== this.operationId) return false;
    this.currentSong = song;
    this.setState("playing");
    this.emitTrackChange();
    return true;
  }

  private setState(state: EngineState): void {
    this.state = state;
    this.stateListeners.forEach((listener) => listener(state));
  }

  private emitTime(): void {
    this.timeListeners.forEach((listener) => listener(this.getCurrentTime(), this.getDuration()));
  }

  private emitTrackChange(): void {
    if (!this.currentSong) return;
    this.trackListeners.forEach((listener) => listener(this.currentSong as NormalizedSong, this.queue.index));
  }

  private async resolvePlayableAudio(song: NormalizedSong, quality: AudioQuality): Promise<CachedAudio> {
    const cached = this.preloads.take(song, quality);
    if (cached) return cached;
    const result = await this.fallback.resolvePlayableUrl(song, quality);
    return { result, audio: null };
  }

  private preResolveNeighbors(quality: AudioQuality): void {
    const op = this.operationId;
    const candidates = [this.queue.peekNext(), this.queue.peekPrevious(), ...this.upcomingSongs(PRELOAD_AHEAD)];
    const seen = new Set<string>();
    for (const song of candidates) {
      if (!song || song.stableId === this.currentSong?.stableId) continue;
      const key = `${song.stableId}:${quality}`;
      if (seen.has(key) || this.preloads.has(song, quality)) continue;
      seen.add(key);
      void this.fallback.resolvePlayableUrl(song, quality)
        .then((result) => {
          if (op === this.operationId) this.preloads.store(song, quality, result);
        })
        .catch(() => undefined);
    }
  }

  // 顺序播放时，预解析当前之后的若干首，点歌单后续曲目能更快开播
  private upcomingSongs(count: number): NormalizedSong[] {
    const tracks = this.queue.tracks;
    if (tracks.length <= 1) return [];
    const start = this.queue.index;
    const result: NormalizedSong[] = [];
    for (let offset = 1; offset <= count; offset += 1) {
      const song = tracks[start + offset];
      if (!song) break;
      result.push(song);
    }
    return result;
  }

  private handleEnded(): void {
    if (this.playCachedAdvance("next")) return;
    void this.next();
  }

  private playCachedAdvance(direction: "next" | "previous"): boolean {
    const quality = this.currentQuality;
    const advanced = direction === "next" ? this.queue.next() : this.queue.previous();
    const song = advanced.current;
    if (!song || song.stableId === this.currentSong?.stableId) return false;
    const cached = this.preloads.take(song, quality);
    if (!cached) return false;
    this.queue = advanced;
    this.currentSong = song;
    this.loadPlaybackSource(cached);
    const playPromise = this.audio.play();
    this.setState("playing");
    this.emitTrackChange();
    Promise.resolve(playPromise)
      .then(() => this.preResolveNeighbors(quality))
      .catch(() => this.setState("paused"));
    return true;
  }

  private replaceAudioElement(nextAudio: HTMLAudioElement): void {
    const previousAudio = this.audio;
    this.unbindAudioEvents(previousAudio);
    disposeAudio(previousAudio);
    this.audio = nextAudio;
    prepareAudioElement(this.audio);
    this.audio.loop = this.currentMode === "single";
    this.bindAudioEvents(this.audio);
  }

  private loadPlaybackSource(source: CachedAudio): void {
    if (source.audio) {
      this.replaceAudioElement(source.audio);
      return;
    }
    this.disposeCurrentSource();
    this.audio.src = source.result.url;
  }

  private disposeCurrentSource(): void {
    if (!this.audio.src && !this.audio.currentSrc) return;
    this.unbindAudioEvents(this.audio);
    disposeAudio(this.audio);
    this.bindAudioEvents(this.audio);
  }

  private bindEvents(): void {
    this.bindAudioEvents(this.audio);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
  }

  private bindAudioEvents(audio: HTMLAudioElement): void {
    audio.addEventListener("ended", this.onEnded);
    audio.addEventListener("error", this.onError);
    audio.addEventListener("play", this.onPlay);
    audio.addEventListener("pause", this.onPause);
    audio.addEventListener("timeupdate", this.onTimeUpdate);
    audio.addEventListener("loadedmetadata", this.onLoadedMetadata);
    audio.addEventListener("durationchange", this.onDurationChange);
  }

  private unbindAudioEvents(audio: HTMLAudioElement): void {
    audio.removeEventListener("ended", this.onEnded);
    audio.removeEventListener("error", this.onError);
    audio.removeEventListener("play", this.onPlay);
    audio.removeEventListener("pause", this.onPause);
    audio.removeEventListener("timeupdate", this.onTimeUpdate);
    audio.removeEventListener("loadedmetadata", this.onLoadedMetadata);
    audio.removeEventListener("durationchange", this.onDurationChange);
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

function disposeResolvedAudio(source: CachedAudio): void {
  if (source.audio) disposeAudio(source.audio);
}
