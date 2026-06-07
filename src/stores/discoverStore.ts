import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { zh } from "@/i18n/zh";
import { getSourceTag } from "@/providers/sourceMetadata";
import { useProviderStore } from "@/stores/providerStore";
import type { MusicSourceId, NormalizedPlaylist, NormalizedSong, ToplistGroup } from "@/types/music";
import type { TrackRowItem } from "@/types/ui";

const defaultSearchKeyword = zh.names.yinTian;

export const useDiscoverStore = defineStore("discover", () => {
  const providerStore = useProviderStore();

  const playlists = ref<NormalizedPlaylist[]>([]);
  const discoverSongs = ref<NormalizedSong[]>([]);
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

  async function loadToplists(): Promise<void> {
    await runRequest(async () => {
      toplists.value = await withProviderFallback(async (provider) => provider.getToplists ? await provider.getToplists("netease") : []);
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
    toplists,
    loading,
    error,
    activeProviderName,
    loadDiscover,
    loadToplists,
    songRows,
  };
});
