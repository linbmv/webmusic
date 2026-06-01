import { defineStore } from "pinia";
import { computed, shallowRef, ref, watch } from "vue";
import { cloneProviderConfig, defaultProviderConfig, mergeProviderConfig, providerStorageKey } from "@/config/providerConfig";
import { createProviderRegistry } from "@/providers/registry";
import type { ProviderAccountSummary, ProviderHealth, ProviderId, ProviderRuntimeConfig } from "@/types/music";

export const useProviderStore = defineStore("provider", () => {
  const config = ref<ProviderRuntimeConfig>(loadStoredConfig());
  const registry = shallowRef(createProviderRegistry(config.value));
  const activeHealth = ref<ProviderHealth | null>(null);
  const healthError = ref<string | null>(null);
  const accountSummary = ref<ProviderAccountSummary | null>(null);
  const accountError = ref<string | null>(null);
  const activeProvider = computed(() => registry.value.getActive());
  const providers = computed(() => registry.value.list());

  watch(
    config,
    (next) => {
      registry.value = createProviderRegistry(next);
      persistConfig(next);
    },
    { deep: true },
  );

  function switchProvider(providerId: ProviderId): void {
    const previousProviderId = config.value.activeProviderId;
    const fallbackProviderIds = [previousProviderId, ...config.value.fallbackProviderIds]
      .filter((id) => id !== providerId);
    config.value = { ...config.value, activeProviderId: providerId, fallbackProviderIds: Array.from(new Set(fallbackProviderIds)) };
  }

  function setConfig(next: Partial<ProviderRuntimeConfig>): void {
    config.value = mergeProviderConfig(next);
  }

  function resetConfig(): void {
    config.value = cloneProviderConfig(defaultProviderConfig);
  }

  async function checkActiveHealth(): Promise<void> {
    activeHealth.value = null;
    healthError.value = null;
    try {
      activeHealth.value = await activeProvider.value.healthCheck();
    } catch (error) {
      healthError.value = error instanceof Error ? error.message : "Provider health check failed";
    }
  }

  async function loadAccountSummary(): Promise<void> {
    accountSummary.value = null;
    accountError.value = null;
    const loadSummary = activeProvider.value.getAccountSummary;
    if (!loadSummary) return;
    try {
      accountSummary.value = await loadSummary.call(activeProvider.value);
    } catch (error) {
      accountError.value = error instanceof Error ? error.message : "Provider account summary failed";
    }
  }

  return {
    config,
    registry,
    activeProvider,
    providers,
    activeHealth,
    healthError,
    accountSummary,
    accountError,
    switchProvider,
    setConfig,
    resetConfig,
    checkActiveHealth,
    loadAccountSummary,
  };
});

function loadStoredConfig(): ProviderRuntimeConfig {
  if (typeof localStorage === "undefined") return cloneProviderConfig(defaultProviderConfig);
  const raw = localStorage.getItem(providerStorageKey);
  if (!raw) return cloneProviderConfig(defaultProviderConfig);
  try {
    return mergeProviderConfig(JSON.parse(raw));
  } catch {
    return cloneProviderConfig(defaultProviderConfig);
  }
}

function persistConfig(config: ProviderRuntimeConfig): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(providerStorageKey, JSON.stringify(config));
}
