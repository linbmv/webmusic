import { afterEach, describe, expect, it, vi } from "vitest";
import { FreeMusicProvider } from "@/providers/FreeMusicProvider";
import type { NormalizedSong, ProviderConfigEntry } from "@/types/music";

const config: ProviderConfigEntry = {
  enabled: true,
  baseUrl: "/api/music/free",
  timeoutMs: 5_000,
};

describe("FreeMusicProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to song aggregation when artist search returns no artist list", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const type = url.searchParams.get("type");
      if (type === "artist") {
        return jsonResponse({ artists: null, hasMore: false, total: 9, type: "artist" });
      }
      if (type === "song") {
        return jsonResponse({
          hasMore: false,
          songs: [{ id: "4893061", name: "Song", artist: "\u6797\u5fc6\u83b2", album: "Album", duration: 285, source: "kuwo" }],
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new FreeMusicProvider(config, false);

    const result = await provider.searchTyped({ q: "\u6797\u5fc6\u83b2", type: "artist", page: 1, pageSize: 30 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ title: "\u6797\u5fc6\u83b2", source: "kuwo" });
  });

  it("uses upstream typed search fields and keeps zero-based page", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/api/music/free/search");
      expect(url.searchParams.get("type")).toBe("album");
      expect(url.searchParams.get("page")).toBe("0");
      return jsonResponse({
        albums: [{ albumid: "84032689", name: "\u9634\u5929", artist: "\u987e\u672a", musiccnt: "1", source: "kuwo" }],
        hasMore: true,
        total: 269,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new FreeMusicProvider(config, false);

    const result = await provider.searchTyped({ q: "\u9634\u5929", type: "album", page: 0, pageSize: 30 });

    expect(result).toMatchObject({ hasMore: true, total: 269 });
    expect(result.items[0]).toMatchObject({ title: "\u9634\u5929", subtitle: "\u987e\u672a \u00b7 1 \u9996", source: "kuwo" });
  });

  it("loads album songs from the dedicated album endpoint", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/api/music/free/album/songs");
      expect(url.searchParams.get("name")).toBe("\u9634\u5929");
      expect(url.searchParams.has("artist")).toBe(false);
      expect(url.searchParams.get("source")).toBe("netease");
      expect(url.searchParams.get("page")).toBe("0");
      expect(url.searchParams.get("size")).toBe("60");
      return jsonResponse({
        songs: [{ id: "276840", name: "\u9634\u5929", artist: "\u83ab\u6587\u851a", album: "\u56de\u851a", duration: 247, source: "netease" }],
        hasMore: false,
        total: 1,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new FreeMusicProvider(config, false);

    const result = await provider.getAlbumSongs({ name: "\u9634\u5929", artist: "\u83ab\u6587\u851a", page: 0, size: 60 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ name: "\u9634\u5929", artistText: "\u83ab\u6587\u851a" });
  });

  it("strips the artist prefix, sends source, and filters fuzzy album results by artist", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/api/music/free/album/songs");
      // \u53bb\u6389 "\u738b\u6770 - " \u6b4c\u624b\u524d\u7f00\uff0c\u53ea\u628a\u7eaf\u4e13\u8f91\u540d\u4f20\u7ed9\u4e0a\u6e38
      expect(url.searchParams.get("name")).toBe("LPCD45");
      // \u5fc5\u5e26 source\uff0c\u5426\u5219 kuwo \u4e13\u8f91\u6309 netease \u67e5\u4e0d\u5230
      expect(url.searchParams.get("source")).toBe("kuwo");
      // \u4e0d\u628a artist \u4f20\u7ed9\u4e0a\u6e38\uff08\u4e0a\u6e38\u6536\u5230 artist \u4f1a\u76f4\u63a5\u8fd4\u56de\u7a7a\uff09
      expect(url.searchParams.has("artist")).toBe(false);
      return jsonResponse({
        songs: [
          { id: "1", name: "\u4e3a\u4e86\u7231\u68a6\u4e00\u751f", artist: "\u738b\u6770", album: "LPCD45", source: "kuwo" },
          { id: "2", name: "\u6e29\u67d4\u7684\u4f60", artist: "\u738b\u6770&\u6797\u5fc6\u83b2", album: "LPCD45", source: "kuwo" },
          { id: "3", name: "\u5916\u5a46\u7684\u6f8e\u6e56\u6e7e", artist: "\u5f20\u660e\u654f", album: "Lpcd45", source: "kuwo" },
        ],
        total: 3,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new FreeMusicProvider(config, false);

    const result = await provider.getAlbumSongs({ name: "\u738b\u6770 - LPCD45", artist: "\u738b\u6770", source: "kuwo", page: 0, size: 60 });

    // \u4ec5\u4fdd\u7559\u4e13\u8f91\u6b4c\u624b\uff08\u738b\u6770\uff0c\u542b\u5408\u5531\uff09\u7684\u66f2\u76ee\uff0c\u6392\u9664\u540c\u540d\u5408\u8f91\u91cc\u5176\u4ed6\u6b4c\u624b\u7684\u6b4c
    expect(result.items.map((song) => song.name)).toEqual(["\u4e3a\u4e86\u7231\u68a6\u4e00\u751f", "\u6e29\u67d4\u7684\u4f60"]);
    expect(result.total).toBe(2);
  });

  it("sends FreeMusic sources as repeated query parameters", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/api/music/free/search");
      expect(url.searchParams.getAll("sources")).toEqual(["kuwo", "netease"]);
      return jsonResponse({
        songs: [{ id: "166739", name: "\u9634\u5929", artist: "\u83ab\u6587\u851a", duration: 242, source: "kuwo" }],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new FreeMusicProvider(config, false);

    const result = await provider.search({ q: "\u9634\u5929", sources: ["kuwo", "netease"] });

    expect(result.items[0]).toMatchObject({ providerSongId: "166739", provider: { source: "kuwo" } });
  });

  it("maps upstream 2000kflac quality to the internal flac value", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ qualities: [{ br: "2000kflac", name: "\u65e0\u635f\u97f3\u8d28 (FLAC)" }] })));
    const provider = new FreeMusicProvider(config, false);

    const result = await provider.getQualities(songFixture);

    expect(result).toEqual([{ label: "\u65e0\u635f\u97f3\u8d28 (FLAC)", value: "flac", source: "kuwo" }]);
  });
});

const songFixture: NormalizedSong = {
  stableId: "freeMusic:kuwo:song:166739",
  providerSongId: "166739",
  provider: { providerId: "freeMusic", source: "kuwo" },
  name: "\u9634\u5929",
  artists: ["\u83ab\u6587\u851a"],
  artistText: "\u83ab\u6587\u851a",
  durationMs: 242_000,
  raw: {},
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}
