import { defineStore } from "pinia";
import { computed, ref, shallowRef, watch } from "vue";
import { AudioEngine } from "@/playback/AudioEngine";
import { DownloadService, type DownloadResult } from "@/playback/download";
import { LyricSync } from "@/lyrics/parser";
import { PlaybackQueue } from "@/playback/PlaybackQueue";
import { activeLineIndexOf, lyricWindow } from "@/playback/lyricWindow";
import { syncMediaSessionMetadata, syncMediaSessionPlaybackState, syncMediaSessionPosition } from "@/playback/mediaSession";
import { createProgressSnapshotSaver, loadPlayerSnapshot, savePlayerSnapshot, type PlayerSnapshot } from "@/playback/playerPersistence";
import { useLibraryStore } from "@/stores/libraryStore";
import { useAccountStore } from "@/stores/accountStore";
import { useProviderStore } from "@/stores/providerStore";
import type { AudioQuality, LyricLine, NormalizedSong, ParsedLyric, PlaybackMode } from "@/types/music";
import * as accountApi from "@/services/accountApi";

type PlayerState = "idle" | "loading" | "playing" | "paused" | "error";
const CLOUD_SYNC_THROTTLE_MS = 10_000;

export const usePlayerStore = defineStore("player", () => {
  const snapshot = loadPlayerSnapshot();
  const providerStore = useProviderStore();
  const libraryStore = useLibraryStore();
  const accountStore = useAccountStore();
  const engine = shallowRef(createEngine());
  const queue = ref(new PlaybackQueue());
  const currentSong = ref<NormalizedSong | null>(null);
  const state = ref<PlayerState>("idle");
  // 播放默认 320k：比 flac 解析/缓冲更快；下载仍用 flac 最高品质
  const quality = ref<AudioQuality>(snapshot?.quality ?? "320kmp3");
  const mode = ref<PlaybackMode>(snapshot?.mode ?? "list");
  const lyric = ref<ParsedLyric | null>(null);
  const currentTimeMs = ref(0);
  const durationMs = ref(0);
  const isPlaying = computed(() => state.value === "playing");
  const lyricSync = computed(() => (lyric.value ? new LyricSync(lyric.value.lines) : null));
  const activeLineIndex = computed(() => activeLineIndexOf(lyric.value?.lines ?? [], currentTimeMs.value));
  const activeLyricLines = computed(() => lyricWindow(lyric.value?.lines ?? [], activeLineIndex.value));
  const progress = computed(() => (durationMs.value > 0 ? Math.min(1, currentTimeMs.value / durationMs.value) : 0));
  const queueItems = computed(() => queue.value.tracks);
  const queueIndex = computed(() => queue.value.index);
  const saveProgressSnapshot = createProgressSnapshotSaver();
  const downloadsMap = computed(() => new Map(accountStore.downloads.map((d) => [d.song.stableId, d])));

  let lastCloudSyncAt = 0;
  let cloudSyncPending = false;

  bindEngine(engine.value);
  engine.value.setMode(mode.value);

  watch(() => providerStore.config, handleProviderConfigChange, { deep: true });

  function createEngine(): AudioEngine {
    return new AudioEngine([providerStore.activeProvider, ...providerStore.registry.getFallbacks()]);
  }

  function withDirectUrl(song: NormalizedSong): NormalizedSong {
    const download = downloadsMap.value.get(song.stableId);
    return download ? { ...song, directUrl: download.streamUrl } : song;
  }

  function bindEngine(target: AudioEngine): void {
    target.onTime((timeMs, totalMs) => {
      currentTimeMs.value = timeMs;
      if (totalMs > 0) durationMs.value = totalMs;
      syncMediaSessionPosition(currentTimeMs.value, durationMs.value);
      saveProgressSnapshot(playerSnapshot());
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
      syncMediaSessionMetadata(song, { resume, pause, previous, next, seek });
      void syncTrackDetails(song);
      persistPlaybackState();
    });
  }

  function handleProviderConfigChange(): void {
    const tracks = queue.value.tracks;
    const cursor = queue.value.index;
    const wasPlaying = state.value === "playing";
    engine.value.destroy();
    engine.value = createEngine();
    bindEngine(engine.value);
    engine.value.setMode(mode.value);
    if (tracks.length) engine.value.replaceQueue(tracks, cursor);
    if (wasPlaying && tracks.length) void replayRestoredQueue();
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
    persistPlaybackState();
    try {
      await engine.value.playSong(withDirectUrl(song), quality.value);
      state.value = engine.value.getState();
    } catch {
      state.value = "error";
    }
  }

  async function playQueue(items: NormalizedSong[], cursor = 0): Promise<void> {
    queue.value = queue.value.replace(items, cursor);
    currentSong.value = queue.value.current;
    const itemsWithDirectUrl = items.map(withDirectUrl);
    engine.value.replaceQueue(itemsWithDirectUrl, cursor);
    currentTimeMs.value = 0;
    durationMs.value = currentSong.value?.durationMs ?? 0;
    persistPlaybackState();
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
    persistPlaybackState();
    if (accountStore.user) {
      accountApi.savePlayback(playerSnapshot()).catch(() => undefined);
    }
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
    persistPlaybackState();
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
    persistPlaybackState();
  }

  function cycleMode(): void {
    const order: PlaybackMode[] = ["list", "single", "shuffle"];
    setMode(order[(order.indexOf(mode.value) + 1) % order.length]);
  }

  async function setQuality(nextQuality: AudioQuality): Promise<void> {
    quality.value = nextQuality;
    persistPlaybackState();
    if (!currentSong.value) return;
    engine.value.replaceQueue(queue.value.tracks, queue.value.index);
    await replayRestoredQueue();
  }

  async function restoreLastSession(): Promise<void> {
    if (state.value !== "idle" || currentSong.value || queue.value.length > 0) return;
    const saved = loadPlayerSnapshot();
    if (!saved) return;
    mode.value = saved.mode;
    quality.value = saved.quality;
    engine.value.setMode(saved.mode);
    if (!saved.queue.length) {
      persistPlaybackState();
      return;
    }
    queue.value = new PlaybackQueue().setMode(saved.mode).replace(saved.queue, saved.cursor);
    currentSong.value = queue.value.current;
    currentTimeMs.value = saved.currentTimeMs;
    durationMs.value = currentSong.value?.durationMs ?? 0;
    engine.value.replaceQueue(saved.queue, saved.cursor);
    await replayRestoredQueue();
    if (saved.currentTimeMs > 0 && engine.value.getState() !== "error") seek(saved.currentTimeMs);
    persistPlaybackState();
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
    } catch (caught) {
      console.warn("Track detail sync failed", caught);
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

  function persistPlaybackState(): void {
    savePlayerSnapshot(playerSnapshot());
    queueCloudSync();
  }

  function queueCloudSync(): void {
    if (!accountStore.user || cloudSyncPending) return;
    const now = Date.now();
    if (now - lastCloudSyncAt < CLOUD_SYNC_THROTTLE_MS) return;
    cloudSyncPending = true;
    setTimeout(() => {
      cloudSyncPending = false;
      lastCloudSyncAt = Date.now();
      accountApi.savePlayback(playerSnapshot()).catch(() => undefined);
    }, 300);
  }

  async function syncPlaybackFromCloud(): Promise<void> {
    if (state.value !== "idle" || currentSong.value || queue.value.length > 0) return;
    try {
      const remote = await accountApi.getPlayback();
      if (!remote.state || !remote.updatedAt) return;
      const local = loadPlayerSnapshot();
      if (local && local.updatedAt >= remote.updatedAt) return;
      const snapshot = remote.state as PlayerSnapshot;
      mode.value = snapshot.mode;
      quality.value = snapshot.quality;
      engine.value.setMode(snapshot.mode);
      if (!snapshot.queue.length) return;
      queue.value = new PlaybackQueue().setMode(snapshot.mode).replace(snapshot.queue, snapshot.cursor);
      currentSong.value = queue.value.current;
      currentTimeMs.value = snapshot.currentTimeMs;
      durationMs.value = currentSong.value?.durationMs ?? 0;
      engine.value.replaceQueue(snapshot.queue.map(withDirectUrl), snapshot.cursor);
      await replayRestoredQueue();
      if (snapshot.currentTimeMs > 0 && engine.value.getState() !== "error") seek(snapshot.currentTimeMs);
      savePlayerSnapshot(snapshot);
    } catch (err) {
      console.warn("Cloud playback sync failed", err);
    }
  }

  function playerSnapshot(): PlayerSnapshot {
    return {
      mode: mode.value,
      quality: quality.value,
      queue: queue.value.tracks,
      cursor: queue.value.index,
      currentTimeMs: currentTimeMs.value,
      updatedAt: Date.now(),
    };
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
    restoreLastSession,
    activeLine,
    downloadSong,
    syncPlaybackFromCloud,
  };
});
