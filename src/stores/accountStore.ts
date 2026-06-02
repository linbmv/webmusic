import { defineStore } from "pinia";
import { ref } from "vue";
import * as accountApi from "@/services/accountApi";
import { useLibraryStore } from "@/stores/libraryStore";
import type { ServerDownload } from "@/services/accountApi";

export const useAccountStore = defineStore("account", () => {
  const user = ref<accountApi.AccountUser | null>(null);
  const downloads = ref<ServerDownload[]>([]);
  const totalDownloadBytes = ref(0);
  const loading = ref(false);
  const syncStatus = ref<"idle" | "syncing" | "synced" | "error">("idle");
  const error = ref<string | null>(null);
  const lastSyncedAt = ref<number | null>(null);
  const serverLibraryUpdatedAt = ref<number | null>(null);

  async function loadMe(): Promise<void> {
    user.value = await accountApi.getMe();
    if (user.value) {
      await refreshDownloads();
      await refreshServerLibraryStatus();
    }
  }

  async function signIn(username: string, password: string): Promise<void> {
    await run(async () => {
      user.value = await accountApi.login(username, password);
      await refreshDownloads();
      await refreshServerLibraryStatus();
    });
  }

  async function signUp(username: string, password: string): Promise<void> {
    await run(async () => {
      user.value = await accountApi.register(username, password);
      await saveLocalLibrary();
      await refreshDownloads();
    });
  }

  async function signOut(): Promise<void> {
    await accountApi.logout();
    user.value = null;
    downloads.value = [];
    totalDownloadBytes.value = 0;
    syncStatus.value = "idle";
    serverLibraryUpdatedAt.value = null;
    lastSyncedAt.value = null;
  }

  async function pushLibrary(): Promise<void> {
    await run(saveLocalLibrary);
  }

  async function pullLibrary(): Promise<void> {
    await run(replaceLocalLibraryFromServer);
  }

  async function saveLocalLibrary(): Promise<void> {
    if (!user.value) throw new Error("Not signed in");
    syncStatus.value = "syncing";
    const library = useLibraryStore();
    await library.load();
    const result = await accountApi.saveLibrary(library.snapshot());
    lastSyncedAt.value = result.updatedAt;
    serverLibraryUpdatedAt.value = result.updatedAt;
    syncStatus.value = "synced";
  }

  async function replaceLocalLibraryFromServer(): Promise<void> {
    if (!user.value) throw new Error("Not signed in");
    syncStatus.value = "syncing";
    const result = await accountApi.getLibrary();
    serverLibraryUpdatedAt.value = result.updatedAt;
    if (!result.updatedAt && isEmptyLibrary(result.library)) throw new Error("No server library snapshot to pull");
    await useLibraryStore().replaceLibrary(result.library);
    lastSyncedAt.value = result.updatedAt;
    syncStatus.value = "synced";
  }

  async function refreshServerLibraryStatus(): Promise<void> {
    if (!user.value) return;
    const result = await accountApi.getLibrary();
    serverLibraryUpdatedAt.value = result.updatedAt;
  }

  async function refreshDownloads(): Promise<void> {
    if (!user.value) return;
    const result = await accountApi.listDownloads();
    downloads.value = result.downloads;
    totalDownloadBytes.value = result.totalBytes;
  }

  async function run(action: () => Promise<void>): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await action();
    } catch (caught) {
      syncStatus.value = "error";
      error.value = caught instanceof Error ? caught.message : "Account operation failed";
      throw caught;
    } finally {
      loading.value = false;
    }
  }

  return {
    user,
    downloads,
    totalDownloadBytes,
    loading,
    syncStatus,
    error,
    lastSyncedAt,
    serverLibraryUpdatedAt,
    loadMe,
    signIn,
    signUp,
    signOut,
    pushLibrary,
    pullLibrary,
    refreshDownloads,
    refreshServerLibraryStatus,
  };
});

function isEmptyLibrary(library: accountApi.LibrarySnapshot): boolean {
  return library.favorites.length === 0 && library.playlists.length === 0 && library.recents.length === 0;
}
