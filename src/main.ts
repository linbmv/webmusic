import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "@/App.vue";
import router from "@/router";
import { useAccountStore } from "@/stores/accountStore";
import { useLibraryStore } from "@/stores/libraryStore";
import { usePlayerStore } from "@/stores/playerStore";
import { useProviderStore } from "@/stores/providerStore";
import { initMediaSession } from "@/playback/mediaSession";
import "@/styles/variables.css";
import "@/styles/app.css";

const nav = window.navigator;
const standalone = window.matchMedia("(display-mode: standalone)").matches || Boolean((nav as Navigator & { standalone?: boolean }).standalone);
const isiOS = /iP(ad|hone|od)/.test(nav.userAgent);
if (isiOS && !standalone) document.documentElement.dataset.iosBrowser = "true";

// iOS 后台播放关键：必须在应用启动时立即初始化 MediaSession
// 这会让 iOS 授予后台音频播放权限
initMediaSession();

const pinia = createPinia();
createApp(App).use(pinia).use(router).mount("#app");

// 启动时先把本地曲库读入内存,再触发账号同步:保证 favorite/歌单/最近播放在任意页面即时可用,
// 并让 IndexedDB 加载失败通过 loadError 暴露,而不是各视图各自静默加载导致空白
void bootstrap();

async function bootstrap(): Promise<void> {
  const library = useLibraryStore(pinia);
  const provider = useProviderStore(pinia);
  try {
    await library.load();
  } catch (caught) {
    console.error("Library load failed", caught);
  }
  await usePlayerStore(pinia).restoreLastSession();

  const account = useAccountStore(pinia);
  await account.loadMe().catch((caught) => {
    console.error("Account session load failed", caught);
  });

  // 如果未登录且当前 provider 需要认证,自动切换到 freeMusic
  const isAuthenticated = Boolean(account.user);
  const currentProvider = provider.config.activeProviderId;
  if (!provider.canAccessProvider(currentProvider, isAuthenticated)) {
    console.warn(`Provider "${currentProvider}" requires authentication, switching to freeMusic`);
    provider.switchProvider("freeMusic", isAuthenticated);
  }
}
