import { createRouter, createWebHistory } from "vue-router";
import AppShell from "@/views/AppShell.vue";

export default createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      component: AppShell,
      redirect: "/discover",
      children: [
        { path: "discover", component: () => import("@/views/DiscoverView.vue") },
        { path: "search", component: () => import("@/views/SearchView.vue") },
        { path: "local", component: () => import("@/views/LocalView.vue") },
        { path: "toplist", component: () => import("@/views/ToplistView.vue") },
        { path: "library", component: () => import("@/views/LibraryView.vue") },
        { path: "me", component: () => import("@/views/MeView.vue") },
        { path: "settings", component: () => import("@/views/SettingsView.vue") },
        { path: "playlist/:id", component: () => import("@/views/PlaylistDetailView.vue") },
      ],
    },
  ],
});
