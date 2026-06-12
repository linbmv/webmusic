<template>
  <div v-if="open" class="action-overlay" @click="ui.closeActionSheet" />
  <aside class="action-sheet" :class="{ open }" :aria-hidden="!open">
    <header>
      <strong>{{ title }}</strong>
      <button class="icon-btn" :aria-label="zh.common.close" @click="ui.closeActionSheet"><X :size="18" /></button>
    </header>

    <template v-if="isRename">
      <label>
        <span>{{ zh.music.name }}</span>
        <input ref="nameInput" v-model="tempName" :placeholder="zh.music.name" @keydown.enter="onSave" />
      </label>
      <button class="primary-btn" :disabled="!tempName.trim()" @click="onSave">{{ zh.common.save }}</button>
    </template>

    <template v-else-if="isPlaylistActions">
      <button class="action-row" @click="onRenamePlaylist"><Pencil :size="18" />{{ zh.music.renamePlaylist }}</button>
      <button class="action-row danger" @click="onDeletePlaylist"><Trash2 :size="18" />{{ zh.music.deletePlaylist }}</button>
    </template>

    <template v-else-if="isTrackActions">
      <button class="action-row" @click="onAddToPlaylist"><Plus :size="18" />{{ zh.music.addToPlaylist }}</button>
      <button class="action-row" :disabled="isDownloading || isDownloaded" @click="onDownload">
        <Download :size="18" />{{ downloadLabel }}
      </button>
      <button v-if="canRemoveFromPlaylist" class="action-row danger" @click="onRemoveFromPlaylist">
        <Trash2 :size="18" />{{ zh.music.removeFromPlaylist }}
      </button>
      <button v-if="canRemoveFromFavorites" class="action-row danger" @click="onRemoveFromFavorites">
        <Trash2 :size="18" />{{ zh.music.removeFromFavorites }}
      </button>
    </template>
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { Download, Pencil, Plus, Trash2, X } from "lucide-vue-next";
import { zh } from "@/i18n/zh";
import { useLibraryStore } from "@/stores/libraryStore";
import { usePlayerStore } from "@/stores/playerStore";
import { useUiStore } from "@/stores/uiStore";
import { useAccountStore } from "@/stores/accountStore";
import { useDownloadQueueStore } from "@/stores/downloadQueueStore";

const ui = useUiStore();
const library = useLibraryStore();
const player = usePlayerStore();
const account = useAccountStore();
const downloadQueue = useDownloadQueueStore();
const tempName = ref("");
const nameInput = ref<HTMLInputElement | null>(null);

const open = computed(() => ui.actionSheet !== null);
const isRename = computed(() => ui.actionSheet?.type === "renamePlaylist");
const isPlaylistActions = computed(() => ui.actionSheet?.type === "playlistActions");
const isTrackActions = computed(() => ui.actionSheet?.type === "trackActions");
const canRemoveFromPlaylist = computed(() => ui.actionSheet?.type === "trackActions" && Boolean(ui.actionSheet.playlistId));
const canRemoveFromFavorites = computed(() => ui.actionSheet?.type === "trackActions" && Boolean(ui.actionSheet.isFavorites));

const isDownloading = computed(() => {
  const sheet = ui.actionSheet;
  if (sheet?.type !== "trackActions") return false;
  return downloadQueue.downloadingIds.has(sheet.song.stableId);
});

const isDownloaded = computed(() => {
  const sheet = ui.actionSheet;
  if (sheet?.type !== "trackActions") return false;
  return account.downloads.some(d => d.song.stableId === sheet.song.stableId);
});

const downloadLabel = computed(() => {
  if (isDownloaded.value) return "✓ 已保存到服务器";
  if (isDownloading.value) return "下载中...";
  return account.user ? "下载到服务器" : zh.music.download;
});

const title = computed(() => {
  if (isRename.value) return zh.music.renamePlaylist;
  if (isPlaylistActions.value) return zh.music.playlistActions;
  return zh.music.trackActions;
});

watch(
  () => ui.actionSheet,
  async (sheet) => {
    if (sheet?.type === "renamePlaylist") {
      tempName.value = sheet.currentName;
      await nextTick();
      nameInput.value?.focus();
      nameInput.value?.select();
    }
  },
);

async function onSave(): Promise<void> {
  if (ui.actionSheet?.type !== "renamePlaylist") return;
  const name = tempName.value.trim();
  if (!name) return;
  await library.renamePlaylist(ui.actionSheet.playlistId, name);
  ui.toast(`${zh.music.renamePlaylist}: ${name}`);
  ui.closeActionSheet();
}

