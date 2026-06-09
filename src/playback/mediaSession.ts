import type { NormalizedSong } from "@/types/music";

type PlayerState = "idle" | "loading" | "playing" | "paused" | "error";

interface MediaSessionControls {
  resume: () => Promise<void>;
  pause: () => void;
  previous: () => Promise<void>;
  next: () => Promise<void>;
  seek: (timeMs: number) => void;
}

// iOS 后台播放初始化
// 必须在应用启动时就初始化 MediaSession，否则 iOS 不会授予后台音频权限
export function initMediaSession(): void {
  if (!("mediaSession" in navigator)) return;

  // 设置一个占位 metadata，让 iOS 识别这是音频应用
  try {
    if (typeof MediaMetadata !== "undefined") {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: "WebMusic",
        artist: "",
        album: "",
      });
    }

    // 预先注册所有 action handlers，即使是空函数
    // iOS 需要这些 handlers 提前存在才能启用后台播放
    const noopAsync = () => Promise.resolve();
    const noop = () => {};

    setMediaSessionHandler("play", noopAsync);
    setMediaSessionHandler("pause", noop);
    setMediaSessionHandler("previoustrack", noopAsync);
    setMediaSessionHandler("nexttrack", noopAsync);
    setMediaSessionHandler("stop", noop);
    setMediaSessionHandler("seekto", noop);

    // 设置初始 playback state
    navigator.mediaSession.playbackState = "none";
  } catch (error) {
    console.warn("Failed to initialize MediaSession:", error);
  }
}

export function syncMediaSessionMetadata(song: NormalizedSong, controls: MediaSessionControls): void {
  if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: song.name,
    artist: song.artistText,
    album: song.album?.name ?? "",
  });
  setMediaSessionHandler("play", () => void controls.resume());
  setMediaSessionHandler("pause", () => controls.pause());
  setMediaSessionHandler("previoustrack", () => void controls.previous());
  setMediaSessionHandler("nexttrack", () => void controls.next());
  setMediaSessionHandler("stop", () => controls.pause());
  setMediaSessionHandler("seekto", (details) => {
    if (typeof details.seekTime === "number") controls.seek(details.seekTime * 1000);
  });
}

export function syncMediaSessionPlaybackState(state: PlayerState): void {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.playbackState = state === "playing" ? "playing" : state === "paused" ? "paused" : "none";
}

export function syncMediaSessionPosition(timeMs: number, durationMs: number): void {
  const session = "mediaSession" in navigator ? navigator.mediaSession as MediaSession & { setPositionState?: (state?: MediaPositionState) => void } : null;
  if (!session?.setPositionState || durationMs <= 0) return;
  try {
    session.setPositionState({
      duration: Math.max(0, durationMs / 1000),
      position: Math.min(Math.max(0, timeMs / 1000), Math.max(0, durationMs / 1000)),
      playbackRate: 1,
    });
  } catch {
    // Some browsers reject position updates while metadata is still incomplete.
  }
}

function setMediaSessionHandler(action: MediaSessionAction, handler: MediaSessionActionHandler): void {
  try {
    navigator.mediaSession.setActionHandler(action, handler);
  } catch {
    // Safari/iOS only supports part of the action set.
  }
}
