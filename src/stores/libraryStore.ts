import { defineStore } from "pinia";
import { ref } from "vue";
import { IndexedDbRepository } from "@/persistence/IndexedDbRepository";
import { notifyLibraryChanged } from "@/stores/librarySyncBus";
import type { LibrarySnapshot } from "@/services/accountApi";
import type { LocalPlaylist, NormalizedSong, RecentPlay } from "@/types/music";

export const useLibraryStore = defineStore("library", () => {
  const repository = new IndexedDbRepository();
  const songs = ref<NormalizedSong[]>([]);
  const favorites = ref<NormalizedSong[]>([]);
  const playlists = ref<LocalPlaylist[]>([]);
  const recents = ref<RecentPlay[]>([]);
  const loaded = ref(false);
  const loading = ref(false);
  const loadError = ref<string | null>(null);
  let loadPromise: Promise<void> | null = null;

  // 启动与各视图均可能触发 load：用 loadPromise 合并并发调用，避免移动端重复加载与同步竞争
  async function load(force = false): Promise<void> {
    if (loadPromise && !force) return loadPromise;
    if (loaded.value && !force) return;
    loadPromise = runLoad();
    try {
      await loadPromise;
    } finally {
      loadPromise = null;
    }
  }

  async function runLoad(): Promise<void> {
    loading.value = true;
    loadError.value = null;
    try {
      const [nextSongs, nextFavorites, nextPlaylists, nextRecents] = await Promise.all([
        repository.listLibrarySongs(),
        repository.listFavoriteSongs(),
        repository.listPlaylists(),
        repository.listRecentPlays(),
      ]);
      songs.value = nextSongs;
      favorites.value = nextFavorites;
      playlists.value = nextPlaylists;
      recents.value = nextRecents;
      loaded.value = true;
    } catch (caught) {
      loadError.value = caught instanceof Error ? caught.message : "Library load failed";
      throw caught;
    } finally {
      loading.value = false;
    }
  }

  // 上传快照统一为 v2：携带完整歌曲目录，另一台设备才能还原非收藏的歌单歌曲
  function snapshot(): LibrarySnapshot {
    return {
      version: 2,
      songs: songs.value,
      favorites: favorites.value,
      playlists: playlists.value,
      recents: recents.value,
    };
  }

  async function replaceLibrary(data: LibrarySnapshot): Promise<void> {
    await repository.replaceLibrary(normalizeSnapshot(data));
    await load(true);
  }

  function isFavorite(stableId: string): boolean {
    return favorites.value.some((item) => item.stableId === stableId);
  }

  async function toggleFavorite(song: NormalizedSong): Promise<void> {
    const exists = isFavorite(song.stableId);
    if (exists) await repository.removeFavoriteSong(song.stableId);
    else await repository.addFavoriteSong(song);
    await refreshFavorites();
    notifyLibraryChanged();
  }

  async function removeFavorite(stableId: string): Promise<void> {
    await repository.removeFavoriteSong(stableId);
    await refreshFavorites();
    notifyLibraryChanged();
  }

  async function createPlaylist(name: string): Promise<LocalPlaylist> {
    const playlist = await repository.createPlaylist(name);
    playlists.value = await repository.listPlaylists();
    notifyLibraryChanged();
    return playlist;
  }

  async function renamePlaylist(id: string, name: string): Promise<void> {
    await repository.renamePlaylist(id, name);
    playlists.value = await repository.listPlaylists();
    notifyLibraryChanged();
  }

  async function deletePlaylist(id: string): Promise<void> {
    await repository.deletePlaylist(id);
    playlists.value = await repository.listPlaylists();
    notifyLibraryChanged();
  }

  async function addTrackToPlaylist(playlistId: string, song: NormalizedSong): Promise<void> {
    await repository.addTrackToPlaylist(playlistId, song);
    playlists.value = await repository.listPlaylists();
    songs.value = await repository.listLibrarySongs();
    notifyLibraryChanged();
  }

  async function addTracksToPlaylist(playlistId: string, items: NormalizedSong[]): Promise<void> {
    if (!items.length) return;
    await repository.addTracksToPlaylist(playlistId, items);
    playlists.value = await repository.listPlaylists();
    songs.value = await repository.listLibrarySongs();
    notifyLibraryChanged();
  }

  async function removeTrackFromPlaylist(playlistId: string, songId: string): Promise<void> {
    await repository.removeTrackFromPlaylist(playlistId, songId);
    playlists.value = await repository.listPlaylists();
    notifyLibraryChanged();
  }

  // 从歌曲目录反查歌单曲目，保留歌单顺序；不再依赖收藏表，取消收藏也不会丢歌
  function listPlaylistTracks(playlistId: string): NormalizedSong[] {
    const playlist = playlists.value.find((item) => item.id === playlistId);
    if (!playlist) return [];
    const byId = new Map(songs.value.map((song) => [song.stableId, song]));
    return playlist.trackIds.map((id) => byId.get(id)).filter((song): song is NormalizedSong => Boolean(song));
  }

  async function recordRecent(song: NormalizedSong): Promise<void> {
    await repository.recordRecentPlay(song);
    recents.value = await repository.listRecentPlays();
    songs.value = await repository.listLibrarySongs();
    notifyLibraryChanged();
  }

  async function refreshFavorites(): Promise<void> {
    favorites.value = await repository.listFavoriteSongs();
    songs.value = await repository.listLibrarySongs();
  }

  return {
    songs,
    favorites,
    playlists,
    recents,
    loaded,
    loading,
    loadError,
    load,
    snapshot,
    replaceLibrary,
    isFavorite,
    toggleFavorite,
    removeFavorite,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    addTrackToPlaylist,
    addTracksToPlaylist,
    removeTrackFromPlaylist,
    listPlaylistTracks,
    recordRecent,
  };
});

// 兼容 v1（无 songs 字段）与 v2 快照：v1 从收藏与最近播放推导歌曲目录
function normalizeSnapshot(data: LibrarySnapshot): { songs: NormalizedSong[]; favorites: NormalizedSong[]; playlists: LocalPlaylist[]; recents: RecentPlay[] } {
  const favorites = arrayValue(data.favorites);
  const playlists = arrayValue(data.playlists);
  const recents = arrayValue(data.recents);
  const explicitSongs = arrayValue(data.songs);
  const byId = new Map<string, NormalizedSong>();
  [...explicitSongs, ...favorites, ...recents.map((recent) => recent?.song)].forEach((song) => {
    if (song?.stableId) byId.set(song.stableId, song);
  });
  return { songs: Array.from(byId.values()), favorites, playlists, recents };
}

function arrayValue<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}
