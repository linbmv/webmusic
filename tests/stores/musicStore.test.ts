import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useMusicStore } from "@/stores/musicStore";
import { useProviderStore } from "@/stores/providerStore";
import { defaultProviderConfig, providerStorageKey } from "@/config/providerConfig";

describe("musicStore", () => {
  beforeEach(() => {
    localStorage.removeItem(providerStorageKey);
    setActivePinia(createPinia());
    useProviderStore().switchProvider("mock");
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

  it("falls back when the active provider cannot handle a request", async () => {
    const providerStore = useProviderStore();
    providerStore.switchProvider("custom");
    const store = useMusicStore();

    await store.loadDiscover();

    expect(store.error).toBeNull();
    expect(store.discoverSongs.length).toBeGreaterThan(0);
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
});
