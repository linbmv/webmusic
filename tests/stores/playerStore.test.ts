import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { playerStorageKey } from "@/playback/playerPersistence";
import { usePlayerStore } from "@/stores/playerStore";
import type { NormalizedSong } from "@/types/music";

const audioEngineMock = vi.hoisted(() => {
  type StateListener = (state: "idle" | "loading" | "playing" | "paused" | "error") => void;
  type TrackListener = (song: NormalizedSong, index: number) => void;
  let latest: MockAudioEngine | null = null;

  class MockAudioEngine {
    private readonly stateListeners: StateListener[] = [];
    private readonly trackListeners: TrackListener[] = [];
    private queue: NormalizedSong[] = [];
    private cursor = 0;
    mode: string | null = null;
    seekedTo: number | null = null;

    constructor() {
      latest = this;
    }

    onTime(): () => void { return () => undefined; }
    onStateChange(listener: StateListener): () => void {
      this.stateListeners.push(listener);
      return () => undefined;
    }
    onTrackChange(listener: TrackListener): () => void {
      this.trackListeners.push(listener);
      return () => undefined;
    }
    destroy(): void {}
    setMode(mode: string): void { this.mode = mode; }
    replaceQueue(items: NormalizedSong[], cursor = 0): void {
      this.queue = [...items];
      this.cursor = cursor;
    }
    getState(): "playing" { return "playing"; }
    pause(): void {}
    seek(timeMs: number): void { this.seekedTo = timeMs; }
    async resume(): Promise<void> {}
    async next(): Promise<void> {}
    async previous(): Promise<void> {}
    async jumpTo(): Promise<void> {}
    async playCurrent(): Promise<void> {
      this.emitState("playing");
      const song = this.queue[this.cursor];
      if (song) this.emitTrack(song, this.cursor);
    }
    async playSong(song: NormalizedSong): Promise<void> {
      this.queue = [song];
      this.cursor = 0;
      await this.playCurrent();
    }

    emitState(state: "idle" | "loading" | "playing" | "paused" | "error"): void {
      this.stateListeners.forEach((listener) => listener(state));
    }

    emitTrack(song: NormalizedSong, index = 0): void {
      this.trackListeners.forEach((listener) => listener(song, index));
    }
  }

  return {
    AudioEngine: MockAudioEngine,
    latest: () => latest,
  };
});

const libraryStoreMock = vi.hoisted(() => ({
  recordRecent: vi.fn(),
}));

const providerStoreMock = vi.hoisted(() => {
  const provider = {
    id: "mock",
    getLyric: vi.fn(async () => null),
  };
  return {
    store: {
      config: {},
      activeProvider: provider,
      registry: {
        getFallbacks: () => [],
        get: () => provider,
      },
    },
    provider,
  };
});

vi.mock("@/playback/AudioEngine", () => ({
  AudioEngine: audioEngineMock.AudioEngine,
}));

vi.mock("@/stores/libraryStore", () => ({
  useLibraryStore: () => libraryStoreMock,
}));

vi.mock("@/stores/providerStore", () => ({
  useProviderStore: () => providerStoreMock.store,
}));

vi.mock("@/stores/accountStore", () => ({
  useAccountStore: () => ({
    user: null,
    refreshDownloads: vi.fn(),
  }),
}));

describe("playerStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setActivePinia(createPinia());
    libraryStoreMock.recordRecent.mockRejectedValue(new Error("IndexedDB unavailable"));
  });

  it("keeps playback state when track detail sync fails after playback starts", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const store = usePlayerStore();
    const engine = audioEngineMock.latest();
    expect(engine).toBeTruthy();

    engine?.emitState("playing");
    engine?.emitTrack(testSong());
    await flushPromises();

    expect(store.state).toBe("playing");
    expect(warnSpy).toHaveBeenCalledWith("Track detail sync failed", expect.any(Error));
    warnSpy.mockRestore();
  });

  it("restores and persists the preferred playback mode", () => {
    localStorage.setItem(playerStorageKey, JSON.stringify({ mode: "shuffle", quality: "flac", queue: [] }));
    setActivePinia(createPinia());

    const store = usePlayerStore();

    expect(store.mode).toBe("shuffle");
    expect(audioEngineMock.latest()?.mode).toBe("shuffle");

    store.setMode("single");

    expect(JSON.parse(localStorage.getItem(playerStorageKey) ?? "{}").mode).toBe("single");
  });

  it("restores the last queue, current song, and playback position", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const queue = [testSong("a"), testSong("b")];
    localStorage.setItem(playerStorageKey, JSON.stringify({
      mode: "shuffle",
      quality: "320kmp3",
      queue,
      cursor: 1,
      currentTimeMs: 42_000,
      updatedAt: 100,
    }));
    setActivePinia(createPinia());
    const store = usePlayerStore();

    await store.restoreLastSession();

    expect(store.mode).toBe("shuffle");
    expect(store.quality).toBe("320kmp3");
    expect(store.currentSong?.stableId).toBe("mock:netease:song:b");
    expect(store.queueItems.map((song) => song.stableId)).toEqual(["mock:netease:song:a", "mock:netease:song:b"]);
    expect(audioEngineMock.latest()?.seekedTo).toBe(42_000);
    warnSpy.mockRestore();
  });

  it("does not restore over a queue started during bootstrap", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    localStorage.setItem(playerStorageKey, JSON.stringify({
      mode: "shuffle",
      quality: "flac",
      queue: [testSong("old")],
      cursor: 0,
    }));
    setActivePinia(createPinia());
    const store = usePlayerStore();

    await store.playQueue([testSong("new")], 0);
    await store.restoreLastSession();

    expect(store.currentSong?.stableId).toBe("mock:netease:song:new");
    expect(store.queueItems.map((song) => song.stableId)).toEqual(["mock:netease:song:new"]);
    warnSpy.mockRestore();
  });
});

function testSong(id = "s1"): NormalizedSong {
  return {
    stableId: `mock:netease:song:${id}`,
    providerSongId: id,
    provider: { providerId: "mock", source: "netease" },
    name: `Song ${id}`,
    artists: ["Artist"],
    artistText: "Artist",
    raw: {},
  };
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
