import { describe, expect, it } from "vitest";
import { PlaybackQueue } from "@/playback/PlaybackQueue";
import type { NormalizedSong, ProviderId } from "@/types/music";

const mockProviderId: ProviderId = "mock";

const song = (id: string): NormalizedSong => ({
  stableId: id,
  providerSongId: id,
  provider: { providerId: mockProviderId, source: "netease" },
  name: id,
  artists: ["artist"],
  artistText: "artist",
  raw: {},
});

describe("PlaybackQueue", () => {
  it("moves forward and wraps in list mode", () => {
    const queue = new PlaybackQueue().replace([song("a"), song("b")], 0);

    expect(queue.current?.name).toBe("a");
    expect(queue.next().current?.name).toBe("b");
    expect(queue.next().next().current?.name).toBe("a");
  });

  it("keeps current in single mode", () => {
    const queue = new PlaybackQueue().replace([song("a"), song("b")], 0).setMode("single");

    expect(queue.next().current?.name).toBe("a");
    expect(queue.previous().current?.name).toBe("a");
    expect(queue.peekNext()?.name).toBe("a");
  });

  it("moves backward and wraps in list mode", () => {
    const queue = new PlaybackQueue().replace([song("a"), song("b"), song("c")], 0);

    expect(queue.previous().current?.name).toBe("c");
  });

  it("picks a different track in shuffle mode", () => {
    const queue = new PlaybackQueue().replace([song("a"), song("b"), song("c")], 1).setMode("shuffle");

    expect(queue.next(() => 0).current?.name).toBe("a");
    expect(queue.next(() => 0.99).current?.name).toBe("c");
    expect(queue.previous(() => 0.99).current?.name).toBe("c");
    expect(queue.peekNext(() => 0.99)?.name).toBe("c");
  });

  it("keeps the only track in shuffle mode", () => {
    const queue = new PlaybackQueue().replace([song("a")], 0).setMode("shuffle");

    expect(queue.next(() => 0.99).current?.name).toBe("a");
  });
});
