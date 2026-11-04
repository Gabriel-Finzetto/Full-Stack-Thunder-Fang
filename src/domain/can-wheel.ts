export type CanWheelDirection = -1 | 0 | 1;

const GESTURE_IDLE_MS = 160;
const TRACKPAD_THRESHOLD_PX = 40;

/** Counts discrete wheel notches, or one deliberate action per trackpad burst. */
export function createCanWheelGesture() {
  let lastTime = Number.NEGATIVE_INFINITY;
  let lastMode = -1;
  let direction: CanWheelDirection = 0;
  let kind: 'notch' | 'trackpad' | null = null;
  let distance = 0;
  let consumed = false;

  function reset() {
    lastTime = Number.NEGATIVE_INFINITY;
    lastMode = -1;
    direction = 0;
    kind = null;
    distance = 0;
    consumed = false;
  }

  return {
    read(deltaY: number, deltaMode: number, time: number): CanWheelDirection {
      if (!Number.isFinite(deltaY) || deltaY === 0 || !Number.isFinite(time) || time < 0 ||
        (deltaMode !== 0 && deltaMode !== 1 && deltaMode !== 2)) return 0;

      if (time < lastTime || time - lastTime >= GESTURE_IDLE_MS || deltaMode !== lastMode) reset();
      const nextDirection: -1 | 1 = deltaY > 0 ? 1 : -1;
      if (kind === null) {
        kind = deltaMode !== 0 || (Number.isInteger(deltaY) && Math.abs(deltaY) >= TRACKPAD_THRESHOLD_PX)
          ? 'notch' : 'trackpad';
      }
      if (direction !== 0 && direction !== nextDirection) {
        // Deliberately reversing direction can undo a step without waiting for
        // the old gesture's idle timeout. Keep its input kind to reject inertia.
        distance = 0;
        consumed = false;
      }
      direction = nextDirection;
      lastTime = time;
      lastMode = deltaMode;
      if (kind === 'notch') return direction;
      if (consumed) return 0;
      distance += Math.abs(deltaY);
      if (distance < TRACKPAD_THRESHOLD_PX) return 0;
      consumed = true;
      return direction;
    },
    reset,
  };
}
