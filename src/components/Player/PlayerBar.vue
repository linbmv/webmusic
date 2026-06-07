<template>
  <section class="player-bar" role="button" tabindex="0" @click="onBarClick" @dblclick="onBarDoubleClick" @keydown.enter="ui.openPlayer">
    <div class="bar-cover" :style="coverStyle" />
    <div class="bar-copy">
      <strong class="ellipsis">{{ currentTitle }}</strong>
      <small class="ellipsis">{{ currentSubtitle }}</small>
    </div>
    <input
      class="bar-progress"
      type="range"
      min="0"
      :max="durationSeconds"
      :value="currentSeconds"
      :style="progressStyle"
      :aria-label="zh.music.progress"
      :aria-valuenow="currentSeconds"
      :aria-valuemin="0"
      :aria-valuemax="durationSeconds"
      @pointerdown.stop
      @click.stop
      @dblclick.stop
      @input="onSeek"
    />
    <span class="bar-time" aria-live="off">{{ timeLabel }}</span>
    <div class="bar-controls">
      <button class="icon-btn" :aria-label="zh.music.previous" @click.stop="player.previous">
        <SkipBack :size="18" />
      </button>
      <button class="play-btn" :aria-label="player.isPlaying ? zh.common.pause : zh.common.play" @click.stop="player.togglePlay">
        <Pause v-if="player.isPlaying" :size="20" fill="currentColor" />
        <Play v-else :size="20" fill="currentColor" />
      </button>
      <button class="icon-btn" :aria-label="zh.music.next" @click.stop="player.next">
        <SkipForward :size="18" />
      </button>
      <button class="lyric-btn" :class="{ active: ui.lyricsOpen }" :aria-label="zh.music.lyric" :aria-pressed="ui.lyricsOpen" @click.stop="ui.toggleLyrics">
        {{ zh.music.lyricShort }}
      </button>
      <button class="icon-btn mode-btn" :aria-label="modeLabel" :title="modeLabel" @click.stop="player.cycleMode">
        <Repeat1 v-if="player.mode === 'single'" :size="18" />
        <Shuffle v-else-if="player.mode === 'shuffle'" :size="18" />
        <Repeat v-else :size="18" />
      </button>
      <button class="icon-btn" :aria-label="zh.common.queue" @click.stop="ui.openQueue">
        <ListMusic :size="18" />
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ListMusic, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from "lucide-vue-next";
import { zh } from "@/i18n/zh";
import { formatTimeLabel } from "@/playback/timeLabel";
import { usePlayerStore } from "@/stores/playerStore";
import { useUiStore } from "@/stores/uiStore";

const player = usePlayerStore();
const ui = useUiStore();
const currentTitle = computed(() => player.currentSong?.name ?? zh.names.yinTianLive);
const currentSubtitle = computed(() => player.currentSong?.artistText ?? `${zh.names.moWenWei} - ${zh.names.netease}`);
const progressPercent = computed(() => `${Math.round(player.progress * 100)}%`);
const currentSeconds = computed(() => Math.floor(player.currentTimeMs / 1000));
const durationSeconds = computed(() => Math.max(1, Math.floor(player.durationMs / 1000)));
const timeLabel = computed(() => `${formatTimeLabel(player.currentTimeMs)} / ${formatTimeLabel(player.durationMs)}`);
const progressStyle = computed(() => ({
  background: `linear-gradient(to right, rgba(235, 235, 245, 0.72) ${progressPercent.value}, rgba(255, 255, 255, 0.16) ${progressPercent.value})`,
}));
const modeLabel = computed(() => {
  if (player.mode === "single") return zh.music.modeSingle;
  if (player.mode === "shuffle") return zh.music.modeShuffle;
  return zh.music.modeList;
});
const coverStyle = computed(() => {
  const cover = player.currentSong?.coverUrl ?? player.currentSong?.album?.coverUrl;
  return cover ? { backgroundImage: `url(${cover})`, backgroundSize: "cover", backgroundPosition: "center" } : {};
});

function onBarClick(): void {
  if (isDesktopPointer()) return;
  ui.openPlayer();
}

function onBarDoubleClick(): void {
  if (isDesktopPointer()) ui.openPlayer();
}

function onSeek(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  player.seek(value * 1000);
}

function isDesktopPointer(): boolean {
  return window.matchMedia("(min-width: 769px) and (pointer: fine)").matches;
}
</script>

<style scoped>
.player-bar {
  position: fixed;
  z-index: 860;
  left: 8px;
  right: 8px;
  bottom: calc(var(--safe-bottom) + var(--browser-bottom-offset) + 8px);
  min-height: 56px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 14px;
  background: var(--bg-elevated);
  border: 0.5px solid var(--bg-border);
}

.bar-cover {
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.bar-copy {
  display: none;
  min-width: 0;
  flex: 1;
  gap: 3px;
}

.bar-copy small {
  color: var(--text-muted);
}

.bar-progress,
.bar-time {
  display: none;
}

.bar-controls {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 3px;
  min-width: 0;
}

.bar-controls .icon-btn {
  width: 36px;
  height: 36px;
  min-height: 36px;
  border-radius: 10px;
}

.play-btn {
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  background: var(--primary);
}

.lyric-btn {
  min-width: 34px;
  height: 32px;
  padding: 0 5px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  background: transparent;
}

.lyric-btn.active {
  color: #fff;
  background: var(--primary);
}

.mode-btn {
  color: var(--text-muted);
}

@media (min-width: 769px) {
  .player-bar {
    left: 16px;
    right: 16px;
    bottom: 12px;
    min-height: 64px;
    gap: 12px;
    padding: 7px 12px;
    border-radius: var(--radius-md);
  }

  .bar-cover {
    width: 42px;
    height: 42px;
  }

  .bar-copy {
    display: grid;
  }

  .bar-progress {
    display: block;
    width: min(22vw, 280px);
    height: 4px;
    border-radius: 999px;
    appearance: none;
    outline: none;
    cursor: pointer;
  }

  .bar-time {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    min-width: 78px;
    color: var(--text-muted);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .bar-controls {
    flex: 0 0 auto;
    justify-content: flex-start;
    gap: 6px;
  }

  .bar-controls .icon-btn {
    width: 40px;
    height: 40px;
    min-height: 40px;
  }

  .play-btn {
    width: 38px;
    height: 38px;
  }

  .lyric-btn {
    min-width: 38px;
    height: 32px;
    padding: 0 8px;
    font-size: 12px;
  }
}

@media (max-width: 360px) {
  .player-bar {
    left: 6px;
    right: 6px;
    gap: 6px;
    padding-inline: 8px;
  }

  .bar-cover {
    width: 34px;
    height: 34px;
  }

  .bar-controls .icon-btn {
    width: 34px;
    height: 34px;
    min-height: 34px;
  }

  .play-btn {
    width: 38px;
    height: 38px;
  }

  .lyric-btn {
    min-width: 32px;
  }
}

.bar-progress::-webkit-slider-thumb,
.bar-progress::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
}

.bar-progress::-webkit-slider-thumb {
  appearance: none;
}

.bar-progress::-moz-range-thumb {
  border: 0;
}
</style>
