import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { zh } from "@/i18n/zh";
import { getSourceTag } from "@/providers/sourceMetadata";
import { useProviderStore } from "@/stores/providerStore";
import type { MusicSourceId, NormalizedPlaylist, NormalizedSong, PageResult, SearchListItem, SearchType, ToplistGroup } from "@/types/music";
import type { TrackRowItem } from "@/types/ui";

const defaultSearchKeyword = zh.names.yinTian;
const playlistPageSize = 100;
const maxPlaylistPageFetches = 20;

export const useMusicStore = defineStore("music", () => {
  const providerStore = useProviderStore();
  const playlists = ref<NormalizedPlaylist[]>([]);
  const discoverSongs = ref<NormalizedSong[]>([]);
  const searchResults = ref<NormalizedSong[]>([]);
  const typedSearchResults = ref<SearchListItem[]>([]);
  const searchDetailTitle = ref("");
  const searchDetailSongs = ref<NormalizedSong[]>([]);
  const searchDetailLoading = ref(false);
  const activeSearchType = ref<SearchType>("song");
  const searchKeyword = ref("");
  const searchHomeLoaded = ref(false);
  const playlistDetail = ref<NormalizedPlaylist | null>(null);
  const playlistSongs = ref<NormalizedSong[]>([]);
  const hotTerms = ref<string[]>([]);
  const suggestions = ref<string[]>([]);
  const toplists = ref<ToplistGroup[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const activeProviderName = computed(() => providerStore.activeProvider.displayName);

  async function loadDiscover(): Promise<void> {
    await runRequest(async () => {
      playlists.value = await withProviderFallback(async (provider) => provider.getRecommendPlaylists ? (await provider.getRecommendPlaylists({ page: 1, pageSize: 10 })).items : []);
      discoverSongs.value = await withProviderFallback(async (provider) => (await provider.search({ q: defaultSearchKeyword, type: "song", page: 1, pageSize: 12 })).items);
    });
  }

  async function loadSearchHome(): Promise<void> {
    if (searchHomeLoaded.value) return;
    searchHomeLoaded.value = true;
    await runRequest(async () => {
      hotTerms.value = await withProviderFallback(async (provider) => provider.getHotSearches ? await provider.getHotSearches() : []);
    });
  }

  async function runSearch(keyword: string, type: SearchType = "song"): Promise<void> {
    const query = keyword.trim();
    if (!query) return;
    searchKeyword.value = query;
    activeSearchType.value = type;
    searchResults.value = [];
    typedSearchResults.value = [];
    clearSearchDetail();
    await runRequest(async () => {
      suggestions.value = await withProviderFallback(async (provider) => provider.getSuggestions ? await provider.getSuggestions(query) : []);
      const req = { q: query, type, page: type === "song" ? 1 : 0, pageSize: 30 };
      if (type === "song") {
        searchResults.value = await withProviderFallback(async (provider) => (await provider.search(req)).items);
        typedSearchResults.value = [];
      } else {
        searchResults.value = [];
        typedSearchResults.value = await withProviderFallback(async (provider) => {
          if (!provider.searchTyped) throw new Error("Provider does not support typed search");
          return (await provider.searchTyped(req)).items;
        });
      }
    });
  }

  async function openAlbumResult(item: SearchListItem): Promise<void> {
    const artist = readStringField(item.raw, "artist");
    searchDetailTitle.value = [item.title, artist].filter(Boolean).join(" - ");
    searchDetailSongs.value = [];
    searchDetailLoading.value = true;
    try {
      searchDetailSongs.value = await withProviderFallback(async (provider) => {
        if (!provider.getAlbumSongs) throw new Error("Provider does not support album songs");
        return (await provider.getAlbumSongs({ name: item.title, artist, source: item.source, page: 0, size: 60 })).items;
      });
    } catch (detailError) {
      error.value = detailError instanceof Error ? detailError.message : "Album songs request failed";
      searchDetailSongs.value = [];
    } finally {
      searchDetailLoading.value = false;
    }
  }

  function clearSearchDetail(): void {
    searchDetailTitle.value = "";
    searchDetailSongs.value = [];
    searchDetailLoading.value = false;
  }

  async function loadToplists(): Promise<void> {
    await runRequest(async () => {
      toplists.value = await withProviderFallback(async (provider) => provider.getToplists ? await provider.getToplists("netease") : []);
    });
  }

  async function loadPlaylist(id: string, source: MusicSourceId = "netease"): Promise<void> {
    await runRequest(async () => {
      const result = await withProviderFallback(async (provider) => {
        const detail = await provider.getPlaylist({ id, source });
        const songs = provider.getPlaylistPage ? (await provider.getPlaylistPage({ id, source: detail.source, offset: 0, size: 50 })).items : [];
        return { detail, songs };
      });
      playlistDetail.value = result.detail;
      playlistSongs.value = result.songs;
    });
  }

  async function loadFullPlaylistSongs(id: string, source: MusicSourceId = "netease"): Promise<NormalizedSong[]> {
    return withProviderFallback(async (provider) => {
      const detail = await provider.getPlaylist({ id, source });
      if (!provider.getPlaylistPage) return [];
      let songs: NormalizedSong[] = [];
      let offset = 0;
      for (let page = 0; page < maxPlaylistPageFetches; page += 1) {
        const result = await provider.getPlaylistPage({ id, source: detail.source, offset, size: playlistPageSize });
        const nextSongs = dedupeSongs([...songs, ...result.items]);
        if (nextSongs.length === songs.length) break;
        songs = nextSongs;
        offset += result.items.length;
        if (!shouldLoadMorePlaylistSongs({ result, fetched: songs.length, expectedTotal: detail.trackCount })) break;
      }
      return songs;
    });
  }

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

  function readStringField(raw: unknown, key: string): string | undefined {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
    const value = (raw as Record<string, unknown>)[key];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }

  async function runRequest(task: () => Promise<void>): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await task();
    } catch (requestError) {
      error.value = requestError instanceof Error ? requestError.message : "Provider request failed";
    } finally {
      loading.value = false;
    }
  }

  async function withProviderFallback<T>(request: (provider: ReturnType<typeof providerStore.registry.getActive>) => Promise<T>): Promise<T> {
    const providers = [providerStore.activeProvider, ...providerStore.registry.getFallbacks()];
    const seen = new Set<string>();
    let lastError: unknown;
    for (const provider of providers) {
      if (seen.has(provider.id)) continue;
      seen.add(provider.id);
      try {
        return await request(provider);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Provider fallback chain failed");
  }

  return {
    playlists,
    discoverSongs,
    searchResults,
    typedSearchResults,
    searchDetailTitle,
    searchDetailSongs,
    searchDetailLoading,
    activeSearchType,
    searchKeyword,
    playlistDetail,
    playlistSongs,
    hotTerms,
    suggestions,
    toplists,
    loading,
    error,
    activeProviderName,
    loadDiscover,
    loadSearchHome,
    runSearch,
    openAlbumResult,
    clearSearchDetail,
    loadToplists,
    loadPlaylist,
    loadFullPlaylistSongs,
    songRows,
  };
});

function shouldLoadMorePlaylistSongs(options: { result: PageResult<NormalizedSong>; fetched: number; expectedTotal?: number }): boolean {
  if (!options.result.items.length) return false;
  if (options.expectedTotal && options.fetched >= options.expectedTotal) return false;
  return options.result.hasMore || Boolean(options.expectedTotal && options.result.items.length >= playlistPageSize);
}

function dedupeSongs(songs: NormalizedSong[]): NormalizedSong[] {
  return Array.from(new Map(songs.map((song) => [song.stableId, song])).values());
}
