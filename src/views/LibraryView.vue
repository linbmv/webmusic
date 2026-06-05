<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">{{ zh.app.library }}</h1>
        <p class="page-subtitle">{{ zh.music.librarySubtitle }}</p>
      </div>
      <button class="primary-btn create-playlist" @click="createLocalPlaylist"><Plus :size="16" />{{ zh.common.createPlaylist }}</button>
    </header>

    <section class="section playlist-section">
      <div class="section-head">
        <h2 class="section-title">{{ zh.music.playlists }}</h2>
        <span class="section-hint">{{ zh.music.playlistManageHint }}</span>
      </div>
      <div class="track-list">
        <div
          v-for="playlist in visiblePlaylists"
          :key="playlist.id"
          class="playlist-row"
          role="button"
          tabindex="0"
          @click="onPlaylistClick(playlist)"
          @keydown.enter="goToPlaylist(playlist)"
          @keydown.space.prevent="goToPlaylist(playlist)"
          @contextmenu.prevent="openPlaylistActions(playlist)"
          @touchstart.passive="onTouchStart(playlist, $event)"
          @touchmove.passive="onTouchMove($event)"
          @touchend="clearLongPress"
          @touchcancel="clearLongPress"
        >
          <span class="playlist-icon"><ListMusic :size="17" /></span>
          <span class="playlist-copy">
            <strong class="ellipsis">{{ playlist.name }}</strong>
            <small>{{ playlist.trackIds.length }} {{ zh.common.songUnit }}</small>
          </span>
          <button
            v-if="isRealPlaylist(playlist)"
            class="icon-btn playlist-more"
            :aria-label="zh.music.playlistActions"
            @pointerdown.stop
            @touchstart.stop
            @click.stop="openPlaylistActions(playlist)"
          >
            <MoreHorizontal :size="18" />
          </button>
        </div>
      </div>
    </section>

    <section class="library-shortcuts section" :aria-label="zh.app.library">
      <button class="library-shortcut" type="button" :class="{ active: activeTab === 'favorites' }" @click="toggleTab('favorites')">
        <span class="shortcut-icon"><Heart :size="17" /></span>
        <span class="shortcut-copy">
          <strong>{{ zh.music.favoriteSongs }}</strong>
          <small>{{ library.favorites.length }} {{ zh.common.songUnit }}</small>
        </span>
      </button>
      <button class="library-shortcut" type="button" :class="{ active: activeTab === 'recent' }" @click="toggleTab('recent')">
        <span class="shortcut-icon"><Clock3 :size="17" /></span>
        <span class="shortcut-copy">
          <strong>{{ zh.music.recent }}</strong>
          <small>{{ library.recents.length }} {{ zh.common.songUnit }}</small>
        </span>
      </button>
    </section>

    <section v-if="activeTab === 'favorites'" class="section">
      <div class="section-head">
        <h2 class="section-title">{{ zh.music.favoriteSongs }}</h2>
      </div>
      <TrackList v-if="favoriteRows.length" :items="favoriteRows" is-favorites />
      <p v-else class="muted empty">{{ zh.music.emptyPlaylist }}</p>
    </section>

    <section class="section">
      <div class="section-head">
        <h2 class="section-title">{{ zh.music.recent }}</h2>
      </div>
      <TrackList :items="recentRows" compact />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Clock3, Heart, ListMusic, MoreHorizontal, Plus } from "lucide-vue-next";
import { useRouter } from "vue-router";
import { zh } from "@/i18n/zh";
import TrackList from "@/components/Track/TrackList.vue";
import { getSourceTag } from "@/providers/sourceMetadata";
import { useLibraryStore } from "@/stores/libraryStore";
import { useUiStore } from "@/stores/uiStore";
import type { LocalPlaylist } from "@/types/music";
import type { TrackRowItem } from "@/types/ui";

const ui = useUiStore();
const library = useLibraryStore();
const router = useRouter();
const activeTab = ref<"none" | "favorites" | "recent">("none");
const fallbackPlaylists: LocalPlaylist[] = [
  { id: "fallback-night", name: zh.names.nightWalk, trackIds: [], updatedAt: 0 },
  { id: "fallback-slow", name: zh.names.chineseSlow, trackIds: [], updatedAt: 0 },
];
const visiblePlaylists = computed(() => library.playlists.length ? library.playlists : fallbackPlaylists);
const favoriteRows = computed<TrackRowItem[]>(() => library.favorites.map((song) => ({
  id: song.stableId,
  name: song.name,
  artistText: song.artistText,
  source: getSourceTag(song.provider.source),
  cover: song.coverUrl ?? song.album?.coverUrl ?? "",
  song,
})));
const recentRows = computed<TrackRowItem[]>(() => library.recents.map((recent) => ({
  id: recent.id,
  name: recent.song.name,
  artistText: recent.song.artistText,
  source: getSourceTag(recent.song.provider.source),
  cover: recent.song.coverUrl ?? recent.song.album?.coverUrl ?? "",
  song: recent.song,
})));

