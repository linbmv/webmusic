import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "@/App.vue";
import router from "@/router";
import { useAccountStore } from "@/stores/accountStore";
import { useLibraryStore } from "@/stores/libraryStore";
import { usePlayerStore } from "@/stores/playerStore";
import "@/styles/variables.css";
import "@/styles/app.css";

const nav = window.navigator;
const standalone = window.matchMedia("(display-mode: standalone)").matches || Boolean((nav as Navigator & { standalone?: boolean }).standalone);
const isiOS = /iP(ad|hone|od)/.test(nav.userAgent);
if (isiOS && !standalone) document.documentElement.dataset.iosBrowser = "true";

const pinia = createPinia();
createApp(App).use(pinia).use(router).mount("#app");

// 启动时先把本地曲库读入内存，再触发账号同步：保证 favorite/歌单/最近播放在任意页面即时可用，
// 并让 IndexedDB 加载失败通过 loadError 暴露，而不是各视图各自静默加载导致空白
void bootstrap();

async function bootstrap(): Promise<void> {
  const library = useLibraryStore(pinia);
  try {
    await library.load();
  } catch (caught) {
    console.error("Library load failed", caught);
  }
  await usePlayerStore(pinia).restoreLastSession();
  void useAccountStore(pinia).loadMe().catch((caught) => {
    console.error("Account session load failed", caught);
  });
}
