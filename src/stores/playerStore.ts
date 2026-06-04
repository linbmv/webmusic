import { defineStore } from "pinia";
import { computed, ref, shallowRef, watch } from "vue";
import { AudioEngine } from "@/playback/AudioEngine";
import { DownloadService, type DownloadResult } from "@/playback/download";
import { LyricSync } from "@/lyrics/parser";
import { PlaybackQueue } from "@/playback/PlaybackQueue";
import { useLibraryStore } from "@/stores/libraryStore";
import { useAccountStore } from "@/stores/accountStore";
import { useProviderStore } from "@/stores/providerStore";
import type { AudioQuality, LyricLine, NormalizedSong, ParsedLyric, PlaybackMode } from "@/types/music";

export const usePlayerStore = defineStore("player", () => {
  const providerStore = useProviderStore();
  const libraryStore = useLibraryStore();
  const accountStore = useAccountStore();
  const engine = shallowRef(createEngine());
  const queue = ref(new PlaybackQueue());
  const currentSong = ref<NormalizedSong | null>(null);
  const state = ref<"idle" | "loading" | "playing" | "paused" | "error">("idle");
  const quality = ref<AudioQuality>("flac");
  const mode = ref<PlaybackMode>("list");
  const lyric = ref<ParsedLyric | null>(null);
  const currentTimeMs = ref(0);
  const durationMs = ref(0);
  const isPlaying = computed(() => state.value === "playing");
  const lyricSync = computed(() => (lyric.value ? new LyricSync(lyric.value.lines) : null));
  const activeLineIndex = computed(() => {
    if (!lyric.value?.lines.length) return -1;
    return lyric.value.lines.findIndex((line) => line === lyricSync.value?.getActiveLine(currentTimeMs.value));
  });
  const activeLyricLines = computed<{ previous: LyricLine | null; current: LyricLine | null; next: LyricLine | null }>(() => {
    const lines = lyric.value?.lines ?? [];
    const index = activeLineIndex.value;
    if (index < 0) return { previous: null, current: lines[0] ?? null, next: lines[1] ?? null };
    return { previous: lines[index - 1] ?? null, current: lines[index] ?? null, next: lines[index + 1] ?? null };
  });
  const progress = computed(() => (durationMs.value > 0 ? Math.min(1, currentTimeMs.value / durationMs.value) : 0));
  const queueItems = computed(() => queue.value.tracks);
  const queueIndex = computed(() => queue.value.index);

  bindEngine(engine.value);

  watch(
    () => providerStore.config,
    () => {
      const tracks = queue.value.tracks;
      const cursor = queue.value.index;
      const wasPlaying = state.value === "playing";
      engine.value.destroy();
      engine.value = createEngine();
      bindEngine(engine.value);
      engine.value.setMode(mode.value);
      if (tracks.length) engine.value.replaceQueue(tracks, cursor);
      if (wasPlaying && tracks.length) void replayRestoredQueue();
    },
    { deep: true },
  );

  function createEngine(): AudioEngine {
    return new AudioEngine([providerStore.activeProvider, ...providerStore.registry.getFallbacks()]);
  }

  function bindEngine(target: AudioEngine): void {
    target.onTime((timeMs, totalMs) => {
      currentTimeMs.value = timeMs;
      if (totalMs > 0) durationMs.value = totalMs;
      syncMediaSessionPosition();
    });
    target.onStateChange((next) => {
      state.value = next;
      syncMediaSessionPlaybackState(next);
    });
    target.onTrackChange((song, index) => {
      currentSong.value = song;
      queue.value = queue.value.jumpTo(index);
      currentTimeMs.value = 0;
      durationMs.value = song.durationMs ?? 0;
      syncMediaSessionMetadata(song);
      void syncTrackDetails(song);
    });
  }

  async function replayRestoredQueue(): Promise<void> {
    try {
      await engine.value.playCurrent(quality.value);
      state.value = engine.value.getState();
    } catch {
      state.value = "error";
    }
  }

  async function playSong(song: NormalizedSong): Promise<void> {
    queue.value = queue.value.replace([song], 0);
    currentSong.value = song;
    state.value = "loading";
    currentTimeMs.value = 0;
    durationMs.value = song.durationMs ?? 0;
    try {
      await engine.value.playSong(song, quality.value);
      state.value = engine.value.getState();
    } catch {
      state.value = "error";
    }
  }

  async function playQueue(items: NormalizedSong[], cursor = 0): Promise<void> {
    queue.value = queue.value.replace(items, cursor);
    currentSong.value = queue.value.current;
    engine.value.replaceQueue(items, cursor);
    currentTimeMs.value = 0;
    durationMs.value = currentSong.value?.durationMs ?? 0;
    try {
      await engine.value.playCurrent(quality.value);
      state.value = engine.value.getState();
    } catch {
      state.value = "error";
    }
  }

  function pause(): void {
    engine.value.pause();
    state.value = "paused";
  }

  async function resume(): Promise<void> {
    if (!currentSong.value) return;
    try {
      await engine.value.resume();
      state.value = engine.value.getState();
    } catch {
      state.value = "error";
    }
  }

  async function togglePlay(): Promise<void> {
    if (isPlaying.value) {
      pause();
      return;
    }
    await resume();
  }

  async function next(): Promise<void> {
    try {
      await engine.value.next();
      state.value = engine.value.getState();
    } catch {
      state.value = "error";
    }
  }

  async function previous(): Promise<void> {
    try {
      await engine.value.previous();
      state.value = engine.value.getState();
    } catch {
      state.value = "error";
    }
  }

  function seek(timeMs: number): void {
    currentTimeMs.value = timeMs;
    engine.value.seek(timeMs);
  }

  async function jumpTo(index: number): Promise<void> {
    try {
      await engine.value.jumpTo(index);
      state.value = engine.value.getState();
    } catch {
      state.value = "error";
    }
  }

  function setMode(nextMode: PlaybackMode): void {
    mode.value = nextMode;
    queue.value = queue.value.setMode(nextMode);
    engine.value.setMode(nextMode);
  }

  function cycleMode(): void {
    const order: PlaybackMode[] = ["list", "single", "shuffle"];
    setMode(order[(order.indexOf(mode.value) + 1) % order.length]);
  }

  async function setQuality(nextQuality: AudioQuality): Promise<void> {
    quality.value = nextQuality;
    if (!currentSong.value) return;
    engine.value.replaceQueue(queue.value.tracks, queue.value.index);
    await replayRestoredQueue();
  }

  function syncMediaSessionMetadata(song: NormalizedSong): void {
    if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.name,
      artist: song.artistText,
      album: song.album?.name ?? "",
    });
    navigator.mediaSession.setActionHandler("play", () => void resume());
    navigator.mediaSession.setActionHandler("pause", () => pause());
    navigator.mediaSession.setActionHandler("previoustrack", () => void previous());
    navigator.mediaSession.setActionHandler("nexttrack", () => void next());
    navigator.mediaSession.setActionHandler("stop", () => pause());
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (typeof details.seekTime === "number") seek(details.seekTime * 1000);
    });
    syncMediaSessionPosition();
  }

  function syncMediaSessionPlaybackState(nextState: typeof state.value): void {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = nextState === "playing" ? "playing" : nextState === "paused" ? "paused" : "none";
  }

  function syncMediaSessionPosition(): void {
    const session = "mediaSession" in navigator ? navigator.mediaSession as MediaSession & { setPositionState?: (state?: MediaPositionState) => void } : null;
    if (!session?.setPositionState || durationMs.value <= 0) return;
    try {
      session.setPositionState({
        duration: Math.max(0, durationMs.value / 1000),
        position: Math.min(Math.max(0, currentTimeMs.value / 1000), Math.max(0, durationMs.value / 1000)),
        playbackRate: 1,
      });
    } catch {
      // 部分浏览器要求 duration/position 为有限非负数；非法时忽略，不影响播放
    }
  }

  async function loadLyric(song: NormalizedSong): Promise<void> {
    const provider = providerStore.registry.get(song.provider.providerId);
    try {
      const nextLyric = await provider.getLyric({
        id: song.providerSongId,
        source: song.provider.source,
        name: song.name,
        artist: song.artistText,
      });
      if (currentSong.value?.stableId === song.stableId) lyric.value = nextLyric;
    } catch {
      if (currentSong.value?.stableId === song.stableId) lyric.value = null;
    }
  }

  async function syncTrackDetails(song: NormalizedSong): Promise<void> {
    try {
      await loadLyric(song);
      await libraryStore.recordRecent(song);
    } catch {
      state.value = "error";
    }
  }

  function activeLine(timeMs: number): LyricLine | null {
    return lyricSync.value ? lyricSync.value.getActiveLine(timeMs) : null;
  }

  async function downloadSong(song: NormalizedSong, fallbackWindow?: Window | null): Promise<DownloadResult> {
    const service = new DownloadService([providerStore.activeProvider, ...providerStore.registry.getFallbacks()]);
    const result = await service.download(song, "flac", { server: Boolean(accountStore.user), fallbackWindow });
    if (result.method === "server") await accountStore.refreshDownloads();
    return result;
  }

  return {
    currentSong,
    state,
    quality,
    mode,
    lyric,
    currentTimeMs,
    durationMs,
    progress,
    queueItems,
    queueIndex,
    activeLyricLines,
    activeLineIndex,
    isPlaying,
    playSong,
    playQueue,
    pause,
    resume,
    togglePlay,
    next,
    previous,
    seek,
    jumpTo,
    setMode,
    cycleMode,
    setQuality,
    activeLine,
    downloadSong,
  };
});
