import { describe, expect, it } from "vitest";

// 后端入口是原生 ESM JavaScript，TypeScript 测试只关心运行时契约。
// @ts-expect-error no declaration file for backend/proxy.mjs
import { buildProxyUrl, matchesProxyPrefix } from "../../backend/proxy.mjs";

describe("music proxy routing", () => {
  it("matches only exact proxy prefixes and child paths", () => {
    expect(matchesProxyPrefix("/api/music/karpov", "/api/music/karpov")).toBe(true);
    expect(matchesProxyPrefix("/api/music/karpov/search", "/api/music/karpov")).toBe(true);
    expect(matchesProxyPrefix("/api/music/karpov.evil.test/search", "/api/music/karpov")).toBe(false);
    expect(matchesProxyPrefix("/api/music/karpov@evil.test/search", "/api/music/karpov")).toBe(false);
  });

  it("keeps upstream requests on the configured host", () => {
    const safe = buildProxyUrl(new URL("http://local/api/music/karpov/v1/search?q=a"), {
      prefix: "/api/music/karpov",
      baseUrl: "https://gateway.karpov.cn",
    });

    expect(safe.href).toBe("https://gateway.karpov.cn/v1/search?q=a");
    expect(safe.hostname).toBe("gateway.karpov.cn");
  });

  it("rejects attacker-controlled host suffixes before authorization headers are attached", () => {
    expect(() => buildProxyUrl(new URL("http://local/api/music/karpov@evil.test/a"), {
      prefix: "/api/music/karpov",
      baseUrl: "https://gateway.karpov.cn",
    })).toThrow("Music proxy not found");
  });
});
