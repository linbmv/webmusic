import { ref } from "vue";

export interface UseSwipeActionOptions {
  threshold?: number;
  maxOffset?: number;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
}

export function useSwipeAction(options: UseSwipeActionOptions) {
  const { threshold = 64, maxOffset = 96, onSwipeRight, onSwipeLeft } = options;

  const offset = ref(0);
  const dragging = ref(false);
  const moved = ref(false);
  const startX = ref(0);
  const startY = ref(0);

  const TAP_SLOP = 16;

  function start(clientX: number, clientY: number): void {
    dragging.value = true;
    moved.value = false;
    startX.value = clientX;
    startY.value = clientY;
  }

  function move(clientX: number, clientY: number, canSwipeLeft: boolean): boolean | void {
    if (!dragging.value) return;

    const deltaX = clientX - startX.value;
    const deltaY = clientY - startY.value;

    if (!moved.value && Math.abs(deltaX) < TAP_SLOP && Math.abs(deltaY) < TAP_SLOP) {
      return;
    }

    // 纵向滚动意图明显时放弃横向滑动
    if (!moved.value && Math.abs(deltaY) > TAP_SLOP && Math.abs(deltaY) > Math.abs(deltaX) * 1.5) {
      cancel();
      return false;
    }

    moved.value = true;
    const limited = Math.max(-maxOffset, Math.min(maxOffset, deltaX));
    offset.value = !canSwipeLeft && limited < 0 ? 0 : limited;
    return true;
  }

  function end(): { action: "left" | "right" | null; wasMoved: boolean } {
    const finalOffset = offset.value;
    const wasMoved = moved.value;

    dragging.value = false;
    offset.value = 0;
    moved.value = false;

    if (!wasMoved) return { action: null, wasMoved: false };

    if (finalOffset >= threshold && onSwipeRight) {
      return { action: "right", wasMoved: true };
    } else if (finalOffset <= -threshold && onSwipeLeft) {
      return { action: "left", wasMoved: true };
    }

    return { action: null, wasMoved: true };
  }

  function cancel(): void {
    dragging.value = false;
    moved.value = false;
    offset.value = 0;
  }

  return {
    offset,
    dragging,
    moved,
    start,
    move,
    end,
    cancel,
  };
}
