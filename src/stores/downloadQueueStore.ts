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
      downloadOne(song, account, provider).finally(() => {
        downloadingIds.value.delete(song.stableId);
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

    const toRemove = account.downloads.filter((d) => stableIds.includes(d.song.stableId));
    for (const download of toRemove) {
      try {
        await fetch(`/api/me/downloads/${download.id}`, { method: "DELETE", credentials: "same-origin" });
      } catch (error) {
        console.warn("Failed to remove download", download.id, error);
      }
    }
    await account.refreshDownloads();
  }

  return { downloadingIds, ensureDownloaded, ensureAllPlaylistSongs, removeDownloadsForSongs };
});
