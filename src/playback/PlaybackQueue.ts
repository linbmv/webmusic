import type { NormalizedSong, PlaybackMode } from "@/types/music";

export class PlaybackQueue {
  constructor(private readonly items: NormalizedSong[] = [], private readonly mode: PlaybackMode = "list", private readonly cursor = 0) {}

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
    return new PlaybackQueue(this.items, this.mode, clamp(cursor, this.items.length));
  }

  setMode(mode: PlaybackMode): PlaybackQueue {
    return new PlaybackQueue(this.items, mode, this.cursor);
  }

  replace(items: NormalizedSong[], cursor = 0): PlaybackQueue {
    return new PlaybackQueue(items.slice(), this.mode, clamp(cursor, items.length));
  }

  enqueue(item: NormalizedSong): PlaybackQueue {
    return new PlaybackQueue([...this.items, item], this.mode, this.cursor);
  }

  next(random: () => number = Math.random): PlaybackQueue {
    if (!this.items.length) return this;
    if (this.mode === "single") return this;
    if (this.mode === "shuffle") return new PlaybackQueue(this.items, this.mode, randomIndex(this.items.length, this.cursor, random));
    return new PlaybackQueue(this.items, this.mode, (this.cursor + 1) % this.items.length);
  }

  previous(random: () => number = Math.random): PlaybackQueue {
    if (!this.items.length) return this;
    if (this.mode === "single") return this;
    if (this.mode === "shuffle") return new PlaybackQueue(this.items, this.mode, randomIndex(this.items.length, this.cursor, random));
    return new PlaybackQueue(this.items, this.mode, (this.cursor - 1 + this.items.length) % this.items.length);
  }

  peekNext(random: () => number = Math.random): NormalizedSong | null {
    if (!this.items.length) return null;
    if (this.mode === "single") return this.current;
    if (this.mode === "shuffle") return this.items[randomIndex(this.items.length, this.cursor, random)] ?? null;
    return this.items[(this.cursor + 1) % this.items.length] ?? null;
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
