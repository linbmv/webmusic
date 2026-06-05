import { DownloadService } from "@/playback/download";
import type { MusicProvider } from "@/providers/MusicProvider";
import type { NormalizedSong } from "@/types/music";

export interface BatchDownloadFailure {
  songName: string;
  error: string;
}

export interface BatchDownloadSummary {
  requested: number;
  succeeded: number;
  failed: number;
  failures: BatchDownloadFailure[];
}

export interface BatchDownloadProgress {
  done: number;
  total: number;
  song: NormalizedSong;
  failed: boolean;
}

export interface BatchDownloadOptions {
  onProgress?: (progress: BatchDownloadProgress) => void;
}

export async function downloadSongsToServer(
  songs: NormalizedSong[],
  providers: MusicProvider[],
  options: BatchDownloadOptions = {},
): Promise<BatchDownloadSummary> {
  const service = new DownloadService(providers);
  const failures: BatchDownloadFailure[] = [];
  for (const [index, song] of songs.entries()) {
    let failed = false;
    try {
      await service.download(song, "flac", { server: true });
    } catch (error) {
      failed = true;
      failures.push({ songName: song.name, error: error instanceof Error ? error.message : String(error) });
    } finally {
      options.onProgress?.({ done: index + 1, total: songs.length, song, failed });
    }
  }
  return { requested: songs.length, succeeded: songs.length - failures.length, failed: failures.length, failures };
}
