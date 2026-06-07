import { defineStore } from "pinia";
import { computed } from "vue";
import { getSourceTag } from "@/providers/sourceMetadata";
import { useSearchStore } from "@/stores/searchStore";
import { usePlaylistStore } from "@/stores/playlistStore";
import { useDiscoverStore } from "@/stores/discoverStore";
import type { MusicSourceId, NormalizedSong } from "@/types/music";
import type { TrackRowItem } from "@/types/ui";

// 向后兼容层：将新拆分的 Store 重新组合为统一接口
export const useMusicStore = defineStore("music", () => {
  const searchStore = useSearchStore();
  const playlistStore = usePlaylistStore();
  const discoverStore = useDiscoverStore();

  function songRows(songs: NormalizedSong[]): TrackRowItem[] {
    return songs.map((song, index) => ({
      id: song.stableId,
      name: song.name,
      artistText: song.artistText,
      source: getSourceTag(song.provider.source),
      cover: song.coverUrl ?? song.album?.coverUrl ?? "",
      position: index + 1,
      song,
    }));
  }

  return {
    // Discover
    playlists: computed(() => discoverStore.playlists),
    discoverSongs: computed(() => discoverStore.discoverSongs),
    toplists: computed(() => discoverStore.toplists),
    activeProviderName: computed(() => discoverStore.activeProviderName),
    loadDiscover: discoverStore.loadDiscover,
    loadToplists: discoverStore.loadToplists,

    // Search
    searchResults: computed(() => searchStore.searchResults),
    typedSearchResults: computed(() => searchStore.typedSearchResults),
    searchDetailTitle: computed(() => searchStore.searchDetailTitle),
    searchDetailSongs: computed(() => searchStore.searchDetailSongs),
    searchDetailLoading: computed(() => searchStore.searchDetailLoading),
    activeSearchType: computed(() => searchStore.activeSearchType),
    searchKeyword: computed(() => searchStore.searchKeyword),
    hotTerms: computed(() => searchStore.hotTerms),
    suggestions: computed(() => searchStore.suggestions),
    loadSearchHome: searchStore.loadSearchHome,
    runSearch: searchStore.runSearch,
    openAlbumResult: searchStore.openAlbumResult,
    clearSearchDetail: searchStore.clearSearchDetail,

    // Playlist
    playlistDetail: computed(() => playlistStore.playlistDetail),
    playlistSongs: computed(() => playlistStore.playlistSongs),
    loadPlaylist: playlistStore.loadPlaylist,
    loadFullPlaylistSongs: playlistStore.loadFullPlaylistSongs,

    // Shared
    loading: computed(() => searchStore.loading || playlistStore.loading || discoverStore.loading),
    error: computed(() => searchStore.error || playlistStore.error || discoverStore.error),
    songRows,
  };
});
