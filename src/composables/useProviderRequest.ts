import { ref } from "vue";
import { useProviderStore } from "@/stores/providerStore";

export function useProviderRequest() {
  const providerStore = useProviderStore();
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function withProviderFallback<T>(
    request: (provider: ReturnType<typeof providerStore.registry.getActive>) => Promise<T>
  ): Promise<T> {
    const providers = [providerStore.activeProvider, ...providerStore.registry.getFallbacks()];
    const seen = new Set<string>();
    let lastError: unknown;

    for (const provider of providers) {
      if (seen.has(provider.id)) continue;
      seen.add(provider.id);
      try {
        return await request(provider);
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Provider fallback chain failed");
  }

  async function runRequest(task: () => Promise<void>): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await task();
    } catch (requestError) {
      error.value = requestError instanceof Error ? requestError.message : "Provider request failed";
    } finally {
      loading.value = false;
    }
  }

  return {
    loading,
    error,
    withProviderFallback,
    runRequest,
  };
}
