import { describe, expect, it } from "vitest";
import { cleanupPlaybackUrl, normalizeAudioUrl, normalizeFreeMusicSong } from "@/providers/normalizers";

describe("provider normalizers", () => {
  it("normalizes FreeMusic song ids and durations", () => {
    const song = normalizeFreeMusicSong({ id: "276840", name: "Yin Tian", artist: "A/B", album: "Live", duration: 247, source: "netease" });

    expect(song.stableId).toBe("freeMusic:netease:song:276840");
    expect(song.artists).toEqual(["A", "B"]);
    expect(song.durationMs).toBe(247_000);
  });

  it("cleans Kuwo playback urls", () => {
    expect(cleanupPlaybackUrl("http://a.kwcdn.kuwo.cn/song.aac")).toBe("https://a.kuwo.cn/song.aac");
  });

  it("normalizes audio urls", () => {
    const result = normalizeAudioUrl({ url: "http://a.kwcdn.kuwo.cn/song.aac", direct: true }, { providerId: "freeMusic", source: "kuwo", quality: "320kmp3" });

    expect(result.url).toContain("https://a.kuwo.cn");
    expect(result.direct).toBe(true);
  });
});

