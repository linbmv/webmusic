import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useUiStore } from "@/stores/uiStore";
import type { NormalizedSong } from "@/types/music";

function song(id: string): NormalizedSong {
  return {
    stableId: `mock:netease:song:${id}`,
    providerSongId: id,
    provider: { providerId: "mock", source: "netease" },
    name: `Song ${id}`,
    artists: ["Artist"],
    artistText: "Artist",
    raw: {},
  };
}

describe("uiStore track actions context", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("carries playlist context for playlist track removal", () => {
    const ui = useUiStore();
    ui.openTrackActions(song("a"), "p1");
    expect(ui.actionSheet).toMatchObject({ type: "trackActions", playlistId: "p1" });
  });

  it("carries favorites context so favorites can be removed from the action sheet", () => {
    const ui = useUiStore();
    ui.openTrackActions(song("a"), undefined, true);
    expect(ui.actionSheet).toMatchObject({ type: "trackActions", isFavorites: true });
    expect((ui.actionSheet as { playlistId?: string }).playlistId).toBeUndefined();
  });

  it("defaults to no removal context for search results", () => {
    const ui = useUiStore();
    ui.openTrackActions(song("a"));
    expect(ui.actionSheet).toMatchObject({ type: "trackActions" });
    const sheet = ui.actionSheet as { playlistId?: string; isFavorites?: boolean };
    expect(sheet.playlistId).toBeUndefined();
    expect(sheet.isFavorites).toBeUndefined();
  });
});
