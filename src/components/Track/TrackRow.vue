<template>
  <div class="track-row-shell">
    <div class="swipe-hint dl" :class="{ armed: swipeOffset >= THRESHOLD }" aria-hidden="true">
      <Download :size="18" />
    </div>
    <div v-if="canDelete" class="swipe-hint del" :class="{ armed: swipeOffset <= -THRESHOLD }" aria-hidden="true">
      <Trash2 :size="18" />
    </div>
    <div
      class="track-row"
      :class="{ compact, swiping: dragging, 'currently-playing': isCurrentlyPlaying, loading: isLoading }"
      :style="{ transform: `translateX(${swipeOffset}px)` }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
      @touchstart.passive="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
      @touchcancel="onTouchCancel"
      @contextmenu.prevent="onLongPress"
    >
      <!-- Click ripple effect -->
      <div v-if="rippleVisible" class="ripple" :style="rippleStyle" />

      <div class="track-cover-wrap">
        <img v-if="item.cover" class="track-cover" :src="item.cover" :alt="`${item.name} 封面`" loading="lazy" decoding="async" />
        <div v-else class="track-cover placeholder" />
        <!-- Loading spinner overlay on cover when clicked -->
        <div v-if="isLoading" class="cover-loading" aria-label="加载中">
          <div class="spinner" />
        </div>
      </div>
      <div class="track-copy">
        <strong class="ellipsis">{{ item.name }}</strong>
        <small class="ellipsis">{{ item.artistText }}</small>
      </div>
      <button v-if="canDelete" class="icon-btn track-delete" :aria-label="zh.common.delete" @pointerdown.stop @click.stop="onDelete">
        <Trash2 :size="18" />
      </button>
      <button class="icon-btn track-more" :aria-label="zh.common.more" @pointerdown.stop @click.stop="onMore">
        <MoreHorizontal :size="18" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Download, MoreHorizontal, Trash2 } from "lucide-vue-next";
import { zh } from "@/i18n/zh";
import { useLibraryStore } from "@/stores/libraryStore";
import { useAccountStore } from "@/stores/accountStore";
import { usePlayerStore } from "@/stores/playerStore";
import { useUiStore } from "@/stores/uiStore";
import type { TrackRowItem } from "@/types/ui";

const props = defineProps<{
  item: TrackRowItem;
  compact?: boolean;
  playlistId?: string;
  isFavorites?: boolean;
}>();
const emit = defineEmits<{ play: [] }>();

const ui = useUiStore();
const account = useAccountStore();
const player = usePlayerStore();
const library = useLibraryStore();

// 滑动触发阈值与上限：超过 THRESHOLD 松手即触发动作，最大位移 MAX，小于 TAP_SLOP 视为点击
const THRESHOLD = 64;
const MAX = 96;
const TAP_SLOP = 16;

const swipeOffset = ref(0);
const dragging = ref(false);
const moved = ref(false);
const startX = ref(0);
const startY = ref(0);
const touchStartX = ref(0);
const touchStartY = ref(0);
// touch 手势期间置位：现代移动浏览器会同时派发 touch 与 pointer 事件，
// 用它让 pointer 处理器在 touch 设备上完全让位，避免两套逻辑争用共享状态
const touchActive = ref(false);
const longPressTimer = ref<ReturnType<typeof setTimeout> | null>(null);

// Loading state and ripple effect
const isLoading = ref(false);
const rippleVisible = ref(false);
const rippleStyle = ref({});

let loadingTimeout: ReturnType<typeof setTimeout> | null = null;
let loadingStartedAt = 0;
const minLoadingMs = 450;

// 只有处于歌单或收藏上下文时才允许左滑删除；搜索结果等无删除语义
const canDelete = computed(() => Boolean(props.playlistId) || Boolean(props.isFavorites));
// 当前歌曲是否正在播放
const isCurrentlyPlaying = computed(() => {
  return Boolean(props.item.song && player.currentSong && player.currentSong.stableId === props.item.song.stableId);
});

function clearLongPress(): void {
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value);
    longPressTimer.value = null;
  }
}

