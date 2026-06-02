<template>
  <div class="shell music-app">
    <section class="fm-main">
      <header class="fm-toolbar">
        <RouterLink to="/discover" class="fm-top-icon" :aria-label="zh.app.home"><House /></RouterLink>
        <form class="fm-global-search" @submit.prevent="submitSearch">
          <Search class="fm-search-icon" />
          <input
            v-model="keyword"
            :placeholder="zh.music.searchPlaceholder"
            :aria-label="zh.app.search"
            @focus="onFocus"
          />
          <button v-if="keyword" type="button" class="fm-search-clear" :aria-label="zh.common.close" @click="clearSearch">
            <X />
          </button>
        </form>
        <RouterLink to="/library" class="fm-top-icon" :aria-label="zh.music.playlists"><ListMusic /></RouterLink>
        <RouterLink to="/settings" class="fm-top-icon" :aria-label="zh.app.settings"><Settings /></RouterLink>
        <RouterLink to="/me" class="fm-top-icon" :aria-label="zh.app.library"><UserRound /></RouterLink>
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
import { House, ListMusic, Search, Settings, UserRound, X } from "lucide-vue-next";
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

// Keep the global search input aligned with searches launched inside the search page.
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
  display: block;
  width: 100vw;
  height: 100vh;
  height: 100svh;
  height: 100dvh;
  overflow: hidden;
}

.fm-main {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  padding-bottom: calc(64px + var(--safe-bottom) + var(--browser-bottom-offset));
}

.fm-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: calc(6px + var(--safe-top)) 8px 6px;
}

.fm-top-icon {
  width: 32px;
  height: 32px;
  min-height: 32px;
  flex: 0 0 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text);
}

.fm-top-icon.router-link-active {
  background: var(--primary);
  color: #fff;
}

.fm-top-icon :deep(svg) {
  width: 18px;
  height: 18px;
}

.fm-global-search {
  flex: 1 1 auto;
  min-width: 0;
  height: 32px;
  min-height: 32px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.08);
}

.fm-search-icon {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  color: var(--text-muted);
}

.fm-global-search input {
  min-width: 0;
  height: 100%;
  flex: 1;
  border: 0;
  background: transparent;
  color: var(--text);
  outline: none;
  font-size: 13px;
}

.fm-search-clear {
  width: 20px;
  height: 20px;
  flex: 0 0 20px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.16);
  color: #98989d;
}

.fm-search-clear :deep(svg) {
  width: 13px;
  height: 13px;
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
    gap: 8px;
    padding: calc(8px + var(--safe-top)) 12px 8px;
  }

  .fm-top-icon {
    width: 34px;
    height: 34px;
    min-height: 34px;
    flex-basis: 34px;
  }

  .fm-global-search {
    height: 36px;
    min-height: 36px;
    gap: 8px;
    padding: 0 10px;
  }
}

@media (max-width: 390px) {
  .fm-toolbar {
    gap: 5px;
    padding-inline: 7px;
  }

  .fm-top-icon {
    width: 30px;
    height: 30px;
    min-height: 30px;
    flex-basis: 30px;
  }

  .fm-top-icon :deep(svg) {
    width: 17px;
    height: 17px;
  }

  .fm-global-search {
    height: 30px;
    min-height: 30px;
    gap: 5px;
    padding-inline: 7px;
  }
}

:global(html[data-ios-browser="true"]) .music-app {
  height: 100svh;
}
</style>
