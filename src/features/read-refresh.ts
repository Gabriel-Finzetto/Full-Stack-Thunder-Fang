/** Coordinates background GETs: one request at a time, visible-only and with bounded retries. */
export function createReadRefresh(
  read: () => Promise<boolean>,
  options: { active(): boolean; interval?: number; retry?: number; maxRetry?: number; minGap?: number },
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | undefined;
  let stopped = false, queued = false, failures = 0, lastStarted = -Infinity;
  const cancelTimer = () => { clearTimeout(timer); timer = undefined; };
  const schedule = (delay: number) => {
    cancelTimer();
    if (!stopped && options.active()) timer = setTimeout(() => { timer = undefined; void request(); }, delay);
  };
  function request(force = false): Promise<void> {
    if (stopped || !options.active()) { cancelTimer(); return Promise.resolve(); }
    if (running) { if (force) queued = true; return running; }
    const gap = (options.minGap ?? 400) - (Date.now() - lastStarted);
    if (!force && gap > 0) {
      // Focus and visibility often arrive together. Do not turn that burst
      // into a second read immediately after a successful one.
      if (!timer) schedule(options.interval ?? 30_000);
      return Promise.resolve();
    }
    cancelTimer();
    running = (async () => {
      do {
        queued = false;
        if (stopped || !options.active()) break;
        lastStarted = Date.now();
        let success = false;
        try { success = await read(); } catch { /* Reads recover through the same bounded retry policy. */ }
        failures = success ? 0 : failures + 1;
      } while (queued && !stopped);
    })().finally(() => {
      running = undefined;
      schedule(failures ? Math.min(options.maxRetry ?? 60_000, (options.retry ?? 5_000) * 2 ** Math.min(failures - 1, 5)) : options.interval ?? 30_000);
    });
    return running;
  }
  return { request, stop() { stopped = true; queued = false; cancelTimer(); } };
}

export function visibleAndOnline() {
  return document.visibilityState === 'visible' && navigator.onLine !== false;
}
