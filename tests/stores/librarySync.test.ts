import { describe, expect, it } from "vitest";
import {
  baselineFromLibrary,
  isEmptyLibrary,
  mergeLibraries,
  mergeLibrariesWithBaseline,
  sameLibrary,
} from "@/stores/librarySync";
import type { LibrarySnapshot } from "@/services/accountApi";
import type { NormalizedSong } from "@/types/music";

function song(id: string): NormalizedSong {
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

function library(partial: Partial<LibrarySnapshot>): LibrarySnapshot {
  return { version: 2, songs: [], favorites: [], playlists: [], recents: [], ...partial };
}

describe("librarySync three-way merge", () => {
  it("treats v1 snapshots without songs as empty-aware", () => {
    const v1: LibrarySnapshot = { favorites: [], playlists: [], recents: [] };
    expect(isEmptyLibrary(v1)).toBe(true);
  });

  it("union merge keeps both devices' favorites when no baseline exists", () => {
    const local = library({ songs: [song("a")], favorites: [song("a")] });
    const server = library({ songs: [song("b")], favorites: [song("b")] });
    const merged = mergeLibraries(local, server);
    expect(merged.favorites.map((item) => item.stableId).sort()).toEqual([
      "mock:netease:song:a",
      "mock:netease:song:b",
    ]);
  });

  it("keeps a non-favorite playlist song reachable through merged songs", () => {
    const local = library({});
    const server = library({
      songs: [song("x")],
      playlists: [{ id: "p1", name: "Mix", trackIds: ["mock:netease:song:x"], updatedAt: 5 }],
    });
    const merged = mergeLibraries(local, server);
    expect((merged.songs ?? []).map((item) => item.stableId)).toContain("mock:netease:song:x");
  });

  it("propagates a favorite deletion when the other device did not re-add it", () => {
    const baseline = baselineFromLibrary(library({ songs: [song("a")], favorites: [song("a")] }));
    const local = library({ songs: [], favorites: [] }); // 本机删除了收藏 a
    const server = library({ songs: [song("a")], favorites: [song("a")] }); // 服务端仍是基线状态
    const merged = mergeLibrariesWithBaseline(local, server, baseline);
    expect(merged.favorites.map((item) => item.stableId)).toEqual([]);
  });

  it("propagates a playlist track deletion across devices", () => {
    const base = library({
      songs: [song("a"), song("b")],
      playlists: [{ id: "p1", name: "Mix", trackIds: ["mock:netease:song:a", "mock:netease:song:b"], updatedAt: 1 }],
    });
    const baseline = baselineFromLibrary(base);
    const local = library({
      songs: [song("a")],
      playlists: [{ id: "p1", name: "Mix", trackIds: ["mock:netease:song:a"], updatedAt: 2 }], // 删除 b
    });
    const server = base; // 未改动
    const merged = mergeLibrariesWithBaseline(local, server, baseline);
    expect(merged.playlists[0].trackIds).toEqual(["mock:netease:song:a"]);
  });

  it("keeps concurrent additions from both devices in a shared playlist", () => {
    const base = library({
      songs: [song("a")],
      playlists: [{ id: "p1", name: "Mix", trackIds: ["mock:netease:song:a"], updatedAt: 1 }],
    });
    const baseline = baselineFromLibrary(base);
    const local = library({
      songs: [song("a"), song("b")],
      playlists: [{ id: "p1", name: "Mix", trackIds: ["mock:netease:song:a", "mock:netease:song:b"], updatedAt: 2 }],
    });
    const server = library({
      songs: [song("a"), song("c")],
      playlists: [{ id: "p1", name: "Mix", trackIds: ["mock:netease:song:a", "mock:netease:song:c"], updatedAt: 3 }],
    });
    const merged = mergeLibrariesWithBaseline(local, server, baseline);
    expect(merged.playlists[0].trackIds.sort()).toEqual([
      "mock:netease:song:a",
      "mock:netease:song:b",
      "mock:netease:song:c",
    ]);
  });

  it("propagates a whole-playlist deletion when the other device left it untouched", () => {
    const base = library({ playlists: [{ id: "p1", name: "Mix", trackIds: [], updatedAt: 1 }] });
    const baseline = baselineFromLibrary(base);
    const local = library({ playlists: [] }); // 本机删除整个歌单
    const server = base; // 服务端未改动
    const merged = mergeLibrariesWithBaseline(local, server, baseline);
    expect(merged.playlists).toEqual([]);
  });

  it("resolves playlist rename conflicts by latest updatedAt", () => {
    const base = library({ playlists: [{ id: "p1", name: "Mix", trackIds: [], updatedAt: 1 }] });
    const baseline = baselineFromLibrary(base);
    const local = library({ playlists: [{ id: "p1", name: "Local Name", trackIds: [], updatedAt: 5 }] });
    const server = library({ playlists: [{ id: "p1", name: "Server Name", trackIds: [], updatedAt: 9 }] });
    const merged = mergeLibrariesWithBaseline(local, server, baseline);
    expect(merged.playlists[0].name).toBe("Server Name");
  });

  it("detects identical libraries via fingerprint", () => {
    const left = library({ favorites: [song("a")] });
    const right = library({ songs: [song("a")], favorites: [song("a")] });
    expect(sameLibrary(left, right)).toBe(true);
  });
});
