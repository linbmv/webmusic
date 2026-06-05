<template>
  <div class="page">
    <header class="page-header">
      <div>
        <p class="page-subtitle">{{ zh.music.playlists }}</p>
        <h1 class="page-title">{{ title }}</h1>
      </div>
      <button class="icon-btn" aria-label="back" @click="router.back()">
        <ChevronLeft :size="20" />
      </button>
    </header>

    <section class="playlist-hero card card-pad">
      <div class="ratio-cover" />
      <div>
        <p class="muted">{{ detailText }}</p>
        <div class="hero-actions">
          <button class="primary-btn" :disabled="!rows.length" @click="playAll">{{ zh.common.play }}</button>
          <button class="secondary-btn" :disabled="!rows.length || downloading" @click="downloadAll">
            <Download :size="15" />{{ downloadText }}
          </button>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2 class="section-title">{{ zh.music.playlists }}</h2>
        <span v-if="statusText" class="muted">{{ statusText }}</span>
      </div>
      <TrackList v-if="rows.length" :items="rows" :playlist-id="isLocal ? playlistId : undefined" />
      <p v-else class="muted empty">{{ emptyText }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ChevronLeft, Download } from "lucide-vue-next";
import { zh } from "@/i18n/zh";
import TrackList from "@/components/Track/TrackList.vue";
import { downloadSongsToServer } from "@/playback/downloadBatch";
import { useAccountStore } from "@/stores/accountStore";
import { useLibraryStore } from "@/stores/libraryStore";
import { useMusicStore } from "@/stores/musicStore";
import { usePlayerStore } from "@/stores/playerStore";
import { useProviderStore } from "@/stores/providerStore";
import { useUiStore } from "@/stores/uiStore";
import type { NormalizedSong } from "@/types/music";
import type { TrackRowItem } from "@/types/ui";

const route = useRoute();
const router = useRouter();
const account = useAccountStore();
const music = useMusicStore();
const library = useLibraryStore();
const player = usePlayerStore();
const providerStore = useProviderStore();
const ui = useUiStore();
const downloading = ref(false);
const downloadProgress = ref<{ done: number; total: number } | null>(null);
const loadingDownloadSongs = ref(false);

const playlistId = computed(() => String(route.params.id));
// 本地歌单（IndexedDB）与在线歌单共用 /playlist/:id 路由：先判定是否本地歌单
const localPlaylist = computed(() => library.playlists.find((item) => item.id === playlistId.value) ?? null);
const isLocal = computed(() => localPlaylist.value !== null);

const localRows = computed<TrackRowItem[]>(() => music.songRows(library.listPlaylistTracks(playlistId.value)));
const onlineRows = computed(() => music.songRows(music.playlistSongs));
const rows = computed(() => (isLocal.value ? localRows.value : onlineRows.value));

const title = computed(() => {
  if (isLocal.value) return localPlaylist.value?.name ?? zh.music.playlists;
  return music.playlistDetail?.name ?? zh.music.playlists;
});
const detailText = computed(() => `${rows.value.length} ${zh.common.songUnit}`);
const statusText = computed(() => downloadStatusText.value || providerStatusText.value);
const emptyText = computed(() => (music.loading ? "..." : zh.music.emptyPlaylist));
const downloadText = computed(() => (downloading.value ? zh.music.downloading : zh.music.downloadAllHighQuality));
const providerStatusText = computed(() => (isLocal.value ? "" : music.loading ? "..." : music.activeProviderName));
const downloadStatusText = computed(() => {
  if (!downloading.value) return "";
  if (loadingDownloadSongs.value) return zh.music.batchDownloadLoadingPlaylist;
  if (!downloadProgress.value) return zh.music.downloading;
  return zh.music.batchDownloadProgress
    .replace("{done}", String(downloadProgress.value.done))
    .replace("{total}", String(downloadProgress.value.total));
});

async function load(): Promise<void> {
  await library.load();
  // 仅当不是本地歌单时才请求在线歌单详情，避免本地歌单被在线接口覆盖
  if (!localPlaylist.value) await music.loadPlaylist(playlistId.value, playlistSource.value);
}

async function playAll(): Promise<void> {
  const songs = isLocal.value ? library.listPlaylistTracks(playlistId.value) : music.playlistSongs;
  if (songs.length) await player.playQueue(songs, 0);
}

async function downloadAll(): Promise<void> {
  if (downloading.value) return;
  if (!account.user) {
    ui.toast(zh.music.batchDownloadLoginRequired);
    return;
  }
  downloading.value = true;
  downloadProgress.value = null;
  loadingDownloadSongs.value = !isLocal.value;
  try {
    const songs = await playlistSongsForDownload();
    loadingDownloadSongs.value = false;
    if (!songs.length) {
      ui.toast(zh.music.batchDownloadEmpty);
      return;
    }
    ui.toast(zh.music.batchDownloadStart.replace("{count}", String(songs.length)));
    const providers = [providerStore.activeProvider, ...providerStore.registry.getFallbacks()];
    const summary = await downloadSongsToServer(songs, providers, { onProgress: updateDownloadProgress });
    await account.refreshDownloads();
    ui.toast(downloadSummaryText(summary.succeeded, summary.failed));
  } catch (error) {
    ui.toast(`${zh.music.batchDownloadFailed}: ${error instanceof Error ? error.message : zh.common.unknownError}`);
  } finally {
    downloading.value = false;
    loadingDownloadSongs.value = false;
  }
}

function updateDownloadProgress(progress: { done: number; total: number }): void {
  downloadProgress.value = { done: progress.done, total: progress.total };
}

async function playlistSongsForDownload(): Promise<NormalizedSong[]> {
  if (isLocal.value) return library.listPlaylistTracks(playlistId.value);
  return music.loadFullPlaylistSongs(playlistId.value, playlistSource.value);
}

function downloadSummaryText(succeeded: number, failed: number): string {
  if (!failed) return zh.music.batchDownloadSaved.replace("{count}", String(succeeded));
  return zh.music.batchDownloadPartial.replace("{success}", String(succeeded)).replace("{failed}", String(failed));
}

onMounted(() => void load());
watch(playlistId, () => void load());
watch(() => route.query.source, () => void load());

const playlistSource = computed(() => (route.query.source === "kuwo" ? "kuwo" : "netease"));
</script>

<style scoped>
.playlist-hero {
  display: grid;
  grid-template-columns: 108px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
}

.playlist-hero .ratio-cover {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.playlist-hero div:last-child,
.hero-actions {
  display: grid;
  gap: 10px;
}

.hero-actions {
  grid-template-columns: 1fr;
  align-items: stretch;
  justify-items: start;
}

.hero-actions .primary-btn,
.hero-actions .secondary-btn {
  width: min(100%, 160px);
  min-height: 34px;
  padding-inline: 10px;
  white-space: nowrap;
}

.hero-actions .primary-btn {
  min-width: 64px;
  font-size: 13px;
}

.hero-actions .secondary-btn {
  justify-content: flex-start;
  font-size: 12px;
}

.empty {
  padding: 32px 0;
  text-align: center;
}

@media (max-width: 380px) {
  .playlist-hero {
    grid-template-columns: 96px minmax(0, 1fr);
    gap: 10px;
  }

  .hero-actions .primary-btn,
  .hero-actions .secondary-btn {
    width: min(100%, 142px);
  }
}
</style>
