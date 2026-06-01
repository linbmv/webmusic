<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">{{ zh.app.toplist }}</h1>
        <p class="page-subtitle">{{ zh.music.toplistSubtitle }}</p>
      </div>
    </header>

    <section class="section">
      <article class="toplist-hero">
        <span class="muted">{{ primaryToplist.name }}</span>
        <div class="toplist-top3">
          <p v-for="(track, index) in primaryTracks" :key="`${track.first}-${index}`">{{ index + 1 }}. {{ track.first }} - {{ track.second }}</p>
        </div>
      </article>
    </section>

    <section class="section">
      <div class="section-head">
        <h2 class="section-title">{{ zh.music.kuwoToplists }}</h2>
      </div>
      <div class="grid-2">
        <button v-for="item in visibleRanks" :key="item" class="rank-card card card-pad">{{ item }}</button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { zh } from "@/i18n/zh";
import { useMusicStore } from "@/stores/musicStore";

const music = useMusicStore();
const fallbackRanks = [zh.names.kuwoHot, zh.names.kuwoNew, zh.names.chineseRank, zh.names.westernRank];
const primaryToplist = computed(() => music.toplists[0] ?? { name: zh.music.neteaseRising, tracks: fallbackTracks });
const primaryTracks = computed(() => primaryToplist.value.tracks.length ? primaryToplist.value.tracks.slice(0, 3) : fallbackTracks);
const visibleRanks = computed(() => music.toplists.length ? music.toplists.map((item) => item.name) : fallbackRanks);
const fallbackTracks = [
  { first: zh.names.yinTian, second: zh.names.moWenWei },
  { first: zh.names.glass, second: zh.names.haiYuNi },
  { first: zh.names.qingTian, second: zh.names.jay },
];

onMounted(() => void music.loadToplists());
</script>

<style scoped>
.toplist-hero {
  min-height: 188px;
  display: grid;
  gap: 10px;
  padding: 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.28);
}

.toplist-top3 {
  display: grid;
  gap: 8px;
}

.rank-card {
  text-align: left;
  min-height: 92px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
}
</style>
