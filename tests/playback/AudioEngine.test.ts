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

    expect(calls).toEqual([
      { id: "a", quality: "flac" },
      { id: "a", quality: "320kmp3" },
      { id: "b", quality: "flac" },
    ]);
    engine.destroy();
  });
});

function createAudioElement(): HTMLAudioElement {
  const audio = document.createElement("audio");
  vi.spyOn(audio, "play").mockResolvedValue(undefined);
  vi.spyOn(audio, "pause").mockImplementation(() => undefined);
  return audio;
}
