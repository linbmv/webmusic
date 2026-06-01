import { describe, expect, it } from "vitest";
import { PlaybackFallbackService } from "@/playback/fallback";
import type { MusicProvider } from "@/providers/MusicProvider";
import type { AudioQuality, AudioUrlResult, NormalizedSong, ProviderId, SongUrlRequest } from "@/types/music";

const mockProviderId: ProviderId = "mock";

const song: NormalizedSong = {
  stableId: "mock:netease:song:a",
  providerSongId: "a",
  provider: { providerId: mockProviderId, source: "netease" },
  name: "Song",
  artists: ["Artist"],
  artistText: "Artist",
  raw: {},
};

const baseProvider = (id: ProviderId): MusicProvider => ({
  id,
  displayName: id,
  defaultSources: [],
  capabilities: { search: true, toplists: false, lyrics: false, queueSwitch: false, playlists: false, recommendations: false, personalFm: false },
  healthCheck: async () => ({ ok: true }),
  listSources: async () => [],
  search: async () => ({ items: [], page: 1, pageSize: 30, hasMore: false }),
  getPlaylist: async () => { throw new Error("unused"); },
  getQualities: async () => [],
  getLyric: async () => null,
  getSongUrl: async () => { throw new Error("failed"); },
});

describe("PlaybackFallbackService", () => {
  it("tries later providers after a failure", async () => {
    const first = baseProvider("mock");
    const second = {
      ...baseProvider("freeMusic"),
      getSongUrl: async (): Promise<AudioUrlResult> => ({
        url: "https://example.test/a.mp3",
        direct: true,
        providerId: "freeMusic",
        source: "netease",
        quality: "320kmp3",
      }),
    };
    const result = await new PlaybackFallbackService([first, second]).resolvePlayableUrl(song, "320kmp3");

    expect(result.url).toBe("https://example.test/a.mp3");
  });

  it("switches source before falling through providers", async () => {
    const switchedSong = { ...song, providerSongId: "b", provider: { providerId: mockProviderId, source: "kuwo" as const } };
    const provider = {
      ...baseProvider("mock"),
      getSongUrl: async ({ id }: { id: string }): Promise<AudioUrlResult> => {
        if (id === "b") return { url: "https://example.test/b.mp3", direct: true, providerId: "mock", source: "kuwo", quality: "320kmp3" };
        throw new Error("source failed");
      },
      switchSource: async () => switchedSong,
    };

    const result = await new PlaybackFallbackService([provider]).resolvePlayableUrl(song, "320kmp3");

    expect(result.url).toBe("https://example.test/b.mp3");
  });

  it("downgrades from flac through lower qualities when a quality is unavailable", async () => {
    const calls: AudioQuality[] = [];
    const provider = {
      ...baseProvider("mock"),
      getSongUrl: async (req: SongUrlRequest): Promise<AudioUrlResult> => {
        const quality = req.br ?? "320kmp3";
        calls.push(quality);
        if (quality !== "128kmp3") throw new Error(`${quality} unavailable`);
        return { url: "https://example.test/a-128.mp3", direct: true, providerId: "mock", source: "netease", quality };
      },
    };

    const result = await new PlaybackFallbackService([provider]).resolvePlayableUrl(song, "flac");

    expect(calls).toEqual(["flac", "320kmp3", "128kmp3"]);
    expect(result.quality).toBe("128kmp3");
  });

  it("uses 320k when only flac is unavailable", async () => {
    const calls: AudioQuality[] = [];
    const provider = {
      ...baseProvider("mock"),
      getSongUrl: async (req: SongUrlRequest): Promise<AudioUrlResult> => {
        const quality = req.br ?? "320kmp3";
        calls.push(quality);
        if (quality === "flac") throw new Error("flac unavailable");
        return { url: "https://example.test/a-320.mp3", direct: true, providerId: "mock", source: "netease", quality };
      },
    };

    const result = await new PlaybackFallbackService([provider]).resolvePlayableUrl(song, "flac");

    expect(calls).toEqual(["flac", "320kmp3"]);
    expect(result.quality).toBe("320kmp3");
  });
});
