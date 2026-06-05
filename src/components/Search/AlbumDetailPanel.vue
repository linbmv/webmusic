<template>
  <section class="section search-detail">
    <div class="detail-head">
      <button class="icon-btn" :aria-label="zh.common.close" @click="emit('close')">
        <ChevronLeft :size="18" />
      </button>
      <div class="detail-title">
        <small>专辑</small>
        <h2 class="section-title ellipsis">{{ title }}</h2>
      </div>
      <div class="detail-actions">
        <button class="sl-action primary" :disabled="!songs.length" @click="playAll">
          <Play :size="14" fill="currentColor" />{{ zh.music.playAll }}
        </button>
        <button class="sl-action secondary" :disabled="!songs.length" @click="addAllToPlaylist">
          <Plus :size="14" />{{ zh.music.addToPlaylist }}
        </button>
      </div>
    </div>
    <TrackList v-if="rows.length" :items="rows" compact />
    <p v-else class="muted empty">{{ loading ? "搜索中..." : zh.music.emptyPlaylist }}</p>
  </section>
</template>

<script setup lang="ts">
import { ChevronLeft, Play, Plus } from "lucide-vue-next";
import { computed } from "vue";
import { zh } from "@/i18n/zh";
import { getSourceTag } from "@/providers/sourceMetadata";
import { usePlayerStore } from "@/stores/playerStore";
import { useUiStore } from "@/stores/uiStore";
import TrackList from "@/components/Track/TrackList.vue";
import type { NormalizedSong } from "@/types/music";
import type { TrackRowItem } from "@/types/ui";

const props = defineProps<{ title: string; songs: NormalizedSong[]; loading: boolean }>();
const emit = defineEmits<{ close: [] }>();

const player = usePlayerStore();
const ui = useUiStore();
const rows = computed<TrackRowItem[]>(() => props.songs.map((song, index) => ({
  id: song.stableId,
  name: song.name,
  artistText: song.artistText,
  source: getSourceTag(song.provider.source),
  cover: song.coverUrl ?? song.album?.coverUrl ?? "",
  position: index + 1,
  song,
})));

async function playAll(): Promise<void> {
  if (props.songs.length) await player.playQueue(props.songs, 0);
}

function addAllToPlaylist(): void {
  if (props.songs.length) ui.openAddTracksToPlaylist(props.songs, props.title);
}
</script>

<style scoped>
.detail-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.detail-title {
  min-width: 0;
  flex: 1;
}

.detail-title small {
  color: var(--text-muted);
}

.detail-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.sl-action {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}

.sl-action.primary {
  background: #0a84ff;
  color: #fff;
}

.sl-action.secondary {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text);
}

.sl-action:disabled {
  opacity: 0.45;
}

.empty {
  padding: 28px 0;
  text-align: center;
}
</style>
