import { createRouter, createWebHistory } from "vue-router";
import AppShell from "@/views/AppShell.vue";
import DiscoverView from "@/views/DiscoverView.vue";
import LibraryView from "@/views/LibraryView.vue";
import LocalView from "@/views/LocalView.vue";
import PlaylistDetailView from "@/views/PlaylistDetailView.vue";
import SearchView from "@/views/SearchView.vue";
import SettingsView from "@/views/SettingsView.vue";
import ToplistView from "@/views/ToplistView.vue";

export default createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      component: AppShell,
      redirect: "/discover",
      children: [
        { path: "discover", component: DiscoverView },
        { path: "search", component: SearchView },
        { path: "local", component: LocalView },
        { path: "toplist", component: ToplistView },
        { path: "library", component: LibraryView },
        { path: "settings", component: SettingsView },
        { path: "playlist/:id", component: PlaylistDetailView },
      ],
    },
  ],
});
