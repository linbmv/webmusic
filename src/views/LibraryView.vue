<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">{{ zh.app.library }}</h1>
        <p class="page-subtitle">{{ zh.music.librarySubtitle }}</p>
      </div>
      <button class="primary-btn create-playlist" @click="createLocalPlaylist"><Plus :size="15" />{{ zh.common.create }}</button>
    </header>

    <section class="library-shortcuts section" :aria-label="zh.app.library">
      <button class="library-shortcut" type="button">
        <span class="shortcut-icon"><Heart :size="17" /></span>
        <span class="shortcut-copy">
          <strong>{{ zh.music.favoriteSongs }}</strong>
          <small>{{ library.favorites.length }} {{ zh.common.songUnit }}</small>
        </span>
      </button>
      <button class="library-shortcut" type="button">
        <span class="shortcut-icon"><Clock3 :size="17" /></span>
        <span class="shortcut-copy">
          <strong>{{ zh.music.recent }}</strong>
          <small>{{ library.recents.length }} {{ zh.common.songUnit }}</small>
        </span>
      </button>
    </section>

    <section class="section">
      <div class="section-head">
        <h2 class="section-title">{{ zh.music.playlists }}</h2>
        <span class="section-hint">{{ zh.music.longPressRename }}</span>
      </div>
      <div class="track-list">
        <button
          v-for="playlist in visiblePlaylists"
          :key="playlist.id"
          class="playlist-row"
          @click="goToPlaylist(playlist)"
          @contextmenu.prevent="renamePlaylist(playlist)"
        >
          <span class="playlist-icon"><ListMusic :size="17" /></span>
          <span class="playlist-copy">
            <strong class="ellipsis">{{ playlist.name }}</strong>
            <small>{{ playlist.trackIds.length }} {{ zh.common.songUnit }}</small>
          </span>
        </button>
      </div>
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
import { computed, onMounted } from "vue";
import { Clock3, Heart, ListMusic, Plus } from "lucide-vue-next";
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
const fallbackPlaylists: LocalPlaylist[] = [
  { id: "fallback-night", name: zh.names.nightWalk, trackIds: [], updatedAt: 0 },
  { id: "fallback-slow", name: zh.names.chineseSlow, trackIds: [], updatedAt: 0 },
];
const visiblePlaylists = computed(() => library.playlists.length ? library.playlists : fallbackPlaylists);
const recentRows = computed<TrackRowItem[]>(() => library.recents.map((recent) => ({
  id: recent.id,
  name: recent.song.name,
  artistText: recent.song.artistText,
  source: getSourceTag(recent.song.provider.source),
  cover: recent.song.coverUrl ?? recent.song.album?.coverUrl ?? "",
  song: recent.song,
})));

async function createLocalPlaylist(): Promise<void> {
  const playlist = await library.createPlaylist(`${zh.music.playlists} ${library.playlists.length + 1}`);
  ui.openRenamePlaylist(playlist.id, playlist.name);
}

function goToPlaylist(playlist: LocalPlaylist): void {
  if (library.playlists.some((item) => item.id === playlist.id)) {
    void router.push(`/playlist/${playlist.id}`);
  }
}

function renamePlaylist(playlist: LocalPlaylist): void {
  if (library.playlists.some((item) => item.id === playlist.id)) {
    ui.openRenamePlaylist(playlist.id, playlist.name);
  }
}

onMounted(() => void library.load());
</script>

<style scoped>
.create-playlist {
  gap: 6px;
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
}

@media (max-width: 360px) {
  .library-shortcuts {
    grid-template-columns: 1fr;
  }
}
</style>
