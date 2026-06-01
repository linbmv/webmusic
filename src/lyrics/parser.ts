import type { LyricLine, LyricWord, ParsedLyric } from "@/types/music";

interface RawLyrics {
  lrc?: string;
  yrc?: string;
}

interface TimedLine {
  startMs: number;
  text: string;
  words?: LyricWord[];
}

export function parseLyrics(input: RawLyrics): ParsedLyric | null {
  const lrcLines = parseLrc(input.lrc ?? "");
  const yrcLines = parseYrc(input.yrc ?? "");
  if (yrcLines.length) return { kind: lrcLines.length ? "mixed" : "yrc", lines: mergeLyrics(lrcLines, yrcLines) };
  if (lrcLines.length) return { kind: "lrc", lines: lrcLines.map(toLyricLine) };
  // 无时间戳的纯文本歌词（如 beat 说明、未配时间轴的歌词）也要展示，
  // 用哨兵 startMs 让首行常驻高亮、其余静态铺开，避免逐行跳动
  const plain = parsePlainText(input.lrc ?? input.yrc ?? "");
  if (plain.length) return { kind: "lrc", lines: plain };
  return null;
}

function parsePlainText(input: string): LyricLine[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text) => ({ startMs: Number.MAX_SAFE_INTEGER, durationMs: 0, text, words: [] }));
}

export class LyricSync {
  constructor(private readonly lines: LyricLine[]) {}

  getActiveLine(timeMs: number): LyricLine | null {
    if (!this.lines.length) return null;
    let left = 0;
    let right = this.lines.length - 1;
    let result = this.lines[0];
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const line = this.lines[mid];
      if (timeMs < line.startMs) {
        right = mid - 1;
      } else {
        result = line;
        left = mid + 1;
      }
    }
    return result;
  }
}

function parseLrc(input: string): TimedLine[] {
  return input.split(/\r?\n/).flatMap((line) => {
    const matches = [...line.matchAll(/\[(\d{2}):(\d{2})\.(\d{2,3})\]/g)];
    const text = line.replace(/\[(\d{2}):(\d{2})\.(\d{2,3})\]/g, "").trim();
    return matches.map((match) => ({ startMs: toMs(match[1], match[2], match[3]), text }));
  });
}

function parseYrc(input: string): TimedLine[] {
  return input.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)$/);
    if (!match) return [];
    const startMs = toMs(match[1], match[2], match[3]);
    const words = parseYrcWords(match[4], startMs);
    const text = words.length ? words.map((word) => word.text).join("") : match[4].replace(/<\d+,\d+,\d+>/g, "").trim();
    return [{ startMs, text, words }];
  });
}

function parseYrcWords(input: string, lineStartMs: number): LyricWord[] {
  const matches = [...input.matchAll(/<(?<offset>\d+),(?<duration>\d+),\d+>(?<text>[^<]*)/g)];
  return matches.map((match) => ({
    text: match.groups?.text ?? "",
    startMs: lineStartMs + Number(match.groups?.offset ?? 0),
    durationMs: Number(match.groups?.duration ?? 0),
  })).filter((word) => word.text.length > 0);
}

function mergeLyrics(lrcLines: TimedLine[], yrcLines: TimedLine[]): LyricLine[] {
  const merged = yrcLines.length ? yrcLines : lrcLines;
  return merged.map((line, index) => {
    const nextStart = merged[index + 1]?.startMs ?? line.startMs + 3_000;
    const durationMs = Math.max(0, nextStart - line.startMs);
    return {
      startMs: line.startMs,
      durationMs,
      text: line.text || lrcLines[index]?.text || "",
      words: line.words ?? [],
    };
  });
}

function toLyricLine(line: TimedLine, index: number, source: TimedLine[]): LyricLine {
  const nextStart = source[index + 1]?.startMs ?? line.startMs + 3_000;
  return { startMs: line.startMs, durationMs: Math.max(0, nextStart - line.startMs), text: line.text, words: [] };
}

function toMs(minutes: string, seconds: string, fraction: string): number {
  const ms = fraction.length === 2 ? Number(fraction) * 10 : Number(fraction);
  return Number(minutes) * 60_000 + Number(seconds) * 1000 + ms;
}
