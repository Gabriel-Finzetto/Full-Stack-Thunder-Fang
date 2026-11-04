'use client';

import { useEffect, type RefObject } from 'react';
import { useMotionValue, useMotionValueEvent, useSpring, type MotionValue } from 'motion/react';

interface CanMotionOptions {
  track: RefObject<HTMLDivElement | null>;
  progress: MotionValue<number>;
  disabled: boolean;
}

const normalizedProgress = (value: number) => {
  if (!Number.isFinite(value) || value <= 1 / 300) return 0;
  return value >= 299 / 300 ? 1 : Math.max(0, Math.min(1, value));
};

/** Native scroll always determines the pose; revisiting the section replays it. */
export function useCanMotion({ track, progress, disabled }: CanMotionOptions) {
  const target = useMotionValue(0);
  const smooth = useSpring(target, { stiffness: 100, damping: 26, mass: 1, restDelta: .001, restSpeed: .01 });
  useMotionValueEvent(smooth, 'change', latest => {
    if (disabled) return;
    const value = Number.isFinite(latest) ? Math.max(0, Math.min(1, latest)) : 0;
    progress.set(value);
    if (track.current) track.current.dataset.scrollProgress = value.toFixed(5);
  });

  useEffect(() => {
    const element = track.current;
    const sticky = element?.firstElementChild;
    if (!element || !(sticky instanceof HTMLElement)) return;
    let frame: number | undefined;
    let top = 0, distance = 0;
    const read = () => normalizedProgress(distance > 0 ? (top - element.getBoundingClientRect().top) / distance : 0);
    const snap = (value: number) => {
      target.jump(value);smooth.jump(value);progress.jump(value);
      element.dataset.scrollProgress = value.toFixed(5);
    };
    element.dataset.motionInput = 'scroll';
    if (disabled) { snap(0); return; }

    // Read native document scrolling directly: some engines expose a timeline
    // without updating its value. The existing spring and poses stay identical.
    const reconcile = () => {
      frame = undefined;
      if (document.visibilityState !== 'hidden') target.set(read());
    };
    const schedule = () => { if (frame === undefined) frame = requestAnimationFrame(reconcile); };
    const measure = () => {
      top = Math.max(0,parseFloat(getComputedStyle(sticky).top) || 0);
      distance = element.getBoundingClientRect().height - sticky.getBoundingClientRect().height;
      schedule();
    };
    measure();snap(read());
    const observer = new ResizeObserver(measure);
    observer.observe(element);observer.observe(sticky);
    const navigation = document.querySelector('header')?.parentElement;
    if (navigation) observer.observe(navigation);
    window.addEventListener('scroll',schedule,{passive:true});
    window.addEventListener('resize',measure);
    window.addEventListener('pageshow',measure);
    document.addEventListener('visibilitychange',measure);
    return () => {
      observer.disconnect();if (frame !== undefined) cancelAnimationFrame(frame);
      window.removeEventListener('scroll',schedule);window.removeEventListener('resize',measure);
      window.removeEventListener('pageshow',measure);document.removeEventListener('visibilitychange',measure);
    };
  }, [track, progress, target, smooth, disabled]);
}