function onPointerDown(event: PointerEvent): void {
  // touch 派生的 pointer 事件交给 touch 处理器，避免重复触发
  if (touchActive.value || event.pointerType === "touch") return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  dragging.value = true;
  moved.value = false;
  startX.value = event.clientX;
  startY.value = event.clientY;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  longPressTimer.value = setTimeout(() => {
    if (!moved.value) onLongPress();
  }, 500);
}

function onPointerMove(event: PointerEvent): void {
  if (!dragging.value) return;
  const deltaX = event.clientX - startX.value;
  const deltaY = event.clientY - startY.value;
  if (!moved.value && Math.abs(deltaX) < TAP_SLOP && Math.abs(deltaY) < TAP_SLOP) return;
  // 仅当纵向意图明显占主导（>1.5 倍且超过阈值）时放弃横向滑动，交还页面滚动；
  // 放宽判定避免鼠标/触控板轻微抖动过早取消左滑
  if (!moved.value && Math.abs(deltaY) > TAP_SLOP && Math.abs(deltaY) > Math.abs(deltaX) * 1.5) {
    cancelDrag();
    return;
  }
  moved.value = true;
  clearLongPress();
  const limited = Math.max(-MAX, Math.min(MAX, deltaX));
  // 左滑（负向）仅在可删除上下文允许；右滑（正向）下载，始终允许
  swipeOffset.value = !canDelete.value && limited < 0 ? 0 : limited;
}

