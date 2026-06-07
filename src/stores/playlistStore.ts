import { defineStore } from "pinia";
import { ref } from "vue";
import { useProviderStore } from "@/stores/providerStore";
import type { MusicSourceId, NormalizedPlaylist, NormalizedSong, PageResult } from "@/types/music";

const playlistPageSize = 100;
const maxPlaylistPageFetches = 20;

export const usePlaylistStore = defineStore("playlist", () => {
  const providerStore = useProviderStore();

  const playlistDetail = ref<NormalizedPlaylist | null>(null);
  const playlistSongs = ref<NormalizedSong[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

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
    playlistDetail,
    playlistSongs,
    loading,
    error,
    loadPlaylist,
    loadFullPlaylistSongs,
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
