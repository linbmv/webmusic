import { describe, expect, it } from "vitest";
import { LyricSync, parseLyrics } from "@/lyrics/parser";

describe("lyrics parser", () => {
  it("parses lrc lines and finds active line", () => {
    const parsed = parseLyrics({ lrc: "[00:00.00]first\n[00:12.50]second" });

    expect(parsed?.kind).toBe("lrc");
    expect(parsed?.lines[1].startMs).toBe(12_500);
    expect(new LyricSync(parsed?.lines ?? []).getActiveLine(13_000)?.text).toBe("second");
  });

  it("returns null for empty lyrics", () => {
    expect(parseLyrics({ lrc: "", yrc: "" })).toBeNull();
  });

  it("parses yrc word timing", () => {
    const parsed = parseLyrics({ yrc: "[00:01.00]<0,300,0>你<300,400,0>好" });

    expect(parsed?.kind).toBe("yrc");
    expect(parsed?.lines[0].text).toBe("你好");
    expect(parsed?.lines[0].words[1]).toMatchObject({ text: "好", startMs: 1300, durationMs: 400 });
  });
});
