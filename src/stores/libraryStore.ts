import { defineStore } from "pinia";
import { ref } from "vue";
import { IndexedDbRepository } from "@/persistence/IndexedDbRepository";
import type { LocalPlaylist, NormalizedSong, RecentPlay } from "@/types/music";

export const useLibraryStore = defineStore("library", () => {
  const repository = new IndexedDbRepository();
  const favorites = ref<NormalizedSong[]>([]);
  const playlists = ref<LocalPlaylist[]>([]);
  const recents = ref<RecentPlay[]>([]);

  async function load(): Promise<void> {
    favorites.value = await repository.listFavoriteSongs();
    playlists.value = await repository.listPlaylists();
    recents.value = await repository.listRecentPlays();
  }

  function isFavorite(stableId: string): boolean {
    return favorites.value.some((item) => item.stableId === stableId);
  }

  async function toggleFavorite(song: NormalizedSong): Promise<void> {
    const exists = isFavorite(song.stableId);
    if (exists) await repository.removeFavoriteSong(song.stableId);
    else await repository.addFavoriteSong(song);
    favorites.value = await repository.listFavoriteSongs();
  }

  async function removeFavorite(stableId: string): Promise<void> {
    await repository.removeFavoriteSong(stableId);
    favorites.value = await repository.listFavoriteSongs();
  }

  async function createPlaylist(name: string): Promise<LocalPlaylist> {
    const playlist = await repository.createPlaylist(name);
    playlists.value = await repository.listPlaylists();
    return playlist;
  }

  async function renamePlaylist(id: string, name: string): Promise<void> {
    await repository.renamePlaylist(id, name);
    playlists.value = await repository.listPlaylists();
  }

  async function deletePlaylist(id: string): Promise<void> {
    await repository.deletePlaylist(id);
    playlists.value = await repository.listPlaylists();
  }

  async function addTrackToPlaylist(playlistId: string, song: NormalizedSong): Promise<void> {
    await repository.addTrackToPlaylist(playlistId, song);
    playlists.value = await repository.listPlaylists();
    favorites.value = await repository.listFavoriteSongs();
  }

  async function removeTrackFromPlaylist(playlistId: string, songId: string): Promise<void> {
    await repository.removeTrackFromPlaylist(playlistId, songId);
    playlists.value = await repository.listPlaylists();
  }

  function listPlaylistTracks(playlistId: string): NormalizedSong[] {
    const playlist = playlists.value.find((item) => item.id === playlistId);
    if (!playlist) return [];
    const byId = new Map(favorites.value.map((song) => [song.stableId, song]));
    return playlist.trackIds.map((id) => byId.get(id)).filter((song): song is NormalizedSong => Boolean(song));
  }

  async function recordRecent(song: NormalizedSong): Promise<void> {
    await repository.recordRecentPlay(song);
    recents.value = await repository.listRecentPlays();
  }

  return {
    favorites,
    playlists,
    recents,
    load,
    isFavorite,
    toggleFavorite,
    removeFavorite,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    listPlaylistTracks,
    recordRecent,
  };
});