async function onPointerUp(event: PointerEvent): Promise<void> {
  if (touchActive.value || !dragging.value) return;
  dragging.value = false;
  clearLongPress();
  (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
  const offset = swipeOffset.value;
  swipeOffset.value = 0;
  if (!moved.value) {
    showRipple(event);
    onPlay();
    return;
  }
  if (offset >= THRESHOLD) {
    await downloadFlow();
  } else if (offset <= -THRESHOLD && canDelete.value) {
    await onDelete();
  }
}

function onPointerCancel(): void {
  cancelDrag();
}

function cancelDrag(): void {
  dragging.value = false;
  moved.value = false;
  swipeOffset.value = 0;
  clearLongPress();
}

function onPlay(): void {
  if (!props.item.song) return;

  // Show loading state immediately
  isLoading.value = true;
  loadingStartedAt = Date.now();

  // Clear any existing timeout
  if (loadingTimeout) clearTimeout(loadingTimeout);

  // Auto-hide loading after 3 seconds (in case play event doesn't trigger state change)
  loadingTimeout = setTimeout(() => {
    isLoading.value = false;
  }, 3000);

  emit("play");
}

// 即使秒开也让高亮至少可见 minLoadingMs，避免"一闪而过"
function clearLoadingWithMinDuration(): void {
  if (loadingTimeout) {
    clearTimeout(loadingTimeout);
    loadingTimeout = null;
  }
  const elapsed = Date.now() - loadingStartedAt;
  const remaining = Math.max(0, minLoadingMs - elapsed);
  if (remaining === 0) {
    isLoading.value = false;
    return;
  }
  loadingTimeout = setTimeout(() => {
    isLoading.value = false;
    loadingTimeout = null;
  }, remaining);
}

function showRipple(event: PointerEvent | Touch): void {
  const rect = (event.target as HTMLElement).closest('.track-row')?.getBoundingClientRect();
  if (!rect) return;

  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  rippleStyle.value = {
    left: `${x}px`,
    top: `${y}px`,
  };

  rippleVisible.value = true;
  setTimeout(() => {
    rippleVisible.value = false;
  }, 600);
}

function onMore(): void {
  if (props.item.song) ui.openTrackActions(props.item.song, props.playlistId, props.isFavorites);
}

function onTouchStart(event: TouchEvent): void {
  if (event.touches.length !== 1) return;
  touchActive.value = true;
  dragging.value = true;
  moved.value = false;
  touchStartX.value = event.touches[0].clientX;
  touchStartY.value = event.touches[0].clientY;
  clearLongPress();
  longPressTimer.value = setTimeout(() => {
    if (!moved.value) onLongPress();
  }, 560);
}

function onTouchMove(event: TouchEvent): void {
  if (!touchActive.value || event.touches.length !== 1) return;
  const deltaX = event.touches[0].clientX - touchStartX.value;
  const deltaY = event.touches[0].clientY - touchStartY.value;
  if (!moved.value && Math.abs(deltaX) < TAP_SLOP && Math.abs(deltaY) < TAP_SLOP) return;
  // 纵向意图明显占主导：放弃横向滑动，交还页面滚动
  if (!moved.value && Math.abs(deltaY) > TAP_SLOP && Math.abs(deltaY) > Math.abs(deltaX)) {
    cancelDrag();
    touchActive.value = false;
    clearLongPress();
    return;
  }
  moved.value = true;
  clearLongPress();
  // 横向滑动已接管，阻止页面纵向滚动干扰
  if (event.cancelable) event.preventDefault();
  const limited = Math.max(-MAX, Math.min(MAX, deltaX));
  swipeOffset.value = !canDelete.value && limited < 0 ? 0 : limited;
}

async function onTouchEnd(): Promise<void> {
  if (!touchActive.value) return;
  const wasDragging = dragging.value;
  dragging.value = false;
  clearLongPress();
  const offset = swipeOffset.value;
  swipeOffset.value = 0;
  // 延迟清除 touchActive，跳过紧随其后的 pointerup，避免重复触发播放/删除
  setTimeout(() => { touchActive.value = false; }, 50);
  if (!moved.value) {
    if (wasDragging) onPlay();
    return;
  }
  if (offset >= THRESHOLD) {
    await downloadFlow();
  } else if (offset <= -THRESHOLD && canDelete.value) {
    await onDelete();
  }
}

function onTouchCancel(): void {
  cancelDrag();
  setTimeout(() => { touchActive.value = false; }, 50);
}

// 长按 = 加入歌单
function onLongPress(): void {
  clearLongPress();
  void addToPlaylistFlow();
}

// 右滑 = 下载（默认 flac 最高品质）
async function downloadFlow(): Promise<void> {
  const song = props.item.song;
  if (!song) return;
  const fallbackWindow = playerShouldPreopenWindow() ? window.open("about:blank", "_blank", "noopener") : null;
  ui.toast(`${zh.music.downloading}: ${song.name}`);
  try {
    const result = await player.downloadSong(song, fallbackWindow);
    if (result.method === "newtab") {
      ui.toast(`${zh.music.downloadOpened}: ${result.fileName}`);
    } else {
      ui.toast(`${zh.music.downloaded}: ${result.fileName}`);
    }
  } catch (error) {
    fallbackWindow?.close();
    ui.toast(`${zh.music.downloadFailed}: ${error instanceof Error ? error.message : song.name}`);
  }
}

function playerShouldPreopenWindow(): boolean {
  // 未登录时纯前端下载可能因 CORS 失败后走新标签兜底；移动端必须在用户手势内预开窗口，避免 await 后被拦截
  return !account.user;
}

async function addToPlaylistFlow(): Promise<void> {
  const song = props.item.song;
  if (!song) return;
  const playlists = library.playlists;
  // 仅一个歌单时直接加入并提供撤销；多个或为空时弹出选择/新建面板
  if (playlists.length === 1) {
    const target = playlists[0];
    const tracks = library.listPlaylistTracks(target.id);
    if (tracks.some((t) => t.stableId === song.stableId)) {
      ui.toast(`${song.name} 已在歌单中`);
      return;
    }
    await library.addTrackToPlaylist(target.id, song);
    ui.toast(`已加入 ${target.name}`, {
      actionLabel: zh.music.undo,
      action: () => void library.removeTrackFromPlaylist(target.id, song.stableId),
    });
  } else {
    ui.openAddToPlaylist(song);
  }
}

async function onDelete(): Promise<void> {
  const song = props.item.song;
  if (!song) return;
  if (props.playlistId) {
    const playlistId = props.playlistId;
    await library.removeTrackFromPlaylist(playlistId, song.stableId);
    ui.toast(`${zh.music.removed}: ${song.name}`, {
      actionLabel: zh.music.undo,
      action: () => void library.addTrackToPlaylist(playlistId, song),
    });
  } else if (props.isFavorites) {
    await library.removeFavorite(song.stableId);
    ui.toast(`${zh.music.removed}: ${song.name}`, {
      actionLabel: zh.music.undo,
      action: () => void library.toggleFavorite(song),
    });
  }
}

// Watch for playing state changes to clear loading
watch(isCurrentlyPlaying, (nowPlaying) => {
  if (nowPlaying) clearLoadingWithMinDuration();
});

</script>

<style scoped>
.track-row-shell {
  position: relative;
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.swipe-hint {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 64px;
  display: grid;
  place-items: center;
  color: #fff;
}

.swipe-hint.dl {
  left: 0;
  background: linear-gradient(90deg, rgba(102, 126, 234, 0.3), rgba(102, 126, 234, 0.15));
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  color: rgba(235, 235, 245, 0.85);
  border-right: 1px solid rgba(102, 126, 234, 0.3);
}

.swipe-hint.del {
  right: 0;
  background: linear-gradient(-90deg, rgba(255, 69, 58, 0.4), rgba(255, 69, 58, 0.2));
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  color: #ff453a;
  border-left: 1px solid rgba(255, 69, 58, 0.4);
}

.swipe-hint.armed {
  filter: brightness(1.18);
}

.track-row {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 54px;
  padding: 0 8px 0 6px;
  border-radius: 12px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  box-shadow: var(--shadow-sm);
  transition: transform 160ms ease, background var(--transition-fast), box-shadow var(--transition-fast);
  cursor: pointer;
  touch-action: pan-y;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  overflow: hidden;
}

.track-row:hover {
  background: var(--glass-hover);
  box-shadow: var(--shadow-md);
}

.track-row:active {
  transform: scale(0.98);
}

.track-row.compact {
  min-height: 48px;
}

.track-row.swiping {
  transition: none;
}

.track-row.loading {
  background: linear-gradient(90deg, var(--primary-soft), var(--glass-hover));
  border-color: var(--primary);
  box-shadow: 0 0 0 1px var(--primary), 0 4px 20px var(--primary-glow);
}

.track-row.loading .track-copy strong {
  color: #fff;
}

/* Ripple effect */
.ripple {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
  width: 20px;
  height: 20px;
  margin-left: -10px;
  margin-top: -10px;
  pointer-events: none;
  animation: ripple-animation 0.6s ease-out;
  z-index: 0;
}

@keyframes ripple-animation {
  from {
    transform: scale(1);
    opacity: 0.6;
  }
  to {
    transform: scale(15);
    opacity: 0;
  }
}

/* Cover wrapper + loading overlay */
.track-cover-wrap {
  position: relative;
  flex: 0 0 auto;
}

.cover-loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 8px;
  z-index: 3;
}

.spinner {
  width: 22px;
  height: 22px;
  border: 3px solid rgba(255, 255, 255, 0.25);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 正在播放：持续高亮边框 + 发光，替代左侧音量图标 */
.track-row.currently-playing {
  background: linear-gradient(90deg, var(--primary-soft), var(--glass-hover));
  border-color: var(--primary);
  box-shadow: 0 0 0 1px var(--primary), 0 4px 20px var(--primary-glow);
}

.track-row.currently-playing .track-copy strong {
  color: #fff;
}

.track-cover {
  width: 42px;
  height: 42px;
  border-radius: 8px;
  object-fit: cover;
  flex: 0 0 auto;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.track-cover.placeholder {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.2), rgba(118, 75, 162, 0.2));
  border: 1px solid var(--glass-border);
}

.track-row.compact .track-cover {
  width: 40px;
  height: 40px;
}

.track-copy {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 2px;
}

.track-copy small {
  color: var(--text-muted);
}

.track-copy strong {
  font-size: 13px;
  font-weight: 650;
  line-height: 1.15;
}

.track-copy small {
  font-size: 11px;
  line-height: 1.15;
}

.track-more {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  color: rgba(235, 235, 245, 0.58);
}

/* PC 端悬停删除按钮：默认隐藏，仅在支持 hover 的精确指针设备上、行 hover/聚焦时显示；
   移动端始终隐藏，避免遮挡触摸滑动，删除仍走左滑 */
.track-delete {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  color: #ff453a;
  display: none;
}

@media (hover: hover) and (pointer: fine) {
  .track-delete {
    display: inline-flex;
    opacity: 0;
    transition: opacity 140ms ease;
  }

  .track-row:hover .track-delete,
  .track-row:focus-within .track-delete {
    opacity: 1;
  }
}
</style>
