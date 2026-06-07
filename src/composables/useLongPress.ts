import { ref } from "vue";

export interface UseLongPressOptions {
  delay?: number;
  moveTolerance?: number;
  onLongPress: () => void;
}

export function useLongPress(options: UseLongPressOptions) {
  const { delay = 500, moveTolerance = 16, onLongPress } = options;

  const timer = ref<ReturnType<typeof setTimeout> | null>(null);
  const moved = ref(false);
  const startX = ref(0);
  const startY = ref(0);

  function start(clientX: number, clientY: number): void {
    moved.value = false;
    startX.value = clientX;
    startY.value = clientY;
    timer.value = setTimeout(() => {
      if (!moved.value) {
        onLongPress();
      }
    }, delay);
  }

  function move(clientX: number, clientY: number): void {
    if (moved.value) return;
    const deltaX = Math.abs(clientX - startX.value);
    const deltaY = Math.abs(clientY - startY.value);
    if (deltaX > moveTolerance || deltaY > moveTolerance) {
      moved.value = true;
      cancel();
    }
  }

  function end(): void {
    cancel();
  }

  function cancel(): void {
    if (timer.value) {
      clearTimeout(timer.value);
      timer.value = null;
    }
  }

  return {
    start,
    move,
    end,
    cancel,
  };
}
