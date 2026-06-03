import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { IndexedDbRepository } from "@/persistence/IndexedDbRepository";
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

describe("IndexedDbRepository", () => {
  beforeEach(() => {
    // 每个用例重置内存数据库，避免对象仓库/数据跨用例残留
    globalThis.indexedDB = new IDBFactory();
  });

  afterEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });

  it("keeps a playlist track readable from the song catalog without favoriting it", async () => {
    const repo = new IndexedDbRepository();
    const playlist = await repo.createPlaylist("Mix");
    await repo.addTrackToPlaylist(playlist.id, song("a"));

    const songs = await repo.listLibrarySongs();
    const favorites = await repo.listFavoriteSongs();
    expect(songs.map((item) => item.stableId)).toEqual(["mock:netease:song:a"]);
    expect(favorites).toEqual([]);
  });

  it("does not drop the playlist song catalog entry after removing a favorite", async () => {
    const repo = new IndexedDbRepository();
    await repo.addFavoriteSong(song("a"));
    const playlist = await repo.createPlaylist("Mix");
    await repo.addTrackToPlaylist(playlist.id, song("a"));

    await repo.removeFavoriteSong("mock:netease:song:a");

    const songs = await repo.listLibrarySongs();
    expect(songs.map((item) => item.stableId)).toContain("mock:netease:song:a");
    expect(await repo.listFavoriteSongs()).toEqual([]);
  });

  it("records a recent play into both recents and the song catalog", async () => {
    const repo = new IndexedDbRepository();
    await repo.recordRecentPlay(song("a"), 100);

    expect((await repo.listRecentPlays()).map((item) => item.id)).toEqual(["mock:netease:song:a"]);
    expect((await repo.listLibrarySongs()).map((item) => item.stableId)).toEqual(["mock:netease:song:a"]);
  });

  it("replaces the whole library atomically and reads it back", async () => {
    const repo = new IndexedDbRepository();
    await repo.replaceLibrary({
      songs: [song("a"), song("b")],
      favorites: [song("a")],
      playlists: [{ id: "p1", name: "Mix", trackIds: ["mock:netease:song:b"], updatedAt: 1 }],
      recents: [{ id: "mock:netease:song:a", song: song("a"), playedAt: 5 }],
    });

    expect((await repo.listLibrarySongs()).map((item) => item.stableId).sort()).toEqual([
      "mock:netease:song:a",
      "mock:netease:song:b",
    ]);
    expect((await repo.listFavoriteSongs()).map((item) => item.stableId)).toEqual(["mock:netease:song:a"]);
    expect((await repo.listPlaylists())[0].trackIds).toEqual(["mock:netease:song:b"]);
  });

  it("creates playlists even when crypto.randomUUID is unavailable", async () => {
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", { value: { getRandomValues: original.getRandomValues.bind(original) }, configurable: true });
    try {
      const repo = new IndexedDbRepository();
      const playlist = await repo.createPlaylist("No UUID");
      expect(playlist.id).toBeTruthy();
      expect((await repo.listPlaylists())[0].id).toBe(playlist.id);
    } finally {
      Object.defineProperty(globalThis, "crypto", { value: original, configurable: true });
    }
  });
});
