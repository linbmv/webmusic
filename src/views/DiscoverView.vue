<template>
  <div class="page">
    <section class="daily-entry" aria-label="featured playlists">
      <button class="daily-card" @click="playFirstRecent">
        <span class="daily-copy">
          <strong>{{ zh.music.daily }}</strong>
          <small>{{ music.activeProviderName }} · {{ zh.music.playDaily }}</small>
        </span>
        <span class="daily-play"><Play :size="16" fill="currentColor" /></span>
      </button>
    </section>

    <section class="section">
      <div class="section-head">
        <h2 class="section-title">{{ zh.music.recommendPlaylists }}</h2>
        <button class="text-btn">{{ zh.common.more }}</button>
      </div>
      <div class="pl-grid">
        <RouterLink v-for="playlist in playlistCards" :key="playlist.id" class="playlist-card" :to="`/playlist/${playlist.id}`">
          <div class="card-cover" :style="playlist.coverUrl ? { backgroundImage: `url(${playlist.coverUrl})` } : { background: playlist.cover }">
            <span class="card-play"><Play :size="14" fill="currentColor" /></span>
          </div>
          <div class="card-meta">
            <strong class="card-title">{{ playlist.name }}</strong>
            <span class="card-info">{{ playlist.trackCount }} {{ zh.common.songUnit }}</span>
          </div>
        </RouterLink>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2 class="section-title">{{ zh.app.toplist }}</h2>
        <RouterLink class="text-btn" to="/toplist">{{ zh.common.more }}</RouterLink>
      </div>
      <RouterLink class="toplist-entry" to="/toplist">
        <span>
          <strong>{{ zh.music.neteaseRising }}</strong>
          <small>{{ zh.music.toplistSubtitle }}</small>
        </span>
        <Play :size="16" fill="currentColor" />
      </RouterLink>
    </section>

    <section class="section">
      <div class="section-head">
        <h2 class="section-title">{{ zh.music.recent }}</h2>
        <button class="sl-play-all" @click="playAllDiscover"><Play :size="14" fill="currentColor" />{{ zh.music.playDaily }}</button>
      </div>
      <TrackList :items="recentTracks" />
    </section>
  </div>
</template>

<script setup lang="ts">
import { Play } from "lucide-vue-next";
import { computed, onMounted } from "vue";
import { RouterLink } from "vue-router";
import { zh } from "@/i18n/zh";
import TrackList from "@/components/Track/TrackList.vue";
import { useMusicStore } from "@/stores/musicStore";
import { usePlayerStore } from "@/stores/playerStore";
import { useUiStore } from "@/stores/uiStore";

const ui = useUiStore();
const music = useMusicStore();
const player = usePlayerStore();
const playlistCards = computed(() => music.playlists.length ? music.playlists.map((playlist, index) => ({
  id: playlist.id,
  name: playlist.name,
  cover: neutralCover,
  coverUrl: playlist.coverUrl,
  trackCount: playlist.trackCount ?? 0,
})) : fallbackPlaylists);
const recentTracks = computed(() => music.songRows(music.discoverSongs));

const neutralCover = "rgba(255, 255, 255, 0.08)";

const fallbackPlaylists = [
  { id: "2250011882", name: zh.names.douyinRank, cover: neutralCover, coverUrl: undefined as string | undefined, trackCount: 82 },
  { id: "night-walk", name: zh.names.nightWalk, cover: neutralCover, coverUrl: undefined as string | undefined, trackCount: 36 },
  { id: "new-songs", name: zh.names.newSongs, cover: neutralCover, coverUrl: undefined as string | undefined, trackCount: 48 },
];

async function playAllDiscover(): Promise<void> {
  if (!music.discoverSongs.length) return;
  await player.playQueue(music.discoverSongs, 0);
  ui.openPlayer();
}

async function playFirstRecent(): Promise<void> {
  await playAllDiscover();
}

onMounted(() => void music.loadDiscover());
</script>

<style scoped>
.daily-entry {
  margin-bottom: 10px;
}

.daily-card {
  width: 100%;
  min-height: 76px;
  padding: 14px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.daily-copy {
  min-width: 0;
  display: grid;
  gap: 3px;
  text-align: left;
}

.daily-copy strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 16px;
}

.daily-copy small {
  color: var(--text-muted);
  font-size: 12px;
}

.daily-play,
.card-play {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: rgba(255, 255, 255, 0.25);
}

.daily-play {
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  border-radius: 50%;
}

.pl-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 16px;
}

.playlist-card {
  overflow: hidden;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.card-cover {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  background-size: cover;
  background-position: center;
}

.card-play {
  position: absolute;
  right: 8px;
  bottom: 8px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
}

.card-meta {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
}

.card-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.card-info {
  color: var(--text-muted);
  font-size: 11px;
}

.sl-play-all {
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 12px;
  border-radius: 8px;
  background: var(--primary);
  color: #fff;
  font-size: 12px;
  font-weight: 500;
}

.toplist-entry {
  min-height: 76px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.toplist-entry span {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.toplist-entry small {
  color: var(--text-muted);
}

@media (max-width: 768px) {
  .pl-grid {
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 10px;
  }
}
</style>
