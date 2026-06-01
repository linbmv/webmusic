<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">{{ zh.app.settings }}</h1>
      </div>
    </header>

    <div class="settings-list">
      <div class="provider-row fm-setting">
        <span class="provider-label">
          {{ zh.music.activeProvider }}
          <button class="health-dot" :class="healthState" :aria-label="healthLabel" :title="healthLabel" @click="providerStore.checkActiveHealth()">
            <Check v-if="healthState === 'ok'" :size="13" />
            <X v-else-if="healthState === 'fail'" :size="13" />
          </button>
        </span>
        <select v-model="selectedProvider" @change="switchProvider">
          <option v-for="provider in providerStore.providers" :key="provider.id" :value="provider.id">{{ provider.displayName }}</option>
        </select>
      </div>

      <label class="provider-row fm-setting toggle-row">
        <span>{{ zh.music.darkTheme }}</span>
        <input type="checkbox" :checked="ui.darkTheme" @change="toggleDarkTheme" />
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Check, X } from "lucide-vue-next";
import { zh } from "@/i18n/zh";
import { useProviderStore } from "@/stores/providerStore";
import { useUiStore } from "@/stores/uiStore";
import type { ProviderId } from "@/types/music";

const providerStore = useProviderStore();
const ui = useUiStore();
const selectedProvider = ref(providerStore.config.activeProviderId);

const healthState = computed<"idle" | "ok" | "fail">(() => {
  if (providerStore.healthError) return "fail";
  if (!providerStore.activeHealth) return "idle";
  return providerStore.activeHealth.ok ? "ok" : "fail";
});
const healthLabel = computed(() => {
  if (providerStore.healthError) return providerStore.healthError;
  if (!providerStore.activeHealth) return "Provider health not checked";
  return providerStore.activeHealth.ok ? "Provider health OK" : providerStore.activeHealth.message ?? "Provider health failed";
});

watch(
  () => providerStore.config.activeProviderId,
  (providerId) => { selectedProvider.value = providerId; },
);

function switchProvider(): void {
  providerStore.switchProvider(selectedProvider.value as ProviderId);
}

function toggleDarkTheme(event: Event): void {
  ui.setDarkTheme((event.target as HTMLInputElement).checked);
}
</script>

<style scoped>
.settings-list {
  display: grid;
  gap: 8px;
}

.fm-setting {
  border-radius: 12px;
  background: var(--bg-layer);
  border: 1px solid var(--bg-border);
  padding: 12px 14px;
}

.provider-row {
  min-height: 58px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.provider-row span {
  color: var(--text-muted);
}

.provider-label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.health-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: inline-grid;
  place-items: center;
  color: rgba(235, 235, 245, 0.7);
  background: rgba(118, 118, 128, 0.24);
  border: 1px solid var(--bg-border);
  cursor: pointer;
}

.health-dot.ok {
  color: #fff;
  background: #30d158;
  border-color: transparent;
}

.health-dot.fail {
  color: #fff;
  background: var(--danger);
  border-color: transparent;
}

.provider-row select {
  min-height: 40px;
  border: 1px solid var(--bg-border);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  color: var(--text);
  padding: 0 32px 0 12px;
  font-size: 14px;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%23999' d='M1 1l5 5 5-5'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
}

.provider-row select option {
  background: var(--bg-elevated);
  color: var(--text);
}

.toggle-row {
  cursor: pointer;
}

.toggle-row input {
  width: 46px;
  height: 26px;
  margin: 0;
  appearance: none;
  border-radius: 999px;
  background: rgba(118, 118, 128, 0.32);
  border: 1px solid var(--bg-border);
  position: relative;
  cursor: pointer;
}

.toggle-row input::after {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  transition: transform 180ms ease;
}

.toggle-row input:checked {
  background: var(--primary);
}

.toggle-row input:checked::after {
  transform: translateX(20px);
}
</style>
