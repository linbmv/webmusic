<template>
  <div class="page">
    <section class="music-carousel" aria-label="featured playlists">
      <button class="carousel-card is-prev" @click="playFirstRecent">
        <span class="carousel-cover alt-a" />
        <span class="carousel-copy">
          <strong>{{ zh.music.daily }}</strong>
          <small>{{ zh.names.yinTian }} · {{ zh.names.moWenWei }}</small>
        </span>
      </button>
      <button class="carousel-card is-active" @click="playFirstRecent">
        <span class="carousel-cover main" />
        <span class="carousel-copy">
          <strong>{{ zh.music.tonight }}</strong>
          <small>{{ music.activeProviderName }} · {{ zh.music.playDaily }}</small>
        </span>
        <span class="carousel-play"><Play :size="16" fill="currentColor" /></span>
      </button>
      <button class="carousel-card is-next" @click="playFirstRecent">
        <span class="carousel-cover alt-b" />
        <span class="carousel-copy">
          <strong>{{ zh.names.newSongs }}</strong>
          <small>{{ zh.music.recommendPlaylists }}</small>
        </span>
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
.music-carousel {
  position: relative;
  height: 218px;
  margin-bottom: 10px;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 6px;
  overflow: hidden;
}

.carousel-card {
  position: absolute;
  width: 320px;
  max-width: 78vw;
  height: 190px;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.32);
  background: #222;
  transition: transform 300ms ease, opacity 300ms ease;
}

.carousel-card.is-active {
  z-index: 3;
  transform: translateX(0) scale(1);
}

.carousel-card.is-prev {
  z-index: 1;
  opacity: 0.62;
  transform: translateX(-72%) scale(0.84);
}

.carousel-card.is-next {
  z-index: 1;
  opacity: 0.62;
  transform: translateX(72%) scale(0.84);
}

.carousel-cover {
  position: absolute;
  inset: 0;
}

.carousel-cover.main {
  background: #171920;
}

.carousel-cover.alt-a {
  background: #12141a;
}

.carousel-cover.alt-b {
  background: #1d2028;
}

.carousel-card::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 30%, rgba(0, 0, 0, 0.78));
}

.carousel-copy {
  position: absolute;
  z-index: 2;
  left: 16px;
  right: 54px;
  bottom: 14px;
  display: grid;
  gap: 3px;
  text-align: left;
}

.carousel-copy strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 16px;
}

.carousel-copy small {
  color: rgba(255, 255, 255, 0.86);
  font-size: 12px;
}

.carousel-play,
.card-play {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: rgba(255, 255, 255, 0.25);
}

.carousel-play {
  position: absolute;
  z-index: 2;
  right: 14px;
  bottom: 14px;
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
  .music-carousel {
    height: 188px;
  }

  .carousel-card {
    width: 250px;
    height: 150px;
  }

  .pl-grid {
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 10px;
  }
}
</style>
