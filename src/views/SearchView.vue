<template>
  <div class="page">
    <section class="search-type-tabs" :aria-label="zh.app.search">
      <button v-for="tab in searchTabs" :key="tab.type" :class="{ active: tab.type === activeType }" @click="selectType(tab.type)">
        <component :is="tab.icon" :size="14" />
        {{ tab.label }}
      </button>
    </section>

    <section v-if="hasResultSummary" class="search-result-head">
      <div class="result-summary">
        <strong>{{ foundText }}</strong>
        <div class="source-tabs">
          <button :class="{ active: sourceFilter === 'all' }" @click="sourceFilter = 'all'">{{ zh.common.all }}</button>
          <button :class="{ active: sourceFilter === 'netease' }" @click="sourceFilter = 'netease'">N {{ sourceCounts.netease }}</button>
          <button :class="{ active: sourceFilter === 'kuwo' }" @click="sourceFilter = 'kuwo'">K {{ sourceCounts.kuwo }}</button>
        </div>
      </div>
      <div v-if="activeType === 'song'" class="play-all-row">
        <button class="sl-play-all" :disabled="!filteredSongs.length" @click="playAll"><Play :size="14" fill="currentColor" />{{ zh.music.playAll }}</button>
        <span>{{ totalText }}</span>
      </div>
    </section>

    <section v-if="hasSearchDetail" class="section search-detail">
      <div class="detail-head">
        <button class="icon-btn" :aria-label="zh.common.close" @click="music.clearSearchDetail()"><ChevronLeft :size="18" /></button>
        <div class="detail-title">
          <small>专辑</small>
          <h2 class="section-title ellipsis">{{ music.searchDetailTitle }}</h2>
        </div>
        <button class="sl-play-all" :disabled="!music.searchDetailSongs.length" @click="playAlbumSongs"><Play :size="14" fill="currentColor" />{{ zh.music.playAll }}</button>
      </div>
      <TrackList v-if="detailRows.length" :items="detailRows" compact />
      <p v-else class="muted empty">{{ music.searchDetailLoading ? '搜索中...' : zh.music.emptyPlaylist }}</p>
    </section>

    <section v-else-if="hasSongResults" class="section">
      <TrackList :items="songRows" compact />
    </section>

    <section v-else-if="activeType === 'playlist' && hasTypedResults" class="section result-grid playlist-results">
      <button v-for="item in filteredTypedResults" :key="item.id" class="search-card playlist-card" @click="openPlaylist(item)">
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

    <section v-else-if="activeType === 'album' && hasTypedResults" class="section result-grid album-results">
      <button v-for="item in filteredTypedResults" :key="item.id" class="search-card album-card" @click="openAlbum(item)">
        <span class="card-cover" :style="coverStyle(item)">
          <Disc3 v-if="!item.coverUrl" :size="25" />
        </span>
        <span class="card-copy">
          <strong class="ellipsis">{{ item.title }}</strong>
          <small class="ellipsis">{{ albumMeta(item) }}</small>
        </span>
      </button>
    </section>

    <section v-else-if="activeType === 'artist' && hasTypedResults" class="section artist-results">
      <button v-for="item in filteredTypedResults" :key="item.id" class="artist-card" @click="openArtist(item)">
        <span class="artist-avatar" :style="coverStyle(item)">
          <Mic2 v-if="!item.coverUrl" :size="24" />
        </span>
        <span class="artist-name ellipsis">{{ item.title }}</span>
        <span class="artist-meta ellipsis">{{ artistMeta(item) }}</span>
      </button>
    </section>

    <section v-else class="section">
      <div class="section-head">
        <h2 class="section-title">{{ zh.music.hotSearch }}</h2>
      </div>
      <ol class="hot-rank">
        <li v-for="(term, index) in visibleHotTerms" :key="term" class="hot-rank-item" @click="selectTerm(term)">
          <span class="hot-rank-no" :class="{ top: index < 3 }">{{ index + 1 }}</span>
          <span class="hot-rank-term ellipsis">{{ term }}</span>
        </li>
      </ol>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ChevronLeft, Disc3, ListMusic, Mic2, Music2, Play, StickyNote } from "lucide-vue-next";
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { zh } from "@/i18n/zh";
import TrackList from "@/components/Track/TrackList.vue";
import { useMusicStore } from "@/stores/musicStore";
import { usePlayerStore } from "@/stores/playerStore";
import { getSourceTag } from "@/providers/sourceMetadata";
import type { MusicSourceId, SearchListItem, SearchType } from "@/types/music";

type SourceFilter = "all" | Extract<MusicSourceId, "netease" | "kuwo">;

