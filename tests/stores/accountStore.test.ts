import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as accountApi from "@/services/accountApi";
import { useAccountStore } from "@/stores/accountStore";
import { mergeLibraries, writeLibrarySyncMeta } from "@/stores/librarySync";
import { notifyLibraryChanged } from "@/stores/librarySyncBus";
import type { LibrarySnapshot } from "@/services/accountApi";
import type { NormalizedSong } from "@/types/music";

const libraryMock = vi.hoisted(() => {
  const empty = (): LibrarySnapshot => ({ version: 2, songs: [], favorites: [], playlists: [], recents: [] });
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  type Listener = (context: { name: string; after: (callback: () => void) => void }) => void;
  let snapshot: LibrarySnapshot = empty();
  const listeners: Listener[] = [];
  const store = {
    load: vi.fn(async () => undefined),
    snapshot: vi.fn(() => clone(snapshot)),
    replaceLibrary: vi.fn(async (next: LibrarySnapshot) => { snapshot = clone(next); }),
    $onAction: vi.fn((listener: Listener) => {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    }),
  };
  return {
    store,
    reset: () => {
      snapshot = empty();
      listeners.splice(0);
      store.load.mockClear();
      store.snapshot.mockClear();
      store.replaceLibrary.mockClear();
      store.$onAction.mockClear();
    },
    setSnapshot: (next: LibrarySnapshot) => { snapshot = clone(next); },
    triggerAction: (name: string) => {
      listeners.forEach((listener) => listener({ name, after: (callback) => callback() }));
    },
  };
});

vi.mock("@/stores/libraryStore", () => ({
  useLibraryStore: () => libraryMock.store,
}));

vi.mock("@/services/accountApi", () => ({
  getMe: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  getLibrary: vi.fn(),
  saveLibrary: vi.fn(),
  listDownloads: vi.fn(),
  createServerDownload: vi.fn(),
}));

const user = { id: "u1", username: "alice", createdAt: 1 };

describe("accountStore", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    localStorage.clear();
    libraryMock.reset();
    setActivePinia(createPinia());
    vi.mocked(accountApi.getMe).mockResolvedValue(null);
    vi.mocked(accountApi.login).mockResolvedValue(user);
    vi.mocked(accountApi.register).mockResolvedValue(user);
    vi.mocked(accountApi.logout).mockResolvedValue(undefined);
    vi.mocked(accountApi.listDownloads).mockResolvedValue({ downloads: [], totalBytes: 0 });
    vi.mocked(accountApi.getLibrary).mockResolvedValue({ library: emptyLibrary(), updatedAt: null });
    vi.mocked(accountApi.saveLibrary).mockImplementation(async (library) => ({ library, updatedAt: 100 }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uploads this device library when signing in before a server snapshot exists", async () => {
    const local = snapshotWithSong("pc", 10);
    libraryMock.setSnapshot(local);

    await useAccountStore().signIn("alice", "secret1");

    expect(accountApi.saveLibrary).toHaveBeenCalledWith(local);
    expect(useAccountStore().syncStatus).toBe("synced");
    expect(useAccountStore().lastSyncedAt).toBe(100);
  });

  it("pulls the server snapshot into an empty device after sign in", async () => {
    const server = snapshotWithSong("phone", 20);
    vi.mocked(accountApi.getLibrary).mockResolvedValue({ library: server, updatedAt: 200 });

    await useAccountStore().signIn("alice", "secret1");

    expect(libraryMock.store.replaceLibrary).toHaveBeenCalledWith(server);
    expect(accountApi.saveLibrary).not.toHaveBeenCalled();
    expect(useAccountStore().serverLibraryUpdatedAt).toBe(200);
  });

  it("auto-uploads signed-in library changes", async () => {
    vi.useFakeTimers();
    await useAccountStore().signIn("alice", "secret1");
    const changed = snapshotWithSong("created", 30);
    libraryMock.setSnapshot(changed);

    notifyLibraryChanged();
    await vi.advanceTimersByTimeAsync(800);

    expect(accountApi.saveLibrary).toHaveBeenCalledWith(changed);
  });

  it("polls and pulls server changes while the device stays signed in", async () => {
    vi.useFakeTimers();
    const server = snapshotWithSong("server", 40);
    vi.mocked(accountApi.getLibrary)
      .mockResolvedValueOnce({ library: emptyLibrary(), updatedAt: null })
      .mockResolvedValue({ library: server, updatedAt: 400 });

    await useAccountStore().signIn("alice", "secret1");
    await vi.advanceTimersByTimeAsync(30_000);

    expect(libraryMock.store.replaceLibrary).toHaveBeenCalledWith(server);
    expect(useAccountStore().serverLibraryUpdatedAt).toBe(400);
  });

  it("merges local and server libraries instead of overwriting either device", async () => {
    const local = snapshotWithSong("pc", 30);
    const server = snapshotWithSong("phone", 20);
    // 首次登录无 baseline，走并集兜底合并；用真实 mergeLibraries 构造期望，避免硬编码字段顺序
    const merged = mergeLibraries(local, server);
    libraryMock.setSnapshot(local);
    vi.mocked(accountApi.getLibrary).mockResolvedValue({ library: server, updatedAt: 200 });

    await useAccountStore().signIn("alice", "secret1");

    expect(libraryMock.store.replaceLibrary).toHaveBeenCalledWith(merged);
    expect(accountApi.saveLibrary).toHaveBeenCalledWith(merged);
  });

  it("rejects pulling an empty missing server snapshot", async () => {
    const account = useAccountStore();
    account.user = user;

    await expect(account.pullLibrary()).rejects.toThrow("No server library snapshot to pull");
  });

  it("uploads an emptied library so a full clear propagates across devices", async () => {
    // 预置上次同步基线：服务端仍是该状态，本机已清空，应上传空库让删除生效
    const baselineLibrary = snapshotWithSong("gone", 10);
    writeLibrarySyncMeta(user.id, 50, baselineLibrary);
    libraryMock.setSnapshot(emptyLibrary());
    vi.mocked(accountApi.getLibrary).mockResolvedValue({ library: baselineLibrary, updatedAt: 50 });

    await useAccountStore().signIn("alice", "secret1");

    expect(libraryMock.store.replaceLibrary).not.toHaveBeenCalled();
    expect(accountApi.saveLibrary).toHaveBeenCalledWith(emptyLibrary());
  });
});

function emptyLibrary(): LibrarySnapshot {
  return { version: 2, songs: [], favorites: [], playlists: [], recents: [] };
}

function snapshotWithSong(id: string, updatedAt: number): LibrarySnapshot {
  const song = testSong(id);
  return {
    version: 2,
    songs: [song],
    favorites: [song],
    playlists: [{ id: `playlist-${id}`, name: `Playlist ${id}`, trackIds: [song.stableId], updatedAt }],
    recents: [],
  };
}

function testSong(id: string): NormalizedSong {
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
