import { describe, expect, it, vi } from "vitest";
import { AudioEngine } from "@/playback/AudioEngine";
import type { MusicProvider } from "@/providers/MusicProvider";
import type { AudioQuality, AudioUrlResult, NormalizedSong, ProviderId, SongUrlRequest } from "@/types/music";

const mockProviderId: ProviderId = "mock";

const song = (id: string): NormalizedSong => ({
  stableId: `mock:netease:song:${id}`,
  providerSongId: id,
  provider: { providerId: mockProviderId, source: "netease" },
  name: id,
  artists: ["artist"],
  artistText: "artist",
  raw: {},
});

const baseProvider = (getSongUrl: (req: SongUrlRequest) => Promise<AudioUrlResult>): MusicProvider => ({
  id: mockProviderId,
  displayName: "Mock",
  defaultSources: [],
  capabilities: { search: true, toplists: false, lyrics: false, queueSwitch: false, playlists: false, recommendations: false, personalFm: false },
  healthCheck: async () => ({ ok: true }),
  listSources: async () => [],
  search: async () => ({ items: [], page: 1, pageSize: 30, hasMore: false }),
  getPlaylist: async () => { throw new Error("unused"); },
  getQualities: async () => [],
  getLyric: async () => null,
  getSongUrl,
});

describe("AudioEngine", () => {
  it("starts each new track from flac after a previous track downgraded", async () => {
    const calls: Array<{ id: string; quality: AudioQuality }> = [];
    const provider = baseProvider(async (req) => {
      const quality = req.br ?? "320kmp3";
      calls.push({ id: req.id, quality });
      if (req.id === "a" && quality === "flac") throw new Error("flac unavailable");
      return { url: `https://example.test/${req.id}-${quality}.mp3`, direct: true, providerId: mockProviderId, source: "netease", quality };
    });
    const engine = new AudioEngine([provider], undefined, createAudioElement());

    engine.replaceQueue([song("a"), song("b")], 0);
    await engine.playCurrent("flac");
    await engine.next();

    expect(calls).toEqual(expect.arrayContaining([
      { id: "a", quality: "flac" },
      { id: "a", quality: "320kmp3" },
      { id: "b", quality: "flac" },
    ]));
    expect(calls.findIndex((call) => call.id === "b" && call.quality === "flac")).toBeGreaterThan(
      calls.findIndex((call) => call.id === "a" && call.quality === "320kmp3"),
    );
    engine.destroy();
  });

  it("pre-resolves the next track and reuses it on advance without re-resolving", async () => {
    const calls: string[] = [];
    const provider = baseProvider(async (req) => {
      calls.push(req.id);
      return { url: `https://example.test/${req.id}.mp3`, direct: true, providerId: mockProviderId, source: "netease", quality: req.br ?? "flac" };
    });
    const engine = new AudioEngine([provider], undefined, createAudioElement());

    engine.replaceQueue([song("a"), song("b")], 0);
    await engine.playCurrent("flac");
    // 当前曲播放后异步预解析下一首；等待微任务队列清空
    await flushPromises();
    expect(calls).toEqual(["a", "b"]);

    await engine.next();
    // 切到 b 时命中预解析缓存，不再重复解析 b；预解析的下一首回到 a
    await flushPromises();
    expect(calls).toEqual(["a", "b", "a"]);
    engine.destroy();
  });

  it("advances synchronously on ended using the pre-resolved url so background play() keeps the gesture", async () => {
    const calls: string[] = [];
    const provider = baseProvider(async (req) => {
      calls.push(req.id);
      return { url: `https://example.test/${req.id}.mp3`, direct: true, providerId: mockProviderId, source: "netease", quality: req.br ?? "flac" };
    });
    const audio = createAudioElement();
    const playSpy = audio.play as unknown as ReturnType<typeof vi.fn>;
    const engine = new AudioEngine([provider], undefined, audio);

    engine.replaceQueue([song("a"), song("b")], 0);
    await engine.playCurrent("flac");
    await flushPromises(); // 预解析下一首 b
    expect(calls).toEqual(["a", "b"]);
    const playsBeforeEnded = playSpy.mock.calls.length;

    // 模拟当前曲自然结束：必须在 ended 同步栈内换源并 play()，不得有 await 才能后台切歌
    audio.dispatchEvent(new Event("ended"));

    // 同步切到 b（命中缓存），src 已更新、play() 已同步调用、且未重复解析 b
    expect(audio.src).toContain("b.mp3");
    expect(engine.getCurrentSong()?.providerSongId).toBe("b");
    expect(playSpy.mock.calls.length).toBe(playsBeforeEnded + 1);
    expect(calls).toEqual(["a", "b"]);

    await flushPromises(); // play() 成功后异步预解析再下一首（回到 a）
    expect(calls).toEqual(["a", "b", "a"]);
    engine.destroy();
  });

  it("loops a single-track repeat natively so the lock screen continues without a new gesture", async () => {
    const provider = baseProvider(async (req) => ({ url: `https://example.test/${req.id}.mp3`, direct: true, providerId: mockProviderId, source: "netease", quality: req.br ?? "flac" }));
    const audio = createAudioElement();
    const engine = new AudioEngine([provider], undefined, audio);

    engine.setMode("single");
    expect(audio.loop).toBe(true);
    engine.setMode("list");
    expect(audio.loop).toBe(false);
    engine.destroy();
  });

  it("falls back to paused instead of error when play() is rejected in the background", async () => {
    const provider = baseProvider(async (req) => ({ url: `https://example.test/${req.id}.mp3`, direct: true, providerId: mockProviderId, source: "netease", quality: req.br ?? "flac" }));
    const audio = document.createElement("audio");
    vi.spyOn(audio, "play").mockRejectedValue(new DOMException("NotAllowedError"));
    vi.spyOn(audio, "pause").mockImplementation(() => undefined);
    const states: string[] = [];
    const engine = new AudioEngine([provider], undefined, audio);
    engine.onStateChange((state) => states.push(state));

    engine.replaceQueue([song("a")], 0);
    await engine.playCurrent("flac");

    expect(engine.getState()).toBe("paused");
    expect(states).toContain("paused");
    expect(states).not.toContain("error");
    engine.destroy();
  });
});

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createAudioElement(): HTMLAudioElement {
  const audio = document.createElement("audio");
  vi.spyOn(audio, "play").mockResolvedValue(undefined);
  vi.spyOn(audio, "pause").mockImplementation(() => undefined);
  return audio;
}
