<template>
  <aside class="full-player" :class="{ open: ui.playerOpen }" :aria-hidden="!ui.playerOpen">
    <header class="player-head">
      <button class="icon-btn" :aria-label="zh.common.close" @click="ui.closePlayer">
        <ChevronDown :size="20" />
      </button>
      <div>
        <strong>{{ title }}</strong>
        <small>{{ subtitle }}</small>
      </div>
      <button class="icon-btn" :aria-label="zh.common.more" @click="openActions">
        <MoreHorizontal :size="20" />
      </button>
    </header>

    <section class="album-stage">
      <div class="vinyl">
        <div class="album-cover" :style="coverStyle" />
      </div>
    </section>

    <SyncedLyrics />

    <section class="progress-row">
      <span>{{ currentLabel }}</span>
      <input
        type="range"
        min="0"
        :max="durationSeconds"
        :value="currentSeconds"
        :aria-label="zh.music.progress"
        :aria-valuenow="currentSeconds"
        :aria-valuemin="0"
        :aria-valuemax="durationSeconds"
        @input="onSeek"
      />
      <span>{{ durationLabel }}</span>
    </section>

    <section class="control-row" :aria-label="zh.music.controls">
      <button class="icon-btn mode-btn" :aria-label="modeLabel" :title="modeLabel" @click="player.cycleMode">
        <Repeat1 v-if="player.mode === 'single'" :size="18" />
        <Shuffle v-else-if="player.mode === 'shuffle'" :size="18" />
        <Repeat v-else :size="18" />
      </button>
      <button class="icon-btn" :aria-label="zh.music.previous" @click="player.previous"><SkipBack :size="18" /></button>
      <button class="play-btn" :aria-label="player.isPlaying ? zh.common.pause : zh.common.play" @click="player.togglePlay">
        <Pause v-if="player.isPlaying" :size="26" fill="currentColor" />
        <Play v-else :size="26" fill="currentColor" />
      </button>
      <button class="icon-btn" :aria-label="zh.music.next" @click="player.next"><SkipForward :size="18" /></button>
      <button class="icon-btn" :aria-label="zh.common.queue" @click="ui.openQueue"><ListMusic :size="18" /></button>
    </section>

    <footer class="player-foot">
      <button class="pill-btn">{{ zh.music.source }}: {{ sourceLabel }}</button>
      <button class="pill-btn" @click="cycleQuality">{{ zh.music.quality }}: {{ player.quality }}</button>
    </footer>
  </aside>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ChevronDown, ListMusic, MoreHorizontal, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from "lucide-vue-next";
import { zh } from "@/i18n/zh";
import SyncedLyrics from "@/components/Player/SyncedLyrics.vue";
import { formatTimeLabel } from "@/playback/timeLabel";
import { getSourceName } from "@/providers/sourceMetadata";
import { usePlayerStore } from "@/stores/playerStore";
import { useUiStore } from "@/stores/uiStore";

const ui = useUiStore();
const player = usePlayerStore();
const title = computed(() => player.currentSong?.name ?? zh.names.yinTianLive);
const subtitle = computed(() => player.currentSong?.artistText ?? zh.names.moWenWei);
const qualityOrder = ["128kmp3", "320kmp3", "flac"] as const;
const sourceLabel = computed(() => (player.currentSong ? getSourceName(player.currentSong.provider.source) : zh.names.netease));
const coverStyle = computed(() => {
  const cover = player.currentSong?.coverUrl ?? player.currentSong?.album?.coverUrl;
  return cover ? { backgroundImage: `url(${cover})`, backgroundSize: "cover", backgroundPosition: "center" } : {};
});
const currentSeconds = computed(() => Math.floor(player.currentTimeMs / 1000));
const durationSeconds = computed(() => Math.max(1, Math.floor(player.durationMs / 1000)));
const currentLabel = computed(() => formatTimeLabel(player.currentTimeMs));
const durationLabel = computed(() => formatTimeLabel(player.durationMs));
const modeLabel = computed(() => {
  if (player.mode === "single") return zh.music.modeSingle;
  if (player.mode === "shuffle") return zh.music.modeShuffle;
  return zh.music.modeList;
});

function onSeek(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  player.seek(value * 1000);
}

function cycleQuality(): void {
  const index = qualityOrder.indexOf(player.quality);
  const next = qualityOrder[(index + 1) % qualityOrder.length];
  void player.setQuality(next);
}

function openActions(): void {
  if (player.currentSong) ui.openAddToPlaylist(player.currentSong);
}

</script>

<style scoped>
.full-player {
  position: fixed;
  z-index: 870;
  inset: 0;
  display: grid;
  grid-template-rows: auto minmax(220px, 1fr) auto auto auto;
  gap: 18px;
  padding: calc(18px + var(--safe-top)) 18px calc(18px + var(--safe-bottom));
  background: #050507;
  transform: translateY(100%);
  transition: transform 320ms cubic-bezier(0.32, 0.94, 0.6, 1);
}

.full-player.open {
  transform: translateY(0);
}

.player-head,
.player-foot,
.progress-row,
.control-row {
  display: flex;
  align-items: center;
}

.player-head,
.player-foot {
  justify-content: space-between;
}

.player-head div {
  min-width: 0;
  text-align: center;
  display: grid;
  gap: 3px;
}

.player-head small,
.progress-row {
  color: var(--text-muted);
  font-size: 12px;
}

.album-stage {
  display: grid;
  place-items: center;
}

.vinyl {
  width: min(62vw, 260px);
  aspect-ratio: 1;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: radial-gradient(circle, #222 0 18%, #050506 19% 100%);
}

.album-cover {
  width: 58%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.progress-row {
  gap: 8px;
}

.progress-row input {
  flex: 1;
}

.control-row {
  justify-content: center;
  gap: 10px;
}

.control-row .mode-btn {
  color: var(--primary);
}

.play-btn {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #06100a;
  background: var(--primary);
}
</style>
