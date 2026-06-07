import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { zh } from "@/i18n/zh";
import { getSourceTag } from "@/providers/sourceMetadata";
import { hasFreshDiscover, hasFreshToplists, readDiscoverCache, writeDiscoverCache } from "@/stores/discoverCache";
import { useProviderStore } from "@/stores/providerStore";
import type { NormalizedPlaylist, NormalizedSong, ToplistGroup } from "@/types/music";
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
    const providerId = providerStore.config.activeProviderId;
    const cached = readDiscoverCache(providerId);
    if (cached) applyDiscoverCache(cached);
    if (cached && hasFreshDiscover(cached)) {
      setTimeout(() => void refreshDiscover(false), 0);
      return;
    }
    await refreshDiscover(!cached);
  }

  async function loadToplists(): Promise<void> {
    const providerId = providerStore.config.activeProviderId;
    const cached = readDiscoverCache(providerId);
    if (cached) applyToplistCache(cached);
    if (cached && hasFreshToplists(cached)) {
      setTimeout(() => void refreshToplists(false), 0);
      return;
    }
    await refreshToplists(!cached);
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

  async function refreshDiscover(showLoading: boolean): Promise<void> {
    await runRequest(showLoading, async () => {
      const provider = providerStore.activeProvider;
      const [nextPlaylists, nextSongs] = await Promise.all([
        provider.getRecommendPlaylists ? provider.getRecommendPlaylists({ page: 1, pageSize: 10 }).then((result) => result.items) : [],
        provider.search({ q: defaultSearchKeyword, type: "song", page: 1, pageSize: 12 }).then((result) => result.items),
      ]);
      playlists.value = nextPlaylists;
      discoverSongs.value = nextSongs;
      writeDiscoverCache({ providerId: providerStore.config.activeProviderId, playlists: nextPlaylists, discoverSongs: nextSongs, discoverUpdatedAt: Date.now() });
    });
  }

  async function refreshToplists(showLoading: boolean): Promise<void> {
    await runRequest(showLoading, async () => {
      const provider = providerStore.activeProvider;
      const nextToplists = provider.getToplists ? await provider.getToplists("netease") : [];
      toplists.value = nextToplists;
      writeDiscoverCache({ providerId: providerStore.config.activeProviderId, toplists: nextToplists, toplistsUpdatedAt: Date.now() });
    });
  }

  async function runRequest(showLoading: boolean, task: () => Promise<void>): Promise<void> {
    if (showLoading) loading.value = true;
    error.value = null;
    try {
      await task();
    } catch (requestError) {
      error.value = requestError instanceof Error ? requestError.message : "Provider request failed";
    } finally {
      if (showLoading) loading.value = false;
    }
  }

  function applyDiscoverCache(snapshot: { playlists: NormalizedPlaylist[]; discoverSongs: NormalizedSong[] }): void {
    playlists.value = snapshot.playlists;
    discoverSongs.value = snapshot.discoverSongs;
  }

  function applyToplistCache(snapshot: { toplists: ToplistGroup[] }): void {
    toplists.value = snapshot.toplists;
  }

  return { playlists, discoverSongs, toplists, loading, error, activeProviderName, loadDiscover, loadToplists, songRows };
});
