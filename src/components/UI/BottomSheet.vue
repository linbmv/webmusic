<template>
  <div v-if="open" class="sheet-overlay" @click="ui.closeBottomSheet" />
  <aside class="sheet" :class="{ open }" :aria-hidden="!open">
    <header>
      <strong>{{ title }}</strong>
      <button class="icon-btn" :aria-label="zh.common.close" @click="ui.closeBottomSheet"><X :size="18" /></button>
    </header>

    <template v-if="isAddToPlaylist">
      <button class="sheet-row create" @click="onCreate"><Plus :size="18" />{{ createLabel }}</button>
      <button
        v-for="playlist in library.playlists"
        :key="playlist.id"
        class="sheet-row"
        @click="onAdd(playlist.id, playlist.name)"
      >
        <Check v-if="containsActiveSong(playlist.id)" :size="18" class="check" />
        <span v-else class="check-placeholder" />
        <span class="sheet-row-name ellipsis">{{ playlist.name }}</span>
        <span class="sheet-row-count">{{ playlist.trackIds.length }}</span>
      </button>
      <p v-if="!library.playlists.length" class="sheet-empty">{{ zh.music.noPlaylists }}</p>
    </template>

    <template v-else-if="isQueue">
      <button
        v-for="(song, index) in player.queueItems"
        :key="song.stableId"
        class="sheet-row"
        :class="{ playing: index === player.queueIndex }"
        @click="onPlayQueueItem(index)"
      >
        <span class="check-placeholder">{{ index + 1 }}</span>
        <span class="sheet-row-name ellipsis">{{ song.name }}</span>
        <small class="sheet-row-count ellipsis">{{ song.artistText }}</small>
      </button>
      <p v-if="!player.queueItems.length" class="sheet-empty">{{ zh.music.emptyQueue }}</p>
    </template>
  </aside>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Check, Plus, X } from "lucide-vue-next";
import { zh } from "@/i18n/zh";
import { useLibraryStore } from "@/stores/libraryStore";
import { usePlayerStore } from "@/stores/playerStore";
import { useUiStore } from "@/stores/uiStore";

const ui = useUiStore();
const library = useLibraryStore();
const player = usePlayerStore();

const open = computed(() => ui.bottomSheet !== null);
const isAddToPlaylist = computed(() => ui.bottomSheet?.type === "addToPlaylist");
const isQueue = computed(() => ui.bottomSheet?.type === "queue");
const addSheet = computed(() => ui.bottomSheet?.type === "addToPlaylist" ? ui.bottomSheet : null);
const title = computed(() => {
  if (isQueue.value) return zh.common.queue;
  const count = addSheet.value?.songs.length ?? 0;
  return count ? `${zh.music.addToPlaylist} · ${count} ${zh.common.songUnit}` : zh.music.addToPlaylist;
});
const createLabel = computed(() => {
  const name = defaultPlaylistName();
  return name ? formatName(zh.music.createPlaylistAndAdd, name) : zh.common.createPlaylist;
});

function containsActiveSong(playlistId: string): boolean {
  const sheet = ui.bottomSheet;
  if (sheet?.type !== "addToPlaylist") return false;
  const tracks = library.listPlaylistTracks(playlistId);
  const ids = new Set(tracks.map((song) => song.stableId));
  return sheet.songs.every((song) => ids.has(song.stableId));
}

async function onAdd(playlistId: string, playlistName: string): Promise<void> {
  if (ui.bottomSheet?.type !== "addToPlaylist") return;
  const songs = ui.bottomSheet.songs;
  await library.addTracksToPlaylist(playlistId, songs);
  ui.toast(formatAddedMessage(playlistName, songs.length));
  ui.closeBottomSheet();
}

async function onCreate(): Promise<void> {
  if (ui.bottomSheet?.type !== "addToPlaylist") return;
  const songs = ui.bottomSheet.songs;
  const playlistName = defaultPlaylistName() || `${zh.music.playlists} ${library.playlists.length + 1}`;
  const playlist = await library.createPlaylist(playlistName);
  await library.addTracksToPlaylist(playlist.id, songs);
  ui.toast(formatAddedMessage(playlist.name, songs.length));
  ui.closeBottomSheet();
}

function defaultPlaylistName(): string {
  return ui.bottomSheet?.type === "addToPlaylist" ? ui.bottomSheet.title?.trim() ?? "" : "";
}

function formatAddedMessage(name: string, count: number): string {
  return zh.music.addedSongsToPlaylist.replace("{name}", name).replace("{count}", String(count));
}

function formatName(template: string, name: string): string {
  return template.replace("{name}", name);
}

async function onPlayQueueItem(index: number): Promise<void> {
  await player.jumpTo(index);
  ui.closeBottomSheet();
}
</script>

<style scoped>
.sheet-overlay {
  position: fixed;
  z-index: 880;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
}

.sheet {
  position: fixed;
  z-index: 900;
  left: 0;
  right: 0;
  bottom: 0;
  max-height: 70vh;
  overflow-y: auto;
  padding: 18px 18px calc(18px + var(--safe-bottom));
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  background: #11131a;
  border-top: 1px solid var(--bg-border);
  transform: translateY(100%);
  transition: transform 240ms ease;
}

.sheet.open {
  transform: translateY(0);
}

.sheet header,
.sheet-row {
  display: flex;
  align-items: center;
}

.sheet header {
  justify-content: space-between;
  margin-bottom: 12px;
}

.sheet-row {
  width: 100%;
  min-height: 52px;
  gap: 10px;
  padding: 0 14px;
  margin-top: 8px;
  text-align: left;
  border-radius: var(--radius-sm);
  background: var(--bg-layer);
}

.sheet-row.create {
  color: var(--primary);
}

.sheet-row.playing {
  color: var(--primary);
}

.sheet-row-name {
  flex: 1;
  min-width: 0;
}

.sheet-row-count {
  color: var(--text-muted);
  font-size: 12px;
}

.check {
  color: var(--primary);
}

.check-placeholder {
  width: 18px;
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
}

.sheet-empty {
  margin: 16px 0;
  text-align: center;
  color: var(--text-muted);
}
</style>
