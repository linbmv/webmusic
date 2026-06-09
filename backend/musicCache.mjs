// 简单内存缓存：缓存音乐代理 GET 结果，降低上游慢响应对前端的影响。
// 不同接口给不同 TTL：search 6h、playlist 1d、song_url 1h、lyric 1d、其余 30m。

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 500;

const store = new Map(); // key -> { expiresAt, status, contentType, body(Buffer) }

export function ttlForPath(pathname) {
  const p = pathname.toLowerCase();
  if (p.includes("song_url") || p.includes("song/url") || p.includes("types=url")) return 60 * 60 * 1000; // 1h
  if (p.includes("/search") || p.includes("types=search")) return 6 * 60 * 60 * 1000; // 6h
  if (p.includes("playlist")) return 24 * 60 * 60 * 1000; // 1d
  if (p.includes("lyric") || p.includes("/yrc") || p.includes("types=lyric")) return 24 * 60 * 60 * 1000; // 1d
  if (p.includes("/qualities") || p.includes("/sources") || p.includes("toplist") || p.includes("recommend")) return 6 * 60 * 60 * 1000;
  return DEFAULT_TTL_MS;
}

export function cacheKey(method, fullUrl) {
  return `${method} ${fullUrl}`;
}

export function getCached(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  // LRU 近似：命中后移到末尾
  store.delete(key);
  store.set(key, entry);
  return entry;
}

export function setCached(key, value, ttlMs) {
  if (ttlMs <= 0) return;
  while (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
  store.set(key, { ...value, expiresAt: Date.now() + ttlMs });
}

export function clearCache() {
  store.clear();
}
