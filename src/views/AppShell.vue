<template>
  <div class="shell music-app">
    <section class="fm-main">
      <header class="fm-toolbar">
        <RouterLink to="/discover" class="fm-top-icon" :aria-label="zh.app.home"><House :size="19" /></RouterLink>
        <form class="fm-global-search" @submit.prevent="submitSearch">
          <Search :size="18" class="fm-search-icon" />
          <input
            v-model="keyword"
            :placeholder="zh.music.searchPlaceholder"
            :aria-label="zh.app.search"
            @focus="onFocus"
          />
          <button v-if="keyword" type="button" class="fm-search-clear" :aria-label="zh.common.close" @click="clearSearch">×</button>
        </form>
        <RouterLink to="/search" class="fm-top-icon" :aria-label="zh.app.search"><Search :size="19" /></RouterLink>
        <RouterLink to="/library" class="fm-top-icon" :aria-label="zh.music.playlists"><ListMusic :size="19" /></RouterLink>
        <RouterLink to="/settings" class="fm-top-icon" :aria-label="zh.app.settings"><Settings :size="19" /></RouterLink>
        <RouterLink to="/library" class="fm-top-icon" :aria-label="zh.app.library"><UserRound :size="19" /></RouterLink>
      </header>
      <main class="shell-main fm-content">
        <RouterView />
      </main>
    </section>
    <PlayerBar />
    <FullPlayer />
    <FullLyrics />
    <BottomSheet />
    <ActionSheet />
    <ToastStack />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { House, ListMusic, Search, Settings, UserRound } from "lucide-vue-next";
import { RouterView, useRoute, useRouter } from "vue-router";
import ActionSheet from "@/components/UI/ActionSheet.vue";
import BottomSheet from "@/components/UI/BottomSheet.vue";
import FullPlayer from "@/components/Player/FullPlayer.vue";
import FullLyrics from "@/components/Player/FullLyrics.vue";
import PlayerBar from "@/components/Player/PlayerBar.vue";
import ToastStack from "@/components/UI/ToastStack.vue";
import { zh } from "@/i18n/zh";
import { useMusicStore } from "@/stores/musicStore";

const route = useRoute();
const router = useRouter();
const music = useMusicStore();

const keyword = ref(music.searchKeyword);

// 顶部全局搜索框与搜索页关键词保持同步：在搜索页内联搜索后，header 也反映出来
watch(
  () => music.searchKeyword,
  (next) => { if (next !== keyword.value) keyword.value = next; },
);

function onFocus(): void {
  if (!route.path.startsWith("/search")) void router.push("/search");
}

async function submitSearch(): Promise<void> {
  const query = keyword.value.trim();
  if (!query) return;
  if (!route.path.startsWith("/search")) await router.push("/search");
  await music.runSearch(query, music.activeSearchType);
}

function clearSearch(): void {
  keyword.value = "";
}
</script>

<style scoped>
.music-app {
  /* override global .shell flex: sidebar is position:fixed (out of flow),
     so the content column must be a normal block that fills full width */
  display: block;
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
}

.fm-main {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  padding-bottom: calc(64px + var(--safe-bottom));
}

.fm-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: calc(8px + var(--safe-top)) 12px 8px;
}

.fm-top-icon {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.08);
  color: var(--text);
}

.fm-top-icon {
  width: 34px;
  flex: 0 0 34px;
}

.fm-top-icon.router-link-active {
  background: var(--primary);
  color: #fff;
}

.fm-global-search {
  flex: 1;
  min-width: 0;
  min-height: 36px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.08);
}

.fm-search-icon {
  flex: 0 0 auto;
  color: var(--text-muted);
}

.fm-global-search input {
  min-width: 0;
  flex: 1;
  border: 0;
  background: transparent;
  color: var(--text);
  outline: none;
  font-size: 13px;
}

.fm-search-clear {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.16);
  color: #98989d;
  line-height: 1;
}

.fm-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 16px 16px;
  -webkit-overflow-scrolling: touch;
}

@media (min-width: 769px) {
  .fm-main {
    padding-bottom: 84px;
  }

  .fm-toolbar {
    align-items: center;
  }

  .fm-global-search {
    max-width: none;
  }
}
</style>
