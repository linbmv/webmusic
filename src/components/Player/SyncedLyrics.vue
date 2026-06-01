<template>
  <section class="lyrics" :aria-label="zh.music.currentLyric">
    <p class="muted">{{ lines.previous?.text || zh.music.previousLyric }}</p>
    <strong class="active">{{ lines.current?.text || zh.music.currentLyric }}</strong>
    <p class="muted">{{ lines.next?.text || zh.music.nextLyric }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { zh } from "@/i18n/zh";
import { usePlayerStore } from "@/stores/playerStore";

const player = usePlayerStore();
const lines = computed(() => player.activeLyricLines);
</script>

<style scoped>
.lyrics {
  min-height: 112px;
  display: grid;
  place-items: center;
  gap: 10px;
  text-align: center;
}

.lyrics strong {
  font-size: 20px;
  transition: color 200ms ease, transform 200ms ease;
}

.lyrics strong.active {
  color: var(--primary);
  transform: scale(1.02);
}

.lyrics p {
  margin: 0;
}

.lyrics .muted {
  color: var(--text-muted);
  font-size: 14px;
}
</style>
