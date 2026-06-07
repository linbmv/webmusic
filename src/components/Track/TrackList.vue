<template>
  <div ref="scrollContainer" class="track-list" @scroll="onScroll">
    <div :style="{ height: `${totalHeight}px`, position: 'relative' }">
      <TrackRow
        v-for="(item, index) in visibleItems"
        :key="item.id"
        :item="item"
        :compact="compact"
        :playlist-id="playlistId"
        :is-favorites="isFavorites"
        :style="{ position: 'absolute', top: `${item.offsetTop}px`, left: 0, right: 0 }"
        @play="playFromRow(item.originalIndex)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from "vue";
import TrackRow from "@/components/Track/TrackRow.vue";
import { usePlayerStore } from "@/stores/playerStore";
import type { TrackRowItem } from "@/types/ui";

const props = defineProps<{ items: TrackRowItem[]; compact?: boolean; playlistId?: string; isFavorites?: boolean }>();
const player = usePlayerStore();

const scrollContainer = ref<HTMLElement | null>(null);
const scrollTop = ref(0);
const containerHeight = ref(600);

const ROW_HEIGHT = 60;
const OVERSCAN = 5;

const totalHeight = computed(() => props.items.length * ROW_HEIGHT);

const visibleRange = computed(() => {
  const start = Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(containerHeight.value / ROW_HEIGHT);
  const end = Math.min(props.items.length, start + visibleCount + OVERSCAN * 2);
  return { start, end };
});

const visibleItems = computed(() => {
  const { start, end } = visibleRange.value;
  return props.items.slice(start, end).map((item, idx) => ({
    ...item,
    offsetTop: (start + idx) * ROW_HEIGHT,
    originalIndex: start + idx,
  }));
});

function onScroll(): void {
  if (scrollContainer.value) {
    scrollTop.value = scrollContainer.value.scrollTop;
  }
}

function updateContainerHeight(): void {
  if (scrollContainer.value) {
    containerHeight.value = scrollContainer.value.clientHeight;
  }
}

function playFromRow(rowIndex: number): void {
  const songs = props.items.map((item) => item.song).filter((song): song is NonNullable<typeof song> => Boolean(song));
  if (!songs.length) return;
  const cursor = props.items.slice(0, rowIndex).filter((item) => item.song).length;
  void player.playQueue(songs, cursor);
}

onMounted(() => {
  updateContainerHeight();
  window.addEventListener("resize", updateContainerHeight);
});

onUnmounted(() => {
  window.removeEventListener("resize", updateContainerHeight);
});

watch(() => props.items.length, () => {
  if (scrollContainer.value && scrollTop.value > totalHeight.value) {
    scrollTop.value = Math.max(0, totalHeight.value - containerHeight.value);
    scrollContainer.value.scrollTop = scrollTop.value;
  }
});
</script>

<style scoped>
.track-list {
  overflow-y: auto;
  overflow-x: hidden;
  height: 100%;
}
</style>
