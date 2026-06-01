<template>
  <aside class="full-lyrics" :class="{ open: ui.lyricsOpen }" :aria-hidden="!ui.lyricsOpen" @click="ui.closeLyrics">
    <header class="lyrics-head" @click.stop>
      <div class="lyrics-meta">
        <strong class="ellipsis">{{ title }}</strong>
        <small class="ellipsis">{{ subtitle }}</small>
      </div>
      <button class="icon-btn" :aria-label="zh.common.close" @click="ui.closeLyrics">
        <ChevronDown :size="22" />
      </button>
    </header>

    <div ref="scroller" class="lyrics-scroll" @click.stop>
      <p v-if="!lines.length" class="lyrics-empty">{{ zh.music.noLyric }}</p>
      <p
        v-for="(line, index) in lines"
        :key="index"
        :ref="(el) => setLineRef(el, index)"
        class="lyrics-line"
        :class="{ active: index === activeIndex }"
        @click="seekToLine(line)"
      >
        {{ line.text || "♪" }}
      </p>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch, type ComponentPublicInstance } from "vue";
import { ChevronDown } from "lucide-vue-next";
import { zh } from "@/i18n/zh";
import { usePlayerStore } from "@/stores/playerStore";
import { useUiStore } from "@/stores/uiStore";
import type { LyricLine } from "@/types/music";

const ui = useUiStore();
const player = usePlayerStore();

const scroller = ref<HTMLElement | null>(null);
const lineEls = ref<(HTMLElement | null)[]>([]);

const title = computed(() => player.currentSong?.name ?? zh.names.yinTianLive);
const subtitle = computed(() => player.currentSong?.artistText ?? zh.names.moWenWei);
const lines = computed<LyricLine[]>(() => player.lyric?.lines ?? []);
const activeIndex = computed(() => player.activeLineIndex);

function setLineRef(el: Element | ComponentPublicInstance | null, index: number): void {
  lineEls.value[index] = (el as HTMLElement | null) ?? null;
}

function seekToLine(line: LyricLine): void {
  player.seek(line.startMs);
}

watch(activeIndex, async (index) => {
  if (!ui.lyricsOpen || index < 0) return;
  await nextTick();
  const target = lineEls.value[index];
  const container = scroller.value;
  if (!target || !container) return;
  const offset = target.offsetTop - container.clientHeight / 2 + target.clientHeight / 2;
  container.scrollTo({ top: offset, behavior: "smooth" });
});

watch(
  () => ui.lyricsOpen,
  async (open) => {
    if (!open) return;
    await nextTick();
    const target = lineEls.value[activeIndex.value];
    const container = scroller.value;
    if (!target || !container) return;
    container.scrollTop = target.offsetTop - container.clientHeight / 2 + target.clientHeight / 2;
  },
);
</script>

<style scoped>
.full-lyrics {
  position: fixed;
  z-index: 850;
  inset: 0;
  display: grid;
  grid-template-rows: auto 1fr;
  padding: calc(18px + var(--safe-top)) 18px calc(18px + var(--safe-bottom));
  background: #050507;
  transform: translateY(100%);
  transition: transform 320ms cubic-bezier(0.32, 0.94, 0.6, 1);
}

.full-lyrics.open {
  transform: translateY(0);
}

.lyrics-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 14px;
}

.lyrics-meta {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.lyrics-meta small {
  color: var(--text-muted);
  font-size: 12px;
}

.lyrics-scroll {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  display: grid;
  gap: 18px;
  padding: 40vh 0;
  text-align: center;
  scrollbar-width: none;
}

.lyrics-scroll::-webkit-scrollbar {
  display: none;
}

.lyrics-line {
  margin: 0;
  font-size: 17px;
  line-height: 1.5;
  color: var(--text-muted);
  cursor: pointer;
  transition: color 200ms ease, transform 200ms ease, font-weight 200ms ease;
}

.lyrics-line.active {
  color: var(--text);
  font-size: 21px;
  font-weight: 700;
  transform: scale(1.02);
}

.lyrics-empty {
  margin: 0;
  text-align: center;
  color: var(--text-muted);
}
</style>