const router = useRouter();
const music = useMusicStore();
const player = usePlayerStore();
const keyword = ref(music.searchKeyword);
const activeType = ref<SearchType>(music.activeSearchType);
const sourceFilter = ref<SourceFilter>("all");
const searchTabs = [
  { type: "song" as const, label: "单曲", icon: Music2 },
  { type: "album" as const, label: "专辑", icon: Disc3 },
  { type: "artist" as const, label: "歌手", icon: Mic2 },
  { type: "playlist" as const, label: "歌单", icon: StickyNote },
];
const unitByType: Record<SearchType, string> = { song: "首歌曲", album: "张专辑", artist: "位歌手", playlist: "个歌单" };
const fallbackHotTerms = [zh.names.glass, zh.names.yinTian, zh.names.haiYuNi, zh.names.qingTian, zh.names.daoXiang];
const visibleHotTerms = computed(() => (music.hotTerms.length ? music.hotTerms : fallbackHotTerms));
const filteredSongs = computed(() => sourceFilter.value === "all" ? music.searchResults : music.searchResults.filter((song) => song.provider.source === sourceFilter.value));
const filteredTypedResults = computed(() => sourceFilter.value === "all" ? music.typedSearchResults : music.typedSearchResults.filter((item) => item.source === sourceFilter.value));
const songRows = computed(() => music.songRows(filteredSongs.value));
const detailRows = computed(() => music.songRows(music.searchDetailSongs));
const hasSearchDetail = computed(() => Boolean(music.searchDetailTitle));
const hasSongResults = computed(() => activeType.value === "song" && songRows.value.length > 0);
const hasTypedResults = computed(() => activeType.value !== "song" && filteredTypedResults.value.length > 0);
const hasResultSummary = computed(() => !hasSearchDetail.value && (hasSongResults.value || hasTypedResults.value));
const sourceCounts = computed(() => ({
  netease: activeType.value === "song" ? music.searchResults.filter((song) => song.provider.source === "netease").length : music.typedSearchResults.filter((item) => item.source === "netease").length,
  kuwo: activeType.value === "song" ? music.searchResults.filter((song) => song.provider.source === "kuwo").length : music.typedSearchResults.filter((item) => item.source === "kuwo").length,
}));
const visibleCount = computed(() => activeType.value === "song" ? songRows.value.length : filteredTypedResults.value.length);
const foundText = computed(() => `找到 ${visibleCount.value} ${unitByType[activeType.value]}`);
const totalText = computed(() => `共 ${visibleCount.value} 首`);

watch(() => music.activeSearchType, (type) => { activeType.value = type; });
watch(() => music.searchKeyword, (next) => { keyword.value = next; });

function selectType(type: SearchType): void {
  activeType.value = type;
  sourceFilter.value = "all";
  if (music.searchKeyword) void music.runSearch(music.searchKeyword, type);
}

function selectTerm(term: string): void {
  keyword.value = term;
  void music.runSearch(term, activeType.value);
}

async function playAll(): Promise<void> {
  if (filteredSongs.value.length) await player.playQueue(filteredSongs.value, 0);
}

async function playAlbumSongs(): Promise<void> {
  if (music.searchDetailSongs.length) await player.playQueue(music.searchDetailSongs, 0);
}

async function openAlbum(item: SearchListItem): Promise<void> {
  await music.openAlbumResult(item);
}

async function openArtist(item: SearchListItem): Promise<void> {
  const artist = item.title.trim();
  if (!artist) return;
  keyword.value = artist;
  activeType.value = "song";
  sourceFilter.value = "all";
  await music.runSearch(artist, "song");
}

function openPlaylist(item: SearchListItem): void {
  const id = rawField(item, "playlist_id") ?? rawField(item, "id") ?? item.id.split(":").pop() ?? item.id;
  void router.push({ path: `/playlist/${encodeURIComponent(id)}`, query: { source: item.source } });
}

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

onMounted(() => void music.loadSearchHome());
</script>

<style scoped>
.search-type-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  padding: 0 0 6px;
  scrollbar-width: none;
}

.search-type-tabs::-webkit-scrollbar {
  display: none;
}

.search-type-tabs button {
  min-height: 28px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border-radius: 8px;
  background: rgba(118, 118, 128, 0.18);
  border: 0.5px solid rgba(255, 255, 255, 0.08);
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.search-type-tabs button.active {
  background: #0a84ff;
  border-color: transparent;
  color: #fff;
  box-shadow: 0 5px 14px rgba(10, 132, 255, 0.26);
}

.source-tabs button.active {
  background: #0a84ff;
  color: #fff;
}

.search-result-head {
  display: grid;
  gap: 9px;
  padding: 4px 0 2px;
}

.result-summary,
.play-all-row,
.detail-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.result-summary strong {
  color: var(--text);
  font-size: 15px;
}

.source-tabs {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.08);
}

.source-tabs button {
  min-height: 25px;
  min-width: 42px;
  padding: 0 9px;
  border-radius: 7px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
}

.play-all-row {
  color: var(--text-muted);
  font-size: 13px;
}

.sl-play-all {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border-radius: 8px;
  background: #0a84ff;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
}

.sl-play-all:disabled {
  opacity: 0.45;
}

.detail-head {
  margin-bottom: 10px;
}

.detail-title {
  min-width: 0;
  flex: 1;
}

.detail-title small,
.card-copy small,
.artist-meta {
  color: var(--text-muted);
}

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

.hot-rank {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 2px;
}

.hot-rank-item {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 44px;
  padding: 0 6px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.hot-rank-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.hot-rank-no {
  width: 20px;
  text-align: center;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-muted);
}

.hot-rank-no.top {
  color: var(--primary);
}

.hot-rank-term {
  min-width: 0;
  font-size: 14px;
  color: var(--text);
}

.empty {
  padding: 28px 0;
  text-align: center;
}
</style>
