import { defineStore } from "pinia";
import { ref } from "vue";
import type { NormalizedSong } from "@/types/music";

type BottomSheetState =
  | { type: "addToPlaylist"; song: NormalizedSong }
  | { type: "queue" }
  | null;

type ActionSheetState =
  | { type: "renamePlaylist"; playlistId: string; currentName: string }
  | { type: "trackActions"; song: NormalizedSong; playlistId?: string }
  | null;

interface ToastItem {
  id: string;
  message: string;
  actionLabel?: string;
  action?: () => void;
}

export const useUiStore = defineStore("ui", () => {
  const playerOpen = ref(false);
  const lyricsOpen = ref(false);
  const navHidden = ref(false);
  const bottomSheet = ref<BottomSheetState>(null);
  const actionSheet = ref<ActionSheetState>(null);
  const toasts = ref<ToastItem[]>([]);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  function openPlayer(): void { playerOpen.value = true; lyricsOpen.value = false; }
  function closePlayer(): void { playerOpen.value = false; }

  // 底部导航自动隐藏：内容向下滚动时隐藏、向上滚动时显示（仅移动端响应）
  function setNavHidden(hidden: boolean): void { navHidden.value = hidden; }

  // 歌词层与全屏播放器互斥：打开歌词时关闭全屏播放器，避免两层全屏叠加
  function toggleLyrics(): void {
    lyricsOpen.value = !lyricsOpen.value;
    if (lyricsOpen.value) playerOpen.value = false;
  }
  function closeLyrics(): void { lyricsOpen.value = false; }

  function openAddToPlaylist(song: NormalizedSong): void {
    bottomSheet.value = { type: "addToPlaylist", song };
  }
  function openQueue(): void {
    bottomSheet.value = { type: "queue" };
  }
  function closeBottomSheet(): void {
    bottomSheet.value = null;
  }

  function openRenamePlaylist(playlistId: string, currentName: string): void {
    actionSheet.value = { type: "renamePlaylist", playlistId, currentName };
  }
  function openTrackActions(song: NormalizedSong, playlistId?: string): void {
    actionSheet.value = { type: "trackActions", song, playlistId };
  }
  function closeActionSheet(): void {
    actionSheet.value = null;
  }

  function toast(message: string, options?: { actionLabel?: string; action?: () => void }): void {
    const item: ToastItem = { id: crypto.randomUUID(), message, actionLabel: options?.actionLabel, action: options?.action };
    toasts.value = [...toasts.value, item];
    const timer = setTimeout(() => dismissToast(item.id), 4000);
    timers.set(item.id, timer);
  }

  function runToastAction(id: string): void {
    const item = toasts.value.find((toastItem) => toastItem.id === id);
    item?.action?.();
    dismissToast(id);
  }

  function dismissToast(id: string): void {
    const timer = timers.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(id);
    }
    toasts.value = toasts.value.filter((toastItem) => toastItem.id !== id);
  }

  return {
    playerOpen,
    lyricsOpen,
    navHidden,
    bottomSheet,
    actionSheet,
    toasts,
    openPlayer,
    closePlayer,
    toggleLyrics,
    closeLyrics,
    setNavHidden,
    openAddToPlaylist,
    openQueue,
    closeBottomSheet,
    openRenamePlaylist,
    openTrackActions,
    closeActionSheet,
    toast,
    runToastAction,
    dismissToast,
  };
});
