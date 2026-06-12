import { defineStore } from "pinia";
import { ref } from "vue";
import { DownloadService } from "@/playback/download";
import { useAccountStore } from "@/stores/accountStore";
import { useProviderStore } from "@/stores/providerStore";
import type { NormalizedSong } from "@/types/music";

const MAX_CONCURRENT = 2;

export const useDownloadQueueStore = defineStore("downloadQueue", () => {
  const downloadingIds = ref(new Set<string>());
  const queue: NormalizedSong[] = [];
  let processing = false;

  async function ensureDownloaded(song: NormalizedSong): Promise<void> {
    const account = useAccountStore();
    if (!account.user) return;
    if (downloadingIds.value.has(song.stableId)) return;
    if (account.downloads.some((d) => d.song.stableId === song.stableId)) return;

    queue.push(song);
    if (!processing) void processQueue();
  }

  async function processQueue(): Promise<void> {
    if (processing) return;
    processing = true;
    const account = useAccountStore();
    const provider = useProviderStore();

    while (queue.length > 0 && downloadingIds.value.size < MAX_CONCURRENT) {
      const song = queue.shift();
      if (!song || !account.user) continue;
      if (account.downloads.some((d) => d.song.stableId === song.stableId)) continue;

      downloadingIds.value.add(song.stableId);
      downloadOne(song, account, provider)
        .then(() => {
          downloadingIds.value.delete(song.stableId);
        })
        .catch((err) => {
          console.error("Download failed:", song.name, err);
          downloadingIds.value.delete(song.stableId);
        })
        .finally(() => {
          if (queue.length > 0) void processQueue();
        });
    }
    processing = false;
  }

  async function downloadOne(song: NormalizedSong, account: ReturnType<typeof useAccountStore>, provider: ReturnType<typeof useProviderStore>): Promise<void> {
    try {
      const service = new DownloadService([provider.activeProvider, ...provider.registry.getFallbacks()]);
      await service.download(song, "flac", { server: true });
      await account.refreshDownloads();
    } catch (error) {
      console.warn("Auto-download failed for", song.name, error);
    }
  }

  function ensureAllPlaylistSongs(songs: NormalizedSong[]): void {
    songs.forEach((song) => ensureDownloaded(song));
  }

  async function removeDownloadsForSongs(stableIds: string[]): Promise<void> {
    const account = useAccountStore();
    if (!account.user || stableIds.length === 0) return;

    // 先从队列中移除待下载项（避免删除后又被下载回来）
    const stableIdSet = new Set(stableIds);
    const queueBefore = queue.length;
    for (let i = queue.length - 1; i >= 0; i--) {
      if (stableIdSet.has(queue[i].stableId)) {
        queue.splice(i, 1);
        downloadingIds.value.delete(queue[i].stableId);
      }
    }
    if (queue.length < queueBefore) {
      console.log(`Cancelled ${queueBefore - queue.length} pending downloads from queue`);
    }

    // 删除已存在的服务端下载
    const toRemove = account.downloads.filter((d) => stableIds.includes(d.song.stableId));
    for (const download of toRemove) {
      try {
        const response = await fetch(`/api/me/downloads/${download.id}`, { method: "DELETE", credentials: "same-origin" });
        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: "Unknown error" }));
          console.warn(`Failed to remove download ${download.id}:`, response.status, error);
        }
      } catch (error) {
        console.warn("Failed to remove download", download.id, error);
      }
    }
    await account.refreshDownloads();
  }

  async function manualDownload(song: NormalizedSong): Promise<void> {
    const account = useAccountStore();
    if (!account.user) return;

    // 手动下载：立即执行，不受并发限制
    if (downloadingIds.value.has(song.stableId)) {
      console.log("Already downloading:", song.name);
      return;
    }
    if (account.downloads.some((d) => d.song.stableId === song.stableId)) {
      console.log("Already downloaded:", song.name);
      return;
    }

    downloadingIds.value.add(song.stableId);
    try {
      const provider = useProviderStore();
      await downloadOne(song, account, provider);
    } catch (err) {
      console.error("Manual download failed:", song.name, err);
      throw err; // 重新抛出，让调用方处理
    } finally {
      downloadingIds.value.delete(song.stableId);
    }
  }

  return { downloadingIds, ensureDownloaded, ensureAllPlaylistSongs, removeDownloadsForSongs, manualDownload };
});
