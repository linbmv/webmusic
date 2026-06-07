import { LyricSync } from "@/lyrics/parser";
import type { LyricLine } from "@/types/music";

export function activeLineIndexOf(lines: LyricLine[], timeMs: number): number {
  if (!lines.length) return -1;
  const active = new LyricSync(lines).getActiveLine(timeMs);
  return lines.findIndex((line) => line === active);
}

export function lyricWindow(lines: LyricLine[], index: number): { previous: LyricLine | null; current: LyricLine | null; next: LyricLine | null } {
  if (index < 0) return { previous: null, current: lines[0] ?? null, next: lines[1] ?? null };
  return { previous: lines[index - 1] ?? null, current: lines[index] ?? null, next: lines[index + 1] ?? null };
}
