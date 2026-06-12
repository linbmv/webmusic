import type { AudioQuality, LibrarySettings, MusicSourceId, ProviderConfigEntry, ProviderId, ProviderRuntimeConfig } from "@/types/music";

const providerIds = ["mock", "freeMusic", "karpov", "gdStudio", "neteaseCloud", "coco", "custom"] as const satisfies readonly ProviderId[];
const musicSourceIds = ["netease", "kuwo", "qqmusic", "kugou", "joox"] as const satisfies readonly MusicSourceId[];
const audioQualities = ["128kmp3", "320kmp3", "flac"] as const satisfies readonly AudioQuality[];

// Public providers: accessible without authentication
export const publicProviderIds: readonly ProviderId[] = ["mock", "freeMusic", "gdStudio", "neteaseCloud", "coco"];

// Account-required providers: require user login (use backend secrets or account resources)
export const accountRequiredProviderIds: readonly ProviderId[] = ["karpov", "custom"];

export function providerRequiresAccount(providerId: ProviderId): boolean {
  return accountRequiredProviderIds.includes(providerId);
}

// 上游音乐接口偶发 14-25s 慢响应，超时放宽到 20s，避免健康检查/搜索过早 abort
const defaultProviderTimeoutMs = 20_000;

const baseProvider = {
  enabled: true,
  timeoutMs: defaultProviderTimeoutMs,
};

export const defaultProviderConfig: ProviderRuntimeConfig = {
  activeProviderId: "coco",
  // Coco 主源 → FreeMusic → GD Studio fallback → 自建网易云兜底
  fallbackProviderIds: ["freeMusic", "gdStudio", "neteaseCloud"],
  defaultQuality: "320kmp3",
  // netease 优先：kuwo 上游近期非常慢，放后面避免拖死请求
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
    neteaseCloud: {
      ...baseProvider,
      baseUrl: "http://127.0.0.1:3000",
      proxyBaseUrl: "/api/music/netease",
    },
    coco: {
      ...baseProvider,
      baseUrl: "http://127.0.0.1:5000",
      proxyBaseUrl: "/api/music/coco",
    },
    custom: {
      enabled: false,
      timeoutMs: defaultProviderTimeoutMs,
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
  const activeProviderId = normalizeActiveProviderId(raw.activeProviderId);
  return {
    activeProviderId,
    fallbackProviderIds: normalizeProviderIds(raw.fallbackProviderIds),
    defaultQuality: normalizeQuality(raw.defaultQuality),
    defaultSources: normalizeSources(raw.defaultSources),
    useBffProxy: typeof raw.useBffProxy === "boolean" ? raw.useBffProxy : defaultProviderConfig.useBffProxy,
    providers: mergeProviderEntries(raw.providers),
  };
}

function normalizeActiveProviderId(input: unknown): ProviderId {
  const providerId = normalizeProviderId(input);
  return providerId ?? defaultProviderConfig.activeProviderId;
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
  // 旧本地配置可能存了 12s 超时；不允许低于当前默认值，自动升级到 20s
  const rawTimeout = positiveNumber(raw.timeoutMs) ? raw.timeoutMs : defaultEntry.timeoutMs;
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : defaultEntry.enabled,
    baseUrl: nonEmptyString(raw.baseUrl) ? raw.baseUrl : defaultEntry.baseUrl,
    proxyBaseUrl: nonEmptyString(raw.proxyBaseUrl) ? raw.proxyBaseUrl : defaultEntry.proxyBaseUrl,
    timeoutMs: Math.max(rawTimeout, defaultEntry.timeoutMs),
  };
}

function normalizeProviderIds(input: unknown): ProviderId[] {
  if (!Array.isArray(input)) return [...defaultProviderConfig.fallbackProviderIds];
  const providerIds = input.map(normalizeProviderId).filter((id): id is ProviderId => Boolean(id));
  return providerIds.length > 0 ? Array.from(new Set(providerIds)) : [...defaultProviderConfig.fallbackProviderIds];
}

function normalizeProviderId(input: unknown): ProviderId | null {
  if (input === "freemusic") return "freeMusic";
  if (input === "gdstudio") return "gdStudio";
  if (input === "ncm" || input === "neteasecloud") return "neteaseCloud";
  return isProviderId(input) ? input : null;
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
