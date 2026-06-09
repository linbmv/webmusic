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
  background: linear-gradient(180deg,
    rgba(10, 10, 15, 0.98) 0%,
    rgba(26, 26, 46, 0.96) 50%,
    rgba(22, 33, 62, 0.95) 100%);
  backdrop-filter: blur(40px);
  -webkit-backdrop-filter: blur(40px);
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

.player-head {
  background: var(--glass-bg);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  padding: 8px;
  box-shadow: var(--shadow-md);
}

.player-head div {
  min-width: 0;
  text-align: center;
  display: grid;
  gap: 3px;
}

.player-head strong {
  font-weight: 600;
  font-size: 15px;
}

.player-head small,
.progress-row {
  color: var(--text-muted);
  font-size: 12px;
}

.album-stage {
  display: grid;
  place-items: center;
  position: relative;
}

.vinyl {
  width: min(62vw, 280px);
  aspect-ratio: 1;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: radial-gradient(circle,
    rgba(102, 126, 234, 0.15) 0%,
    rgba(34, 34, 34, 0.4) 18%,
    rgba(5, 5, 6, 0.8) 19% 100%);
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.5),
    0 0 80px rgba(102, 126, 234, 0.2),
    inset 0 0 40px rgba(102, 126, 234, 0.1);
  border: 2px solid var(--glass-border);
  position: relative;
  animation: float 6s ease-in-out infinite;
}

@keyframes float {
  0%, 100% {
    transform: translateY(0) rotate(0deg);
  }
  50% {
    transform: translateY(-10px) rotate(5deg);
  }
}

.album-cover {
  width: 58%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: linear-gradient(135deg,
    rgba(102, 126, 234, 0.3),
    rgba(118, 75, 162, 0.3));
  border: 2px solid var(--glass-border);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.4),
    inset 0 2px 8px rgba(255, 255, 255, 0.1);
  position: relative;
  overflow: hidden;
}

/* Vinyl spinning animation when playing */
.full-player.open .vinyl {
  animation: float 6s ease-in-out infinite, spin 20s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.progress-row {
  gap: 8px;
  background: var(--glass-bg);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  padding: 12px 16px;
  box-shadow: var(--shadow-md);
}

.progress-row input {
  flex: 1;
  height: 6px;
  border-radius: 999px;
  appearance: none;
  outline: none;
  cursor: pointer;
  background: linear-gradient(to right,
    var(--primary) 0%,
    var(--secondary) 50%,
    rgba(255, 255, 255, 0.2) 50%);
  transition: height var(--transition-fast);
}

.progress-row input:hover {
  height: 8px;
}

.progress-row input::-webkit-slider-thumb {
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary), var(--accent));
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.6);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.progress-row input:hover::-webkit-slider-thumb {
  width: 20px;
  height: 20px;
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.8);
}

.progress-row input::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary), var(--accent));
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.6);
  border: none;
  cursor: pointer;
}

.control-row {
  justify-content: center;
  gap: 10px;
  background: var(--glass-bg);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  padding: 16px;
  box-shadow: var(--shadow-md);
}

.control-row .icon-btn {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--glass-bg);
  border: 1px solid transparent;
  transition: all var(--transition-fast);
}

.control-row .icon-btn:hover {
  background: var(--glass-hover);
  border-color: var(--glass-border);
  transform: scale(1.1);
}

.control-row .icon-btn:active {
  transform: scale(1.05);
}

.control-row .mode-btn {
  color: var(--primary);
}

.play-btn {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  background: linear-gradient(135deg, var(--primary), var(--secondary));
  box-shadow: 0 8px 24px var(--primary-glow), var(--glow);
  transition: all var(--transition-fast);
}

.play-btn:hover {
  transform: scale(1.12);
  box-shadow: 0 12px 32px var(--primary-glow), var(--glow);
}

.play-btn:active {
  transform: scale(1.05);
}

.player-foot {
  gap: 12px;
  justify-content: center;
}

.pill-btn {
  padding: 8px 16px;
  border-radius: 999px;
  background: var(--glass-bg);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--glass-border);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  transition: all var(--transition-fast);
}

.pill-btn:hover {
  background: var(--glass-hover);
  color: var(--text);
  border-color: var(--primary);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.pill-btn:active {
  transform: translateY(0);
}
</style>
