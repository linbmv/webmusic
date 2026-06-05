import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePlayerStore } from "@/stores/playerStore";
import type { NormalizedSong } from "@/types/music";

const audioEngineMock = vi.hoisted(() => {
  type StateListener = (state: "idle" | "loading" | "playing" | "paused" | "error") => void;
  type TrackListener = (song: NormalizedSong, index: number) => void;
  let latest: MockAudioEngine | null = null;

  class MockAudioEngine {
    private readonly stateListeners: StateListener[] = [];
    private readonly trackListeners: TrackListener[] = [];

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
    setMode(): void {}
    replaceQueue(): void {}
    getState(): "playing" { return "playing"; }
    pause(): void {}
    seek(): void {}
    async resume(): Promise<void> {}
    async next(): Promise<void> {}
    async previous(): Promise<void> {}
    async jumpTo(): Promise<void> {}
    async playCurrent(): Promise<void> {}
    async playSong(): Promise<void> {}

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
});

function testSong(): NormalizedSong {
  return {
    stableId: "mock:netease:song:s1",
    providerSongId: "s1",
    provider: { providerId: "mock", source: "netease" },
    name: "Song",
    artists: ["Artist"],
    artistText: "Artist",
    raw: {},
  };
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
