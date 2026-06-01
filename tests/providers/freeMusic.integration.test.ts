import { describe, expect, it } from "vitest";
import { defaultProviderConfig } from "@/config/providerConfig";
import { FreeMusicProvider } from "@/providers/FreeMusicProvider";

const runRealApi = process.env.RUN_REAL_MUSIC_API === "1";
const describeReal = runRealApi ? describe : describe.skip;

describeReal("FreeMusicProvider real API", () => {
  it("loads sources and search results from ios.25pan.com", async () => {
    const provider = new FreeMusicProvider(defaultProviderConfig.providers.freeMusic, false);

    const sources = await provider.listSources();
    const result = await provider.search({ q: "\u5468\u6770\u4f26", page: 1, pageSize: 5 });

    expect(sources.length).toBeGreaterThan(0);
    expect(result.items.length).toBeGreaterThan(0);
  }, 20_000);
});
