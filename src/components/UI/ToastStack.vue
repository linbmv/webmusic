<template>
  <div class="toast-stack" aria-live="polite">
    <div v-for="item in ui.toasts" :key="item.id" class="toast">
      <span class="toast-msg ellipsis">{{ item.message }}</span>
      <button v-if="item.actionLabel" class="toast-action" @click="ui.runToastAction(item.id)">{{ item.actionLabel }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useUiStore } from "@/stores/uiStore";

const ui = useUiStore();
</script>

<style scoped>
.toast-stack {
  position: fixed;
  z-index: 1000;
  left: 50%;
  transform: translateX(-50%);
  width: min(420px, calc(100vw - 28px));
  bottom: calc(148px + var(--safe-bottom));
  display: grid;
  gap: 8px;
}

@media (min-width: 769px) {
  .toast-stack {
    /* 桌面端 mini 播放器位于 bottom:12px、左侧让出 220px 侧栏，
       toast 居于内容区上方、紧贴播放器之上 */
    left: calc(220px + (100vw - 220px) / 2);
    bottom: 92px;
  }
}

.toast {
  min-height: 46px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 14px;
  border-radius: var(--radius-sm);
  background: #f4f6ff;
  color: #121214;
  box-shadow: var(--shadow);
}

.toast-msg {
  min-width: 0;
}

.toast-action {
  flex: 0 0 auto;
  color: var(--primary);
  font-weight: 600;
}
</style>
