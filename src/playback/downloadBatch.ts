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

export async function downloadSongsToServer(songs: NormalizedSong[], providers: MusicProvider[]): Promise<BatchDownloadSummary> {
  const service = new DownloadService(providers);
  const failures: BatchDownloadFailure[] = [];
  for (const song of songs) {
    try {
      await service.download(song, "flac", { server: true });
    } catch (error) {
      failures.push({ songName: song.name, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { requested: songs.length, succeeded: songs.length - failures.length, failed: failures.length, failures };
}
