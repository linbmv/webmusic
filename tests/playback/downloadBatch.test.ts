import { describe, expect, it, vi } from "vitest";
import { downloadSongsToServer } from "@/playback/downloadBatch";
import * as accountApi from "@/services/accountApi";
import type { MusicProvider } from "@/providers/MusicProvider";
import type { AudioQuality, AudioUrlResult, NormalizedSong, ProviderId, SongUrlRequest } from "@/types/music";

vi.mock("@/services/accountApi", () => ({
  createServerDownload: vi.fn(),
}));

const providerId: ProviderId = "mock";

describe("downloadSongsToServer", () => {
  it("keeps downloading later songs and reports per-song failures", async () => {
    const qualities: Array<{ id: string; quality: AudioQuality }> = [];
    vi.mocked(accountApi.createServerDownload).mockImplementation(async (song, quality) => ({
      id: `download-${song.providerSongId}`,
      song,
      quality,
      sizeBytes: 10,
      streamUrl: `/api/me/downloads/${song.providerSongId}/stream`,
      createdAt: 1,
    }));
    const provider = baseProvider(async (req) => {
      const quality = req.br ?? "320kmp3";
      qualities.push({ id: req.id, quality });
      if (req.id === "b") throw new Error("url unavailable");
      return { url: `https://example.test/${req.id}.${quality}`, direct: true, providerId, source: "netease", quality };
    });

    const summary = await downloadSongsToServer([song("a"), song("b")], [provider]);

    expect(summary).toMatchObject({ requested: 2, succeeded: 1, failed: 1 });
    expect(summary.failures[0]).toMatchObject({ songName: "Song b", error: "url unavailable" });
    expect(accountApi.createServerDownload).toHaveBeenCalledTimes(1);
    expect(qualities).toEqual(expect.arrayContaining([{ id: "a", quality: "flac" }]));
  });
});

function baseProvider(getSongUrl: (req: SongUrlRequest) => Promise<AudioUrlResult>): MusicProvider {
  return {
    id: providerId,
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
  };
}

function song(id: string): NormalizedSong {
  return {
    stableId: `mock:netease:song:${id}`,
    providerSongId: id,
    provider: { providerId, source: "netease" },
    name: `Song ${id}`,
    artists: ["Artist"],
    artistText: "Artist",
    raw: {},
  };
}
