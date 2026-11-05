// All four fixed cans follow one shared, three-step elliptical turn.
export const CAN_WOBBLE_PHASES = [0, 0, 0, 0] as const;
export const CAN_SCROLL_STEPS = 3;
export function orbitProgressFromBounds(top: number, height: number, viewportHeight: number) {
  if (!Number.isFinite(top) || !Number.isFinite(height) || !Number.isFinite(viewportHeight)) return 0;
  const distance = height - viewportHeight;
  return distance > 0 ? Math.max(0, Math.min(1, -top / distance)) : 0;
}

function boundedProgress(progress: number) {
  return Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
}

// The three scroll stops are left (1/3), right (2/3), and neutral (1).
// X and Y follow an ellipse around the fixed pivot. Temporal easing belongs to
// the shared MotionValue driver; these functions add no clock or inertia.
function ellipseAngle(progress: number) {
  const bounded = boundedProgress(progress);
  if (bounded === 0 || bounded === 1) return 0;
  return bounded * Math.PI * 2;
}

// The optional phase remains accepted for callers of the former staggered
// motion; it intentionally has no effect so every flavour stays synchronized.
export function canTiltX(progress: number, _phase = 0) {
  return (1 - Math.cos(ellipseAngle(progress))) * 3;
}

export function canTiltY(progress: number, _phase = 0) {
  return Math.sin(ellipseAngle(progress)) * (26 / Math.sin(Math.PI * 2 / 3));
}

export function canTiltZ(progress: number, _phase = 0) {
  return Math.sin(ellipseAngle(progress));
}
