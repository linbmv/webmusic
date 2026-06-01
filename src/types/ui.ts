import type { NormalizedSong } from "@/types/music";

export interface TrackRowItem {
  id: string;
  name: string;
  artistText: string;
  source: string;
  cover: string;
  position?: number;
  song?: NormalizedSong;
}
