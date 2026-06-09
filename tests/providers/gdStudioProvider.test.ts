import { afterEach, describe, expect, it, vi } from "vitest";
import { GdStudioProvider } from "@/providers/GdStudioProvider";
import type { ProviderConfigEntry } from "@/types/music";

const config: ProviderConfigEntry = {
  enabled: true,
  baseUrl: "/api/music/gdstudio",
  timeoutMs: 5_000,
};

describe("GdStudioProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("checks health with a stable Netease search result", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/api/music/gdstudio");
      expect(url.searchParams.get("types")).toBe("search");
      expect(url.searchParams.get("source")).toBe("netease");
      expect(url.searchParams.get("name")).toBe("\u6674\u5929");
      expect(url.searchParams.get("count")).toBe("1");
      return jsonResponse([{ id: "228908", name: "\u6674\u5929", artist: ["\u5468\u6770\u4f26"], source: "netease" }]);
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new GdStudioProvider(config, false);

    const health = await provider.healthCheck();

    expect(health.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails health when the probe returns no playable result", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([])));
    const provider = new GdStudioProvider(config, false);

    await expect(provider.healthCheck()).rejects.toThrow("GD Studio health check returned no playable search result");
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}
