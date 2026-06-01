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

    <template v-else-if="isTrackActions">
      <button class="action-row" @click="onAddToPlaylist"><Plus :size="18" />{{ zh.music.addToPlaylist }}</button>
      <button class="action-row" @click="onDownload"><Download :size="18" />{{ zh.music.download }}</button>
    </template>
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { Download, Plus, X } from "lucide-vue-next";
import { zh } from "@/i18n/zh";
import { useLibraryStore } from "@/stores/libraryStore";
import { usePlayerStore } from "@/stores/playerStore";
import { useUiStore } from "@/stores/uiStore";

const ui = useUiStore();
const library = useLibraryStore();
const player = usePlayerStore();
const tempName = ref("");
const nameInput = ref<HTMLInputElement | null>(null);

const open = computed(() => ui.actionSheet !== null);
const isRename = computed(() => ui.actionSheet?.type === "renamePlaylist");
const isTrackActions = computed(() => ui.actionSheet?.type === "trackActions");
const title = computed(() => (isRename.value ? zh.music.renamePlaylist : zh.music.trackActions));

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
    if (result.method === "newtab") {
      ui.toast(`${zh.music.downloadOpened}: ${result.fileName}`);
    } else {
      ui.toast(`${zh.music.downloaded}: ${result.fileName}`);
    }
  } catch (error) {
    ui.toast(`${zh.music.downloadFailed}: ${error instanceof Error ? error.message : song.name}`);
  }
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

</style>
