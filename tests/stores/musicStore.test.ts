import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMusicStore } from "@/stores/musicStore";
import { useProviderStore } from "@/stores/providerStore";
import { defaultProviderConfig, providerStorageKey } from "@/config/providerConfig";
import type { NormalizedSong } from "@/types/music";

const discoverStorageKey = "music:discover:v1";

describe("musicStore", () => {
  beforeEach(() => {
    vi.useRealTimers();
    localStorage.removeItem(providerStorageKey);
    localStorage.removeItem(discoverStorageKey);
    setActivePinia(createPinia());
    useProviderStore().switchProvider("mock");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads discover data from the active provider", async () => {
    const store = useMusicStore();

    await store.loadDiscover();

    expect(store.playlists.length).toBeGreaterThan(0);
    expect(store.discoverSongs.length).toBeGreaterThan(0);
    expect(store.songRows(store.discoverSongs)[0].song).toBeTruthy();
  });

  it("loads playlist detail and rows", async () => {
    const store = useMusicStore();

    await store.loadPlaylist("2250011882");

    expect(store.playlistDetail?.id).toBe("2250011882");
    expect(store.songRows(store.playlistSongs).length).toBeGreaterThan(0);
  });

  it("uses only the active provider for discover", async () => {
    const providerStore = useProviderStore();
    providerStore.switchProvider("custom");
    await nextTick();
    const store = useMusicStore();

    await store.loadDiscover();

    expect(store.discoverSongs.some((item) => item.provider.providerId === "mock")).toBe(false);
  });

  it("hydrates discover from cache before refreshing", async () => {
    vi.useFakeTimers();
    const cachedSong = song("cached");
    localStorage.setItem(discoverStorageKey, JSON.stringify({
      providerId: "mock",
      playlists: [],
      discoverSongs: [cachedSong],
      toplists: [],
      discoverUpdatedAt: Date.now(),
      toplistsUpdatedAt: 0,
    }));
    const store = useMusicStore();

    const request = store.loadDiscover();

    expect(store.discoverSongs[0].stableId).toBe(cachedSong.stableId);
    await request;
  });

  it("keeps non-song searches in typed results", async () => {
    const store = useMusicStore();

    await store.runSearch("阴天", "album");

    expect(store.activeSearchType).toBe("album");
    expect(store.searchResults).toHaveLength(0);
    expect(store.typedSearchResults.length).toBeGreaterThan(0);
    expect(store.typedSearchResults[0].title).toBeTruthy();
  });

  it("loads album songs into the dedicated search detail state", async () => {
    const store = useMusicStore();

    await store.runSearch("阴天", "album");
    await store.openAlbumResult(store.typedSearchResults[0]);

    expect(store.searchDetailTitle).toBe(store.typedSearchResults[0].title);
    expect(store.searchDetailSongs.length).toBeGreaterThan(0);
  });

  it("persists provider selection", () => {
    const providerStore = useProviderStore();

    providerStore.switchProvider("mock");

    expect(JSON.parse(localStorage.getItem(providerStorageKey) ?? "{}").activeProviderId).toBe("mock");
  });

  it("resets provider health state when switching providers", async () => {
    const providerStore = useProviderStore();

    await providerStore.checkActiveHealth();
    expect(providerStore.activeHealth?.ok).toBe(true);

    providerStore.switchProvider("custom");

    expect(providerStore.activeHealth).toBeNull();
    expect(providerStore.healthError).toBeNull();
  });

  it("loads legacy provider config with missing provider fields", () => {
    localStorage.setItem(providerStorageKey, JSON.stringify({
      activeProviderId: "karpov",
      fallbackProviderIds: ["karpov", "legacy", "mock"],
      providers: {
        freeMusic: { enabled: true },
        karpov: { enabled: true, baseUrl: "https://legacy.example" },
      },
    }));
    setActivePinia(createPinia());

    const providerStore = useProviderStore();

    expect(providerStore.registry.getActive().id).toBe("karpov");
    expect(providerStore.config.fallbackProviderIds).toEqual(["karpov", "mock"]);
    expect(providerStore.config.providers.freeMusic.baseUrl).toBe(defaultProviderConfig.providers.freeMusic.baseUrl);
    expect(providerStore.config.providers.gdStudio.baseUrl).toBe(defaultProviderConfig.providers.gdStudio.baseUrl);
  });

  it("uses GD Studio as the default provider and keeps FreeMusic/GD Studio fallback", () => {
    localStorage.removeItem(providerStorageKey);
    setActivePinia(createPinia());

    expect(useProviderStore().config.activeProviderId).toBe("gdStudio");
    expect(defaultProviderConfig.fallbackProviderIds).toEqual(["freeMusic", "gdStudio"]);

    localStorage.setItem(providerStorageKey, JSON.stringify({ activeProviderId: "freeMusic" }));
    setActivePinia(createPinia());

    expect(useProviderStore().config.activeProviderId).toBe("gdStudio");
  });

  it("normalizes lowercase persisted provider ids", () => {
    localStorage.setItem(providerStorageKey, JSON.stringify({
      activeProviderId: "gdstudio",
      fallbackProviderIds: ["freemusic", "gdstudio"],
    }));
    setActivePinia(createPinia());

    const providerStore = useProviderStore();

    expect(providerStore.config.activeProviderId).toBe("gdStudio");
    expect(providerStore.config.fallbackProviderIds).toEqual(["freeMusic", "gdStudio"]);
  });
});

function song(id: string): NormalizedSong {
  return {
    stableId: `mock:netease:song:${id}`,
    providerSongId: id,
    provider: { providerId: "mock", source: "netease" },
    name: id,
    artists: ["Artist"],
    artistText: "Artist",
    raw: {},
  };
}
