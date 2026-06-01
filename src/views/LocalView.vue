<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">{{ zh.app.local }}</h1>
        <p class="page-subtitle">{{ zh.music.localSubtitle }}</p>
      </div>
    </header>

    <section class="grid-2 section">
      <button class="local-action" @click="scanLocal">
        <FolderSearch :size="22" />
        <span>{{ zh.music.localScan }}</span>
      </button>
      <button class="local-action" @click="connectWebdav">
        <Server :size="22" />
        <span>{{ zh.music.localWebdav }}</span>
      </button>
    </section>

    <section v-if="localTracks.length" class="section">
      <TrackList :items="localTracks" />
    </section>
    <section v-else class="section local-empty">
      <Music2 :size="40" class="local-empty-icon" />
      <p class="muted">{{ zh.music.localEmpty }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { FolderSearch, Music2, Server } from "lucide-vue-next";
import { zh } from "@/i18n/zh";
import TrackList from "@/components/Track/TrackList.vue";
import { useUiStore } from "@/stores/uiStore";
import type { TrackRowItem } from "@/types/ui";

const ui = useUiStore();

// 本地曲库数据层尚未接入，先以空列表占位，扫描/WebDAV 仅提示
const localTracks = computed<TrackRowItem[]>(() => []);

function scanLocal(): void {
  ui.toast(zh.music.localEmpty);
}

function connectWebdav(): void {
  ui.toast(zh.music.localWebdav);
}
</script>

<style scoped>
.local-action {
  min-height: 96px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.06);
  color: var(--text);
}

.local-empty {
  display: grid;
  place-items: center;
  gap: 12px;
  padding: 48px 0;
  text-align: center;
}

.local-empty-icon {
  color: var(--text-muted);
}
</style>
