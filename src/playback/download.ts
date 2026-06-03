import type { MusicProvider } from "@/providers/MusicProvider";
import { PlaybackFallbackService } from "@/playback/fallback";
import { createServerDownload } from "@/services/accountApi";
import type { AudioQuality, NormalizedSong } from "@/types/music";

export type DownloadMethod = "server" | "blob" | "newtab";

export interface DownloadResult {
  ok: boolean;
  method: DownloadMethod;
  fileName: string;
  streamUrl?: string;
  error?: string;
}

export interface DownloadOptions {
  server?: boolean;
  fallbackWindow?: Window | null;
}

const qualityExtension: Record<AudioQuality, string> = {
  "128kmp3": "mp3",
  "320kmp3": "mp3",
  flac: "flac",
};

// 浏览器纯前端无法静默写任意磁盘路径：只能触发"另存为"下载。
// 第三方音频源常有 CORS 限制，fetch 取字节可能失败，此时兜底为新标签打开供用户另存。
export class DownloadService {
  private readonly fallback: PlaybackFallbackService;

  constructor(providers: MusicProvider[]) {
    this.fallback = new PlaybackFallbackService(providers);
  }

  async download(song: NormalizedSong, quality: AudioQuality = "flac", options: DownloadOptions = {}): Promise<DownloadResult> {
    const resolved = await this.fallback.resolvePlayableUrl(song, quality);
    const baseName = sanitizeFileName(`${song.artistText} - ${song.name}`);
    if (options.server) {
      closeUnusedWindow(options.fallbackWindow);
      const download = await createServerDownload(song, resolved.quality, resolved.url);
      return { ok: true, method: "server", fileName: `${baseName}.${qualityExtension[download.quality] ?? "mp3"}`, streamUrl: download.streamUrl };
    }
    try {
      const response = await fetch(resolved.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const ext = extensionFromMime(blob.type, qualityExtension[resolved.quality] ?? "mp3");
      const fileName = `${baseName}.${ext}`;
      const blobUrl = URL.createObjectURL(blob);
      triggerSave(blobUrl, fileName);
      closeUnusedWindow(options.fallbackWindow);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
      return { ok: true, method: "blob", fileName };
    } catch (error) {
      const fileName = `${baseName}.${qualityExtension[resolved.quality] ?? "mp3"}`;
      openFallbackWindow(resolved.url, options.fallbackWindow);
      return { ok: true, method: "newtab", fileName, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

function triggerSave(blobUrl: string, fileName: string): void {
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function openFallbackWindow(url: string, fallbackWindow?: Window | null): void {
  if (fallbackWindow && !fallbackWindow.closed) {
    fallbackWindow.location.href = url;
    return;
  }
  window.open(url, "_blank", "noopener");
}

function closeUnusedWindow(fallbackWindow?: Window | null): void {
  if (fallbackWindow && !fallbackWindow.closed) fallbackWindow.close();
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "track";
}

function extensionFromMime(mime: string, fallbackExt: string): string {
  if (mime.includes("flac")) return "flac";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) return "m4a";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("ogg")) return "ogg";
  return fallbackExt;
}
