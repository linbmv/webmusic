import type { AudioQuality, LibrarySettings, MusicSourceId, ProviderConfigEntry, ProviderId, ProviderRuntimeConfig } from "@/types/music";

const providerIds = ["mock", "freeMusic", "karpov", "gdStudio", "custom"] as const satisfies readonly ProviderId[];
const musicSourceIds = ["netease", "kuwo", "qqmusic", "kugou", "joox"] as const satisfies readonly MusicSourceId[];
const audioQualities = ["128kmp3", "320kmp3", "flac"] as const satisfies readonly AudioQuality[];

const baseProvider = {
  enabled: true,
  timeoutMs: 12_000,
};

export const defaultProviderConfig: ProviderRuntimeConfig = {
  activeProviderId: "freeMusic",
  fallbackProviderIds: ["freeMusic", "gdStudio"],
  defaultQuality: "320kmp3",
  defaultSources: ["netease", "kuwo"],
  useBffProxy: true,
  providers: {
    mock: {
      ...baseProvider,
      baseUrl: "/mock",
      proxyBaseUrl: "/mock",
    },
    freeMusic: {
      ...baseProvider,
      baseUrl: "https://ios.25pan.com/api/v1/freemusic",
      proxyBaseUrl: "/api/music/free",
    },
    karpov: {
      ...baseProvider,
      baseUrl: "https://gateway.karpov.cn",
      proxyBaseUrl: "/api/music/karpov",
    },
    gdStudio: {
      ...baseProvider,
      baseUrl: "https://music-api.gdstudio.xyz/api.php",
      proxyBaseUrl: "/api/music/gdstudio",
    },
    custom: {
      enabled: false,
      timeoutMs: 12_000,
      baseUrl: "https://example.com/api/music",
      proxyBaseUrl: "/api/music/custom",
    },
  },
};

export const defaultLibrarySettings: LibrarySettings = {
  provider: defaultProviderConfig,
  darkMode: true,
  lyricSync: true,
  defaultQuality: "320kmp3",
};

export const providerStorageKey = "music.provider.config.v2";
export const libraryStorageKey = "music.library.settings.v2";

export function cloneProviderConfig(config: ProviderRuntimeConfig): ProviderRuntimeConfig {
  return JSON.parse(JSON.stringify(config)) as ProviderRuntimeConfig;
}

export function mergeProviderConfig(input: unknown = {}): ProviderRuntimeConfig {
  const raw = isRecord(input) ? input : {};
  return {
    activeProviderId: isProviderId(raw.activeProviderId) ? raw.activeProviderId : defaultProviderConfig.activeProviderId,
    fallbackProviderIds: normalizeProviderIds(raw.fallbackProviderIds),
    defaultQuality: normalizeQuality(raw.defaultQuality),
    defaultSources: normalizeSources(raw.defaultSources),
    useBffProxy: typeof raw.useBffProxy === "boolean" ? raw.useBffProxy : defaultProviderConfig.useBffProxy,
    providers: mergeProviderEntries(raw.providers),
  };
}

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && providerIds.includes(value as ProviderId);
}

function mergeProviderEntries(input: unknown): Record<ProviderId, ProviderConfigEntry> {
  const entries = {} as Record<ProviderId, ProviderConfigEntry>;
  const rawProviders = isRecord(input) ? input : {};
  for (const providerId of providerIds) {
    entries[providerId] = mergeProviderEntry(defaultProviderConfig.providers[providerId], rawProviders[providerId]);
  }
  return entries;
}

function mergeProviderEntry(defaultEntry: ProviderConfigEntry, input: unknown): ProviderConfigEntry {
  const raw = isRecord(input) ? input : {};
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : defaultEntry.enabled,
    baseUrl: nonEmptyString(raw.baseUrl) ? raw.baseUrl : defaultEntry.baseUrl,
    proxyBaseUrl: nonEmptyString(raw.proxyBaseUrl) ? raw.proxyBaseUrl : defaultEntry.proxyBaseUrl,
    timeoutMs: positiveNumber(raw.timeoutMs) ? raw.timeoutMs : defaultEntry.timeoutMs,
  };
}

function normalizeProviderIds(input: unknown): ProviderId[] {
  if (!Array.isArray(input)) return [...defaultProviderConfig.fallbackProviderIds];
  const providerIds = input.filter(isProviderId);
  return providerIds.length > 0 ? Array.from(new Set(providerIds)) : [...defaultProviderConfig.fallbackProviderIds];
}

function normalizeSources(input: unknown): MusicSourceId[] {
  if (!Array.isArray(input)) return [...defaultProviderConfig.defaultSources];
  const sources = input.filter(isMusicSourceId);
  return sources.length > 0 ? Array.from(new Set(sources)) : [...defaultProviderConfig.defaultSources];
}

function normalizeQuality(input: unknown): AudioQuality {
  return isAudioQuality(input) ? input : defaultProviderConfig.defaultQuality;
}

function isMusicSourceId(value: unknown): value is MusicSourceId {
  return typeof value === "string" && musicSourceIds.includes(value as MusicSourceId);
}

function isAudioQuality(value: unknown): value is AudioQuality {
  return typeof value === "string" && audioQualities.includes(value as AudioQuality);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function positiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