// 歌单操作：从操作面板切换到重命名表单，复用现有 onSave 保存逻辑
function onRenamePlaylist(): void {
  if (ui.actionSheet?.type !== "playlistActions") return;
  ui.openRenamePlaylist(ui.actionSheet.playlistId, ui.actionSheet.currentName);
}

// 歌单操作：删除歌单本身，不删除歌曲库、收藏或最近播放
async function onDeletePlaylist(): Promise<void> {
  if (ui.actionSheet?.type !== "playlistActions") return;
  const { playlistId, currentName } = ui.actionSheet;

  // 删除前保存完整播放列表数据用于撤销
  const playlistSnapshot = library.playlists.find((p) => p.id === playlistId);
  if (!playlistSnapshot) return;

  const trackIds = [...playlistSnapshot.trackIds];
  const tracks = library.listPlaylistTracks(playlistId);

  ui.closeActionSheet();
  await library.deletePlaylist(playlistId);

  ui.toast(`${zh.music.deleted}: ${currentName}`, {
    actionLabel: zh.music.undo,
    action: async () => {
      // 重建播放列表：先创建，再批量添加曲目
      const restoredPlaylist = await library.createPlaylist(currentName);
      if (tracks.length > 0) {
        await library.addTracksToPlaylist(restoredPlaylist.id, tracks);
      }
    },
  });
}

function onAddToPlaylist(): void {
  if (ui.actionSheet?.type !== "trackActions") return;
  const song = ui.actionSheet.song;
  ui.closeActionSheet();
  ui.openAddToPlaylist(song);
}

async function onDownload(): Promise<void> {
  if (ui.actionSheet?.type !== "trackActions") return;
  const song = ui.actionSheet.song;
  ui.closeActionSheet();
  ui.toast(`${zh.music.downloading}: ${song.name}`);
  try {
    const result = await player.downloadSong(song);
    if (result.method === "server") {
      ui.toast(`已保存到服务器: ${result.fileName}`);
    } else if (result.method === "newtab") {
      ui.toast(`${zh.music.downloadOpened}: ${result.fileName}`);
    } else {
      ui.toast(`${zh.music.downloaded}: ${result.fileName}`);
    }
  } catch (error) {
    ui.toast(`${zh.music.downloadFailed}: ${error instanceof Error ? error.message : song.name}`);
  }
}

async function onRemoveFromPlaylist(): Promise<void> {
  if (ui.actionSheet?.type !== "trackActions" || !ui.actionSheet.playlistId) return;
  const { playlistId, song } = ui.actionSheet;
  ui.closeActionSheet();
  await library.removeTrackFromPlaylist(playlistId, song.stableId);
  ui.toast(`${zh.music.removed}: ${song.name}`, {
    actionLabel: zh.music.undo,
    action: () => void library.addTrackToPlaylist(playlistId, song),
  });
}

async function onRemoveFromFavorites(): Promise<void> {
  if (ui.actionSheet?.type !== "trackActions" || !ui.actionSheet.isFavorites) return;
  const { song } = ui.actionSheet;
  ui.closeActionSheet();
  await library.removeFavorite(song.stableId);
  ui.toast(`${zh.music.removed}: ${song.name}`, {
    actionLabel: zh.music.undo,
    action: () => void library.toggleFavorite(song),
  });
}
</script>

<style scoped>
.action-overlay {
  position: fixed;
  z-index: 880;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
}

.action-sheet {
  position: fixed;
  z-index: 900;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 18px 18px calc(18px + var(--safe-bottom));
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  background: #11131a;
  border-top: 1px solid var(--bg-border);
  transform: translateY(100%);
  transition: transform 240ms ease;
}

.action-sheet.open {
  transform: translateY(0);
}

.action-sheet header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.action-sheet label {
  display: grid;
  gap: 8px;
  margin: 16px 0;
  color: var(--text-muted);
}

.action-sheet input {
  min-height: 44px;
  border: 1px solid var(--bg-border);
  border-radius: var(--radius-sm);
  background: var(--bg-layer);
  color: var(--text);
  padding: 0 12px;
}

.primary-btn {
  width: 100%;
  min-height: 44px;
  border-radius: var(--radius-sm);
  background: var(--primary);
  color: #fff;
  font-weight: 600;
}

.primary-btn:disabled {
  opacity: 0.5;
}

.action-row {
  width: 100%;
  min-height: 52px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  margin-top: 8px;
  text-align: left;
  border-radius: var(--radius-sm);
  background: var(--bg-layer);
}

.action-row.danger {
  color: #ff453a;
}

</style>
