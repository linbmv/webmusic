import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { openDB } from "idb";
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

// 还原 v1 数据库结构（无 librarySongs），用于验证 v2 迁移
async function seedV1Database(): Promise<void> {
  const db = await openDB("music-clone-library", 1, {
    upgrade(database) {
      database.createObjectStore("favoriteSongs");
      database.createObjectStore("playlists");
      database.createObjectStore("settings");
      database.createObjectStore("recentPlays", { keyPath: "id" }).createIndex("playedAt", "playedAt");
    },
  });
  await db.put("favoriteSongs", song("fav"), "mock:netease:song:fav");
  await db.put("recentPlays", { id: "mock:netease:song:rec", song: song("rec"), playedAt: 10 });
  db.close();
}

describe("IndexedDbRepository v1 to v2 migration", () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });

  afterEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });

  it("backfills the song catalog from legacy favorites and recents", async () => {
    await seedV1Database();

    const repo = new IndexedDbRepository();
    const songs = await repo.listLibrarySongs();

    expect(songs.map((item) => item.stableId).sort()).toEqual([
      "mock:netease:song:fav",
      "mock:netease:song:rec",
    ]);
  });
});
