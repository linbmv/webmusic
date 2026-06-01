<template>
  <div class="track-list">
    <TrackRow
      v-for="(item, index) in items"
      :key="item.id"
      :item="item"
      :compact="compact"
      :playlist-id="playlistId"
      :is-favorites="isFavorites"
      @play="playFromRow(index)"
    />
  </div>
</template>

<script setup lang="ts">
import TrackRow from "@/components/Track/TrackRow.vue";
import { usePlayerStore } from "@/stores/playerStore";
import type { TrackRowItem } from "@/types/ui";

const props = defineProps<{ items: TrackRowItem[]; compact?: boolean; playlistId?: string; isFavorites?: boolean }>();
const player = usePlayerStore();

function playFromRow(rowIndex: number): void {
  const songs = props.items.map((item) => item.song).filter((song): song is NonNullable<typeof song> => Boolean(song));
  if (!songs.length) return;
  const cursor = props.items.slice(0, rowIndex).filter((item) => item.song).length;
  void player.playQueue(songs, cursor);
}
</script>

<style scoped>
.track-list {
  display: grid;
  gap: 6px;
}
</style>
