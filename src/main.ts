import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "@/App.vue";
import router from "@/router";
import { useAccountStore } from "@/stores/accountStore";
import "@/styles/variables.css";
import "@/styles/app.css";

const nav = window.navigator;
const standalone = window.matchMedia("(display-mode: standalone)").matches || Boolean((nav as Navigator & { standalone?: boolean }).standalone);
const isiOS = /iP(ad|hone|od)/.test(nav.userAgent);
if (isiOS && !standalone) document.documentElement.dataset.iosBrowser = "true";

const pinia = createPinia();
createApp(App).use(pinia).use(router).mount("#app");
void useAccountStore(pinia).loadMe();
