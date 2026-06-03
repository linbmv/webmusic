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

    <section class="section">
      <div class="section-head">
        <h2 class="section-title">{{ zh.music.localDownloads }}</h2>
        <span class="muted">{{ account.downloads.length }} {{ zh.common.songUnit }}</span>
      </div>
      <TrackList v-if="downloadRows.length" :items="downloadRows" />
      <section v-else class="local-empty">
        <Music2 :size="40" class="local-empty-icon" />
        <p class="muted">{{ account.user ? zh.music.localEmpty : zh.music.localDownloadsEmpty }}</p>
      </section>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { FolderSearch, Music2, Server } from "lucide-vue-next";
import { zh } from "@/i18n/zh";
import TrackList from "@/components/Track/TrackList.vue";
import { getSourceTag } from "@/providers/sourceMetadata";
import { useAccountStore } from "@/stores/accountStore";
import { useUiStore } from "@/stores/uiStore";
import type { ServerDownload } from "@/services/accountApi";
import type { NormalizedSong } from "@/types/music";
import type { TrackRowItem } from "@/types/ui";

const ui = useUiStore();
const account = useAccountStore();

// 服务端下载转为可播放行：streamUrl 注入 directUrl，引擎跳过 provider 解析直接播放本地已存音频
const downloadRows = computed<TrackRowItem[]>(() => account.downloads.map((item) => {
  const song = playableSong(item);
  return {
    id: item.id,
    name: song.name,
    artistText: song.artistText,
    source: getSourceTag(song.provider.source),
    cover: song.coverUrl ?? song.album?.coverUrl ?? "",
    song,
  };
}));

function playableSong(item: ServerDownload): NormalizedSong {
  return { ...item.song, directUrl: item.streamUrl };
}

function scanLocal(): void {
  ui.toast(zh.music.localEmpty);
}

function connectWebdav(): void {
  ui.toast(zh.music.localWebdav);
}

onMounted(() => { if (account.user) void account.refreshDownloads(); });
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
