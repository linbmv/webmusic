<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">{{ zh.app.settings }}</h1>
        <p class="page-subtitle">{{ zh.music.settingsSubtitle }}</p>
      </div>
    </header>

    <div class="track-list">
      <SettingRow :label="zh.music.defaultQuality" value="320kmp3" />
      <SettingRow :label="zh.music.wordLyric" :value="zh.common.enabled" />
      <div class="provider-row fm-setting">
        <span>{{ zh.music.activeProvider }}</span>
        <select v-model="selectedProvider" @change="switchProvider">
          <option v-for="provider in providerStore.providers" :key="provider.id" :value="provider.id">{{ provider.displayName }}</option>
        </select>
      </div>
      <div class="provider-stack fm-setting">
        <span>Fallback</span>
        <strong>{{ fallbackText }}</strong>
      </div>
      <div class="provider-row fm-setting">
        <span>{{ healthText }}</span>
        <button class="secondary-btn" @click="providerStore.checkActiveHealth()">Health</button>
      </div>
      <div v-if="selectedProvider === 'karpov'" class="provider-stack fm-setting">
        <span>{{ accountText }}</span>
        <button class="secondary-btn" @click="providerStore.loadAccountSummary()">Account</button>
      </div>
      <SettingRow :label="zh.music.darkTheme" :value="zh.common.enabled" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { zh } from "@/i18n/zh";
import SettingRow from "@/components/UI/SettingRow.vue";
import { useProviderStore } from "@/stores/providerStore";
import type { ProviderId } from "@/types/music";

const providerStore = useProviderStore();
const selectedProvider = ref(providerStore.config.activeProviderId);
const healthText = computed(() => {
  if (providerStore.healthError) return providerStore.healthError;
  if (providerStore.activeHealth) return providerStore.activeHealth.ok ? "OK" : providerStore.activeHealth.message ?? "Failed";
  return "Provider health";
});
const fallbackText = computed(() => providerStore.config.fallbackProviderIds.join(" -> "));
const accountText = computed(() => {
  if (providerStore.accountError) return providerStore.accountError;
  const summary = providerStore.accountSummary;
  if (!summary) return "Karpov account";
  const balance = summary.balance?.balanceCents;
  const currency = summary.balance?.currency ?? "CNY";
  const usage = summary.usage;
  const money = balance === undefined ? "--" : `${currency} ${(balance / 100).toFixed(2)}`;
  return `Balance ${money} · Today ${usage?.today ?? "--"}/${usage?.dailyLimit ?? "--"}`;
});

watch(
  () => providerStore.config.activeProviderId,
  (providerId) => { selectedProvider.value = providerId; },
);

function switchProvider(): void {
  providerStore.switchProvider(selectedProvider.value as ProviderId);
}
</script>

<style scoped>
.fm-setting {
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.06);
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

.provider-row select {
  min-height: 40px;
  border: 1px solid var(--bg-border);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  color: var(--text);
  padding: 0 32px 0 12px;
  font-size: 14px;
  cursor: pointer;
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%23999' d='M1 1l5 5 5-5'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
}

.provider-row select option {
  background: var(--bg-elevated);
  color: var(--text);
}

.provider-stack {
  min-height: 58px;
  display: grid;
  gap: 8px;
}

.provider-stack span {
  color: var(--text-muted);
}

.provider-stack strong {
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.provider-stack button {
  justify-self: start;
}
</style>
