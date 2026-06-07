<template>
  <nav class="bottom-nav" :class="{ hidden: ui.navHidden }" :aria-label="zh.app.mainNav">
    <RouterLink v-for="item in items" :key="item.to" :to="item.to" class="nav-tab">
      <component :is="item.icon" class="nav-icon" :size="22" />
      <span class="nav-label">{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>

<script setup lang="ts">
import { BarChart3, HardDrive, Home, Library, Settings } from "lucide-vue-next";
import { RouterLink } from "vue-router";
import { zh } from "@/i18n/zh";
import { useUiStore } from "@/stores/uiStore";

const ui = useUiStore();
const items = [
  { to: "/discover", label: zh.app.discover, icon: Home },
  { to: "/toplist", label: zh.app.toplist, icon: BarChart3 },
  { to: "/local", label: zh.app.local, icon: HardDrive },
  { to: "/library", label: zh.app.library, icon: Library },
  { to: "/settings", label: zh.app.settings, icon: Settings },
];
</script>

<style scoped>
.bottom-nav {
  position: fixed;
  z-index: 700;
  left: 0;
  right: 0;
  bottom: 0;
  height: calc(56px + var(--safe-bottom));
  padding: 4px 6px var(--safe-bottom);
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  background: var(--bg-elevated);
  border-top: 0.5px solid var(--bg-border);
  transition: transform 260ms cubic-bezier(0.32, 0.94, 0.6, 1);
}

/* 移动端：内容向下滚动时隐藏底部导航，腾出阅读空间 */
.bottom-nav.hidden {
  transform: translateY(100%);
}

.nav-tab {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 3px;
  min-width: 0;
  color: var(--text-muted);
  font-size: 10px;
  transition: color 150ms ease;
}

.nav-tab.router-link-active {
  color: var(--primary);
}

.nav-icon {
  flex: 0 0 auto;
}

.nav-label {
  white-space: nowrap;
}

@media (min-width: 769px) {
  .bottom-nav {
    top: 0;
    bottom: 0;
    right: auto;
    width: 220px;
    height: 100vh;
    height: 100dvh;
    padding: calc(20px + var(--safe-top)) 12px 20px;
    grid-template-columns: 1fr;
    grid-auto-rows: max-content;
    gap: 4px;
    align-content: start;
    border-top: 0;
    border-right: 0.5px solid var(--bg-border);
  }

  /* 桌面端侧栏常驻，不参与自动隐藏 */
  .bottom-nav.hidden {
    transform: none;
  }

  .nav-tab {
    grid-template-columns: 24px 1fr;
    place-items: center start;
    gap: 12px;
    min-height: 44px;
    padding: 0 12px;
    border-radius: var(--radius-sm);
    font-size: 14px;
  }

  .nav-tab.router-link-active {
    background: var(--primary-soft);
  }
}
</style>
