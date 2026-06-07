import { defineStore } from "pinia";
import { ref } from "vue";
import { zh } from "@/i18n/zh";
import type { MusicProvider } from "@/providers/MusicProvider";
import { useProviderStore } from "@/stores/providerStore";
import type { NormalizedSong, SearchListItem, SearchType } from "@/types/music";

export const useSearchStore = defineStore("search", () => {
  const providerStore = useProviderStore();
  let searchRequestId = 0;
  let albumRequestId = 0;

  const searchResults = ref<NormalizedSong[]>([]);
  const typedSearchResults = ref<SearchListItem[]>([]);
  const searchDetailTitle = ref("");
  const searchDetailSongs = ref<NormalizedSong[]>([]);
  const searchDetailLoading = ref(false);
  const activeSearchType = ref<SearchType>("song");
  const searchKeyword = ref("");
  const searchHomeLoaded = ref(false);
  const hotTerms = ref<string[]>([]);
  const suggestions = ref<string[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

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
    const requestId = ++searchRequestId;
    searchKeyword.value = query;
    activeSearchType.value = type;
    searchResults.value = [];
    typedSearchResults.value = [];
    clearSearchDetail();
    await runRequest(async () => {
      suggestions.value = await withProviderFallback(async (provider) => provider.getSuggestions ? await provider.getSuggestions(query) : []);
      const req = { q: query, type, page: type === "song" ? 1 : 0, pageSize: 30 };
      if (type === "song") {
        const results = await aggregateProviderResults(async (provider) => (await provider.search(req)).items, songKey);
        if (requestId !== searchRequestId) return;
        searchResults.value = results;
        typedSearchResults.value = [];
      } else {
        const results = await aggregateProviderResults(async (provider) => {
          if (!provider.searchTyped) throw new Error("Provider does not support typed search");
          return (await provider.searchTyped(req)).items;
        }, typedItemKey);
        if (requestId !== searchRequestId) return;
        searchResults.value = [];
        typedSearchResults.value = results;
      }
    });
  }

  async function openAlbumResult(item: SearchListItem): Promise<void> {
    const requestId = ++albumRequestId;
    const artist = readStringField(item.raw, "artist");
    searchDetailTitle.value = [item.title, artist].filter(Boolean).join(" - ");
    searchDetailSongs.value = [];
    searchDetailLoading.value = true;
    try {
      const songs = await withProviderFallback(async (provider) => {
        if (!provider.getAlbumSongs) throw new Error("Provider does not support album songs");
        return (await provider.getAlbumSongs({ name: item.title, artist, source: item.source, page: 0, size: 60 })).items;
      });
      if (requestId !== albumRequestId) return;
      searchDetailSongs.value = songs;
    } catch (detailError) {
      if (requestId !== albumRequestId) return;
      error.value = detailError instanceof Error ? detailError.message : "Album songs request failed";
      searchDetailSongs.value = [];
    } finally {
      if (requestId === albumRequestId) searchDetailLoading.value = false;
    }
  }

  function clearSearchDetail(): void {
    searchDetailTitle.value = "";
    searchDetailSongs.value = [];
    searchDetailLoading.value = false;
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

  async function withProviderFallback<T>(request: (provider: MusicProvider) => Promise<T>): Promise<T> {
    const providers = providerChain();
    let lastError: unknown;
    for (const provider of providers) {
      try {
        return await request(provider);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Provider fallback chain failed");
  }

  async function aggregateProviderResults<T>(request: (provider: MusicProvider) => Promise<T[]>, keyOf: (item: T) => string): Promise<T[]> {
    const settled = await Promise.allSettled(providerChain().map(async (provider) => request(provider)));
    const failed = settled.filter((result) => result.status === "rejected");
    const values = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    if (!values.length && failed.length) throw readAggregateError(failed);
    return dedupeBy(values, keyOf);
  }

  function providerChain(): MusicProvider[] {
    const seen = new Set<string>();
    return [providerStore.activeProvider, ...providerStore.registry.getFallbacks()].filter((provider) => {
      if (seen.has(provider.id)) return false;
      seen.add(provider.id);
      return true;
    });
  }

  return {
    searchResults,
    typedSearchResults,
    searchDetailTitle,
    searchDetailSongs,
    searchDetailLoading,
    activeSearchType,
    searchKeyword,
    hotTerms,
    suggestions,
    loading,
    error,
    loadSearchHome,
    runSearch,
    openAlbumResult,
    clearSearchDetail,
  };
});

function dedupeBy<T>(items: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function songKey(song: NormalizedSong): string {
  const duration = song.durationMs ? Math.round(song.durationMs / 1000) : "";
  return `${normalizeText(song.name)}|${normalizeText(song.artistText)}|${duration}`;
}

function typedItemKey(item: SearchListItem): string {
  return `${item.source}|${normalizeText(item.title)}|${normalizeText(item.subtitle ?? "")}`;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function readAggregateError(results: PromiseSettledResult<unknown>[]): Error {
  const failed = results.find((result) => result.status === "rejected");
  const reason = failed?.status === "rejected" ? failed.reason : null;
  return reason instanceof Error ? reason : new Error("Provider fallback chain failed");
}