function toggleTab(tab: "favorites" | "recent"): void {
  activeTab.value = activeTab.value === tab ? "none" : tab;
}

async function createLocalPlaylist(): Promise<void> {
  const playlist = await library.createPlaylist(`${zh.music.playlists} ${library.playlists.length + 1}`);
  ui.openRenamePlaylist(playlist.id, playlist.name);
}

function goToPlaylist(playlist: LocalPlaylist): void {
  if (isRealPlaylist(playlist)) {
    void router.push(`/playlist/${playlist.id}`);
  }
}

function isRealPlaylist(playlist: LocalPlaylist): boolean {
  return library.playlists.some((item) => item.id === playlist.id);
}

// 歌单操作入口：右键、长按、行尾“更多”均打开操作面板（重命名 / 删除）；fallback 占位歌单不可操作
function openPlaylistActions(playlist: LocalPlaylist): void {
  if (isRealPlaylist(playlist)) {
    ui.openPlaylistActions(playlist.id, playlist.name);
  }
}

// 点击进入歌单详情；若刚触发长按则吞掉这次合成 click，避免长按后又跳转
function onPlaylistClick(playlist: LocalPlaylist): void {
  if (suppressClick.value) {
    suppressClick.value = false;
    return;
  }
  goToPlaylist(playlist);
}

// iOS Safari/PWA 不稳定派发 contextmenu，改用触摸长按计时器打开歌单操作面板
const LONG_PRESS_MS = 560;
const TAP_SLOP = 10;
const longPressTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const touchStartX = ref(0);
const touchStartY = ref(0);
const suppressClick = ref(false);

function clearLongPress(): void {
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value);
    longPressTimer.value = null;
  }
}

function onTouchStart(playlist: LocalPlaylist, event: TouchEvent): void {
  if (event.touches.length !== 1) return;
  suppressClick.value = false;
  touchStartX.value = event.touches[0].clientX;
  touchStartY.value = event.touches[0].clientY;
  clearLongPress();
  longPressTimer.value = setTimeout(() => {
    suppressClick.value = true;
    openPlaylistActions(playlist);
  }, LONG_PRESS_MS);
}

// 手指移动超过 TAP_SLOP（滚动列表）即取消长按，避免滚动时误触发操作面板
function onTouchMove(event: TouchEvent): void {
  if (event.touches.length !== 1) return;
  const deltaX = Math.abs(event.touches[0].clientX - touchStartX.value);
  const deltaY = Math.abs(event.touches[0].clientY - touchStartY.value);
  if (deltaX > TAP_SLOP || deltaY > TAP_SLOP) clearLongPress();
}

onMounted(() => void library.load());
</script>

<style scoped>
.create-playlist {
  min-width: 0;
  height: 34px;
  flex: 0 0 auto;
  gap: 5px;
  padding: 0 10px;
  border-radius: 10px;
  white-space: nowrap;
  font-size: 13px;
  line-height: 1;
}

.library-shortcuts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.library-shortcut,
.playlist-row {
  text-align: left;
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.055);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.library-shortcut {
  min-height: 54px;
  padding: 9px 10px;
}

.library-shortcut.active {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.shortcut-icon,
.playlist-icon {
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(235, 235, 245, 0.72);
}

.shortcut-copy,
.playlist-copy {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.shortcut-copy strong,
.playlist-copy strong {
  font-size: 13px;
  font-weight: 650;
  line-height: 1.15;
}

.shortcut-copy small,
.playlist-copy small,
.section-hint {
  color: var(--text-muted);
  font-size: 11px;
}

.playlist-row {
  width: 100%;
  min-height: 50px;
  padding: 8px 10px;
  cursor: pointer;
  /* iOS Safari/PWA 触摸保护：保留纵向滚动，禁止系统文本选择与长按 callout 干扰长按手势 */
  touch-action: pan-y;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.playlist-copy {
  flex: 1;
}

.playlist-more {
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  color: rgba(235, 235, 245, 0.58);
}

@media (max-width: 360px) {
  .page-header {
    align-items: flex-start;
  }

  .create-playlist {
    height: 32px;
    padding-inline: 9px;
    font-size: 12px;
  }

  .library-shortcuts {
    grid-template-columns: 1fr;
  }
}
</style>
