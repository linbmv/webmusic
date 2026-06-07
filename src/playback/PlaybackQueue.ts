import type { NormalizedSong, PlaybackMode } from "@/types/music";

export class PlaybackQueue {
  constructor(
    private readonly items: NormalizedSong[] = [],
    private readonly mode: PlaybackMode = "list",
    private readonly cursor = 0,
    private readonly history: number[] = [],
    private readonly plannedNext: number | null = null,
  ) {}

  get current(): NormalizedSong | null {
    return this.items[this.cursor] ?? null;
  }

  get length(): number {
    return this.items.length;
  }

  get tracks(): NormalizedSong[] {
    return this.items.slice();
  }

  get index(): number {
    return this.cursor;
  }

  jumpTo(cursor: number): PlaybackQueue {
    const clamped = clamp(cursor, this.items.length);
    const newHistory = this.cursor !== clamped ? [...this.history, this.cursor] : this.history;
    return new PlaybackQueue(this.items, this.mode, clamped, newHistory, null);
  }

  setMode(mode: PlaybackMode): PlaybackQueue {
    return new PlaybackQueue(this.items, mode, this.cursor, this.history, null);
  }

  replace(items: NormalizedSong[], cursor = 0): PlaybackQueue {
    return new PlaybackQueue(items.slice(), this.mode, clamp(cursor, items.length), [], null);
  }

  enqueue(item: NormalizedSong): PlaybackQueue {
    return new PlaybackQueue([...this.items, item], this.mode, this.cursor, this.history, this.plannedNext);
  }

  next(random: () => number = Math.random): PlaybackQueue {
    if (!this.items.length) return this;
    if (this.mode === "single") return this;

    const newHistory = [...this.history, this.cursor];

    if (this.mode === "shuffle") {
      const nextIndex = this.plannedNext ?? randomIndex(this.items.length, this.cursor, random);
      return new PlaybackQueue(this.items, this.mode, nextIndex, newHistory, null);
    }

    return new PlaybackQueue(this.items, this.mode, (this.cursor + 1) % this.items.length, newHistory, null);
  }

  previous(random: () => number = Math.random): PlaybackQueue {
    if (!this.items.length) return this;
    if (this.mode === "single") return this;

    if (this.mode === "shuffle") {
      if (this.history.length > 0) {
        const prevIndex = this.history[this.history.length - 1];
        const newHistory = this.history.slice(0, -1);
        return new PlaybackQueue(this.items, this.mode, prevIndex, newHistory, null);
      }
      return new PlaybackQueue(this.items, this.mode, randomIndex(this.items.length, this.cursor, random), [], null);
    }

    return new PlaybackQueue(this.items, this.mode, (this.cursor - 1 + this.items.length) % this.items.length, this.history, null);
  }

  peekNext(random: () => number = Math.random): NormalizedSong | null {
    if (!this.items.length) return null;
    if (this.mode === "single") return this.current;

    if (this.mode === "shuffle") {
      const nextIndex = this.plannedNext ?? randomIndex(this.items.length, this.cursor, random);
      if (this.plannedNext === null) {
        // 保存计划的下一首，确保 peekNext 和 next() 一致
        (this as any).plannedNext = nextIndex;
      }
      return this.items[nextIndex] ?? null;
    }

    return this.items[(this.cursor + 1) % this.items.length] ?? null;
  }

  peekPrevious(random: () => number = Math.random): NormalizedSong | null {
    if (!this.items.length) return null;
    if (this.mode === "single") return this.current;

    if (this.mode === "shuffle") {
      if (this.history.length > 0) {
        return this.items[this.history[this.history.length - 1]] ?? null;
      }
      return this.items[randomIndex(this.items.length, this.cursor, random)] ?? null;
    }

    return this.items[(this.cursor - 1 + this.items.length) % this.items.length] ?? null;
  }
}

function clamp(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.max(index, 0), length - 1);
}

function randomIndex(length: number, current: number, random: () => number): number {
  if (length <= 1) return 0;
  const value = Math.min(Math.max(random(), 0), 0.999999999999);
  const candidate = Math.floor(value * (length - 1));
  return candidate >= current ? candidate + 1 : candidate;
}
