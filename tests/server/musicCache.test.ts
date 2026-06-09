import { describe, expect, it } from "vitest";
// 后端缓存是原生 ESM，TS 测试只验证运行时契约
// @ts-expect-error no declaration file for backend/musicCache.mjs
import { cacheKey, clearCache, getCached, setCached, ttlForPath } from "../../backend/musicCache.mjs";

describe("music BFF cache", () => {
  it("assigns longer TTL to playlist than the default", () => {
    expect(ttlForPath("/playlist/detail?id=1")).toBeGreaterThan(ttlForPath("/unknown"));
  });

  it("treats search and song_url with distinct TTLs", () => {
    expect(ttlForPath("/search?keywords=a")).toBe(6 * 60 * 60 * 1000);
    expect(ttlForPath("/song/url/v1?id=1")).toBe(60 * 60 * 1000);
    expect(ttlForPath("/api.php?types=url&id=1")).toBe(60 * 60 * 1000);
  });

  it("stores and retrieves a fresh entry; ignores non-positive TTL", () => {
    clearCache();
    const key = cacheKey("GET", "https://x/y?z=1");
    setCached(key, { status: 200, headers: {}, body: Buffer.from("hi") }, 1000);
    const hit = getCached(key);
    expect(hit?.body.toString()).toBe("hi");

    // 非正 TTL 不写入，不会覆盖已有条目
    const freshKey = cacheKey("GET", "https://x/y?z=2");
    setCached(freshKey, { status: 200, headers: {}, body: Buffer.from("x") }, 0);
    expect(getCached(freshKey)).toBeNull();
  });
});
