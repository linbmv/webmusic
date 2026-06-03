import { defineStore } from "pinia";
import { ref } from "vue";
import * as accountApi from "@/services/accountApi";
import { useLibraryStore } from "@/stores/libraryStore";
import {
  isEmptyLibrary,
  libraryFingerprint,
  mergeLibraries,
  readLibrarySyncMeta,
  sameLibrary,
  writeLibrarySyncMeta,
} from "@/stores/librarySync";
import { onLibraryChanged } from "@/stores/librarySyncBus";
import type { LibrarySnapshot, ServerDownload } from "@/services/accountApi";

const autoUploadDelayMs = 800;
const remoteSyncIntervalMs = 30_000;

export const useAccountStore = defineStore("account", () => {
  const user = ref<accountApi.AccountUser | null>(null);
  const downloads = ref<ServerDownload[]>([]);
  const totalDownloadBytes = ref(0);
  const loading = ref(false);
  const syncStatus = ref<"idle" | "syncing" | "synced" | "error">("idle");
  const error = ref<string | null>(null);
  const lastSyncedAt = ref<number | null>(null);
  const serverLibraryUpdatedAt = ref<number | null>(null);

  let autoUploadTimer: ReturnType<typeof setTimeout> | null = null;
  let autoUploadChain = Promise.resolve();
  let detachLibraryChangeListener: (() => void) | null = null;
  let remoteSyncTimer: ReturnType<typeof setInterval> | null = null;
  let remoteSyncRunning = false;

  async function loadMe(): Promise<void> {
    await run(async () => {
      user.value = await accountApi.getMe();
      if (user.value) await initializeAuthenticatedSession();
      else stopLibrarySync();
    });
  }

  async function signIn(username: string, password: string): Promise<void> {
    await run(async () => {
      user.value = await accountApi.login(username, password);
      await initializeAuthenticatedSession();
    });
  }

  async function signUp(username: string, password: string): Promise<void> {
    await run(async () => {
      user.value = await accountApi.register(username, password);
      await initializeAuthenticatedSession();
    });
  }

  async function signOut(): Promise<void> {
    stopLibrarySync();
    await accountApi.logout();
    user.value = null;
    downloads.value = [];
    totalDownloadBytes.value = 0;
    syncStatus.value = "idle";
    error.value = null;
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
    const library = useLibraryStore();
    await library.load();
    await saveLibrarySnapshot(library.snapshot());
  }

  async function replaceLocalLibraryFromServer(): Promise<void> {
    const result = await accountApi.getLibrary();
    serverLibraryUpdatedAt.value = result.updatedAt;
    if (!result.updatedAt && isEmptyLibrary(result.library)) throw new Error("No server library snapshot to pull");
    await replaceLocalLibrary(result.library, result.updatedAt ?? Date.now());
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

  async function initializeAuthenticatedSession(): Promise<void> {
    await refreshDownloads();
    await syncLibraryAfterAuth();
    startLocalUploadSync();
    startRemoteLibrarySync();
  }

  async function syncLibraryAfterAuth(): Promise<void> {
    if (!user.value) return;
    syncStatus.value = "syncing";
    const library = useLibraryStore();
    await library.load();
    const local = library.snapshot();
    const server = await accountApi.getLibrary();
    serverLibraryUpdatedAt.value = server.updatedAt;
    await reconcileLibrary(local, server.library, server.updatedAt);
  }

  async function reconcileLibrary(local: LibrarySnapshot, server: LibrarySnapshot, updatedAt: number | null): Promise<void> {
    if (!updatedAt && isEmptyLibrary(server)) return saveInitialLocalLibrary(local);
    if (shouldPullServerLibrary(local, server, updatedAt)) return replaceLocalLibrary(server, updatedAt ?? Date.now());
    if (sameLibrary(local, server)) return markLibrarySynced(updatedAt ?? Date.now(), server);
    await mergeAndUploadLibrary(local, server);
  }

  async function saveInitialLocalLibrary(local: LibrarySnapshot): Promise<void> {
    if (isEmptyLibrary(local)) {
      syncStatus.value = "idle";
      return;
    }
    await saveLibrarySnapshot(local);
  }

  function shouldPullServerLibrary(local: LibrarySnapshot, server: LibrarySnapshot, updatedAt: number | null): boolean {
    if (isEmptyLibrary(local)) return true;
    if (!user.value || !updatedAt) return false;
    const meta = readLibrarySyncMeta(user.value.id);
    const localChanged = !meta || meta.fingerprint !== libraryFingerprint(local);
    return !localChanged && !sameLibrary(local, server);
  }

  async function mergeAndUploadLibrary(local: LibrarySnapshot, server: LibrarySnapshot): Promise<void> {
    const merged = mergeLibraries(local, server);
    // Merge first when both devices changed, then upload the combined playlist state.
    if (!sameLibrary(merged, local)) await useLibraryStore().replaceLibrary(merged);
    await saveLibrarySnapshot(merged);
  }

  async function replaceLocalLibrary(library: LibrarySnapshot, updatedAt: number): Promise<void> {
    await useLibraryStore().replaceLibrary(library);
    markLibrarySynced(updatedAt, library);
  }

  async function saveLibrarySnapshot(library: LibrarySnapshot): Promise<void> {
    if (!user.value) throw new Error("Not signed in");
    syncStatus.value = "syncing";
    const result = await accountApi.saveLibrary(library);
    if (result.updatedAt === null) throw new Error("Server did not return library sync timestamp");
    markLibrarySynced(result.updatedAt, result.library);
  }

  function markLibrarySynced(updatedAt: number, library: LibrarySnapshot): void {
    if (!user.value) return;
    lastSyncedAt.value = updatedAt;
    serverLibraryUpdatedAt.value = updatedAt;
    syncStatus.value = "synced";
    writeLibrarySyncMeta(user.value.id, updatedAt, library);
  }

  function startLocalUploadSync(): void {
    if (detachLibraryChangeListener) return;
    detachLibraryChangeListener = onLibraryChanged(queueLibraryUpload);
  }

  function stopLocalUploadSync(): void {
    detachLibraryChangeListener?.();
    detachLibraryChangeListener = null;
    if (autoUploadTimer) clearTimeout(autoUploadTimer);
    autoUploadTimer = null;
  }

  function startRemoteLibrarySync(): void {
    if (remoteSyncTimer) return;
    remoteSyncTimer = setInterval(() => void queueRemoteLibrarySync(), remoteSyncIntervalMs);
    window.addEventListener("focus", onWindowFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
  }

  function stopRemoteLibrarySync(): void {
    if (remoteSyncTimer) clearInterval(remoteSyncTimer);
    remoteSyncTimer = null;
    window.removeEventListener("focus", onWindowFocus);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  }

  function stopLibrarySync(): void {
    stopLocalUploadSync();
    stopRemoteLibrarySync();
  }

  function onWindowFocus(): void {
    void queueRemoteLibrarySync();
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === "visible") void queueRemoteLibrarySync();
  }

  async function queueRemoteLibrarySync(): Promise<void> {
    if (!user.value || remoteSyncRunning) return;
    remoteSyncRunning = true;
    try {
      await syncLibraryAfterAuth();
    } catch (caught) {
      handleBackgroundSyncError(caught);
    } finally {
      remoteSyncRunning = false;
    }
  }

  function queueLibraryUpload(): void {
    if (!user.value) return;
    if (autoUploadTimer) clearTimeout(autoUploadTimer);
    autoUploadTimer = setTimeout(() => {
      autoUploadTimer = null;
      autoUploadChain = autoUploadChain.catch(() => undefined).then(autoUploadLocalLibrary);
    }, autoUploadDelayMs);
  }

  async function autoUploadLocalLibrary(): Promise<void> {
    if (!user.value) return;
    try {
      await saveLocalLibrary();
    } catch (caught) {
      handleBackgroundSyncError(caught);
    }
  }

  function handleBackgroundSyncError(caught: unknown): void {
    syncStatus.value = "error";
    error.value = caught instanceof Error ? caught.message : "Library auto-sync failed";
    console.error("Library auto-sync failed", caught);
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
    queueLibraryUpload,
    refreshDownloads,
    refreshServerLibraryStatus,
  };
});
