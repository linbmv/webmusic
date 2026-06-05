<template>
  <section v-if="type === 'playlist'" class="section result-grid playlist-results">
    <button v-for="item in items" :key="item.id" class="search-card playlist-card" @click="emit('openPlaylist', item)">
      <span class="card-cover" :style="coverStyle(item)">
        <ListMusic v-if="!item.coverUrl" :size="24" />
      </span>
      <span class="card-copy">
        <strong class="ellipsis">{{ item.title }}</strong>
        <small class="ellipsis">{{ playlistMeta(item) }}</small>
      </span>
      <span class="source-tag">{{ sourceLabel(item.source) }}</span>
    </button>
  </section>

  <section v-else-if="type === 'album'" class="section result-grid album-results">
    <button v-for="item in items" :key="item.id" class="search-card album-card" @click="emit('openAlbum', item)">
      <span class="card-cover" :style="coverStyle(item)">
        <Disc3 v-if="!item.coverUrl" :size="25" />
      </span>
      <span class="card-copy">
        <strong class="ellipsis">{{ item.title }}</strong>
        <small class="ellipsis">{{ albumMeta(item) }}</small>
      </span>
    </button>
  </section>

  <section v-else-if="type === 'artist'" class="section artist-results">
    <button v-for="item in items" :key="item.id" class="artist-card" @click="emit('openArtist', item)">
      <span class="artist-avatar" :style="coverStyle(item)">
        <Mic2 v-if="!item.coverUrl" :size="24" />
      </span>
      <span class="artist-name ellipsis">{{ item.title }}</span>
      <span class="artist-meta ellipsis">{{ artistMeta(item) }}</span>
    </button>
  </section>
</template>

<script setup lang="ts">
import { Disc3, ListMusic, Mic2 } from "lucide-vue-next";
import { getSourceTag } from "@/providers/sourceMetadata";
import type { MusicSourceId, SearchListItem, SearchType } from "@/types/music";

defineProps<{ type: SearchType; items: SearchListItem[] }>();
const emit = defineEmits<{
  openAlbum: [item: SearchListItem];
  openArtist: [item: SearchListItem];
  openPlaylist: [item: SearchListItem];
}>();

function coverStyle(item: SearchListItem): Record<string, string> | undefined {
  return item.coverUrl ? { backgroundImage: `url(${item.coverUrl})` } : undefined;
}

function albumMeta(item: SearchListItem): string {
  return [rawField(item, "artist"), countText(rawField(item, "musiccnt")), rawField(item, "pub")].filter(Boolean).join(" · ") || item.subtitle || sourceLabel(item.source);
}

function artistMeta(item: SearchListItem): string {
  return countText(rawField(item, "songnum")) || item.subtitle || sourceLabel(item.source);
}

function playlistMeta(item: SearchListItem): string {
  return [rawField(item, "creator"), countText(rawField(item, "track_count")), playCountText(rawField(item, "play_count"))].filter(Boolean).join(" · ") || item.subtitle || sourceLabel(item.source);
}

function countText(value?: string): string | undefined {
  return value ? `${value} 首` : undefined;
}

function playCountText(value?: string): string | undefined {
  return value ? `${Number(value).toLocaleString("zh-CN")} 播放` : undefined;
}

function rawField(item: SearchListItem, key: string): string | undefined {
  if (typeof item.raw !== "object" || item.raw === null || Array.isArray(item.raw)) return undefined;
  const value = (item.raw as Record<string, unknown>)[key];
  if (typeof value === "number") return String(value);
  return typeof value === "string" && value.trim() ? value.replace(/&nbsp;/g, " ").trim() : undefined;
}

function sourceLabel(source: MusicSourceId): string {
  return getSourceTag(source);
}
</script>

<style scoped>
.result-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: 10px;
}

.search-card,
.artist-card {
  position: relative;
  min-width: 0;
  border-radius: var(--radius-sm);
  background: var(--bg-layer);
  color: var(--text);
  text-align: left;
}

.search-card {
  display: grid;
  gap: 8px;
  padding: 10px;
}

.card-cover {
  aspect-ratio: 1;
  width: 100%;
  display: grid;
  place-items: center;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  background-size: cover;
  background-position: center;
  color: var(--text-muted);
}

.card-copy {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.card-copy small,
.artist-meta {
  color: var(--text-muted);
}

.source-tag {
  position: absolute;
  top: 8px;
  right: 8px;
}

.artist-results {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
  gap: 10px;
}

.artist-card {
  min-height: 128px;
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 7px;
  padding: 12px 10px;
  text-align: center;
}

.artist-avatar {
  width: 58px;
  height: 58px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  background-size: cover;
  background-position: center;
  color: var(--text-muted);
}

.artist-name {
  max-width: 100%;
  font-weight: 800;
}

.artist-meta {
  max-width: 100%;
  font-size: 12px;
}
</style>
