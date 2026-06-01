import { afterEach, describe, expect, it, vi } from "vitest";
import { FreeMusicProvider } from "@/providers/FreeMusicProvider";
import type { ProviderConfigEntry } from "@/types/music";

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
      expect(url.searchParams.get("artist")).toBe("\u83ab\u6587\u851a");
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
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}
