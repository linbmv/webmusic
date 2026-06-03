import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as accountApi from "@/services/accountApi";
import { useAccountStore } from "@/stores/accountStore";
import { useLibraryStore } from "@/stores/libraryStore";
import type { LibrarySnapshot } from "@/services/accountApi";
import type { LocalPlaylist, NormalizedSong, RecentPlay } from "@/types/music";

const repositoryMock = vi.hoisted(() => {
  let favorites: NormalizedSong[] = [];
  let playlists: LocalPlaylist[] = [];
  let recents: RecentPlay[] = [];
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  class IndexedDbRepository {
    async listFavoriteSongs(): Promise<NormalizedSong[]> { return clone(favorites); }
    async listPlaylists(): Promise<LocalPlaylist[]> { return clone(playlists); }
    async listRecentPlays(): Promise<RecentPlay[]> { return clone(recents); }
    async addFavoriteSong(song: NormalizedSong): Promise<void> { favorites = upsertBy(favorites, song, "stableId"); }
    async removeFavoriteSong(id: string): Promise<void> { favorites = favorites.filter((song) => song.stableId !== id); }
    async createPlaylist(name: string): Promise<LocalPlaylist> {
      const playlist = { id: `playlist-${playlists.length + 1}`, name, trackIds: [], updatedAt: 1 };
      playlists = [...playlists, playlist];
      return clone(playlist);
    }
    async renamePlaylist(id: string, name: string): Promise<void> {
      playlists = playlists.map((playlist) => playlist.id === id ? { ...playlist, name, updatedAt: 2 } : playlist);
    }
    async deletePlaylist(id: string): Promise<void> { playlists = playlists.filter((playlist) => playlist.id !== id); }
    async addTrackToPlaylist(playlistId: string, song: NormalizedSong): Promise<void> {
      favorites = upsertBy(favorites, song, "stableId");
      playlists = playlists.map((playlist) => playlist.id === playlistId
        ? { ...playlist, trackIds: Array.from(new Set([...playlist.trackIds, song.stableId])), updatedAt: 3 }
        : playlist);
    }
    async removeTrackFromPlaylist(playlistId: string, songId: string): Promise<void> {
      playlists = playlists.map((playlist) => playlist.id === playlistId
        ? { ...playlist, trackIds: playlist.trackIds.filter((trackId) => trackId !== songId), updatedAt: 4 }
        : playlist);
    }
    async recordRecentPlay(song: NormalizedSong, playedAt = 1): Promise<void> { recents = [{ id: song.stableId, song, playedAt }]; }
    async replaceLibrary(data: LibrarySnapshot): Promise<void> {
      favorites = clone(data.favorites);
      playlists = clone(data.playlists);
      recents = clone(data.recents);
    }
  }
  return {
    IndexedDbRepository,
    reset: () => {
      favorites = [];
      playlists = [];
      recents = [];
    },
  };
});

vi.mock("@/persistence/IndexedDbRepository", () => ({
  IndexedDbRepository: repositoryMock.IndexedDbRepository,
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

describe("account and real library store sync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    localStorage.clear();
    repositoryMock.reset();
    setActivePinia(createPinia());
    vi.mocked(accountApi.login).mockResolvedValue(user);
    vi.mocked(accountApi.listDownloads).mockResolvedValue({ downloads: [], totalBytes: 0 });
    vi.mocked(accountApi.getLibrary).mockResolvedValue({ library: emptyLibrary(), updatedAt: null });
    vi.mocked(accountApi.saveLibrary).mockImplementation(async (library) => ({ library, updatedAt: 100 }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uploads real local playlist mutations after sign in", async () => {
    await useAccountStore().signIn("alice", "secret1");

    await useLibraryStore().createPlaylist("Synced");
    await vi.advanceTimersByTimeAsync(800);

    expect(accountApi.saveLibrary).toHaveBeenCalledWith(expect.objectContaining({
      playlists: [expect.objectContaining({ name: "Synced" })],
    }));
  });
});

function emptyLibrary(): LibrarySnapshot {
  return { favorites: [], playlists: [], recents: [] };
}

function upsertBy<T, K extends keyof T>(items: T[], item: T, key: K): T[] {
  return [...items.filter((existing) => existing[key] !== item[key]), item];
}
