import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReadRefresh } from '../src/features/read-refresh';

afterEach(() => { vi.useRealTimers(); });

describe('automatic read refresh', () => {
  it('coalesces simultaneous focus events and recent settled reads without canceling the active request', async () => {
    vi.useFakeTimers();
    let complete!: (success: boolean) => void;
    const read = vi.fn(() => new Promise<boolean>(resolve => { complete = resolve; }));
    const refresh = createReadRefresh(read, { active: () => true });
    const first = refresh.request();
    expect(refresh.request()).toBe(first);
    expect(refresh.request()).toBe(first);
    expect(read).toHaveBeenCalledTimes(1);
    complete(true); await first;
    await refresh.request();
    await vi.advanceTimersByTimeAsync(29_999);
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(2);
    refresh.stop(); complete(true); await vi.runOnlyPendingTimersAsync();
  });

  it('retries failed reads with bounded backoff and returns to the normal cadence after recovery', async () => {
    vi.useFakeTimers();
    const read = vi.fn().mockResolvedValue(false);
    const refresh = createReadRefresh(read, { active: () => true });
    await refresh.request();
    for (const delay of [5_000, 10_000, 20_000, 40_000, 60_000, 60_000]) {
      const before = read.mock.calls.length;
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(read.mock.calls.length).toBe(before);
      await vi.advanceTimersByTimeAsync(1);
      expect(read.mock.calls.length).toBe(before + 1);
    }
    read.mockResolvedValue(true);
    await refresh.request(true);
    const recovered = read.mock.calls.length;
    await vi.advanceTimersByTimeAsync(29_999);
    expect(read.mock.calls.length).toBe(recovered);
    await vi.advanceTimersByTimeAsync(1);
    expect(read.mock.calls.length).toBe(recovered + 1);
    refresh.stop();
  });

  it('does not read while hidden/offline and wakes when the connection returns', async () => {
    vi.useFakeTimers();
    let active = true;
    const read = vi.fn().mockResolvedValue(true);
    const refresh = createReadRefresh(read, { active: () => active });
    await refresh.request();
    active = false;
    await vi.advanceTimersByTimeAsync(120_000);
    await refresh.request(true);
    expect(read).toHaveBeenCalledTimes(1);
    active = true;
    await refresh.request(true);
    expect(read).toHaveBeenCalledTimes(2);
    refresh.stop();
  });

  it('reconciles an explicit mutation notification after a pending read, never in parallel', async () => {
    vi.useFakeTimers();
    let finish!: (success: boolean) => void;
    const read = vi.fn().mockImplementationOnce(() => new Promise<boolean>(resolve => { finish = resolve; })).mockResolvedValue(true);
    const refresh = createReadRefresh(read, { active: () => true });
    const pending = refresh.request();
    void refresh.request(true);
    void refresh.request(true);
    expect(read).toHaveBeenCalledTimes(1);
    finish(true); await pending;
    expect(read).toHaveBeenCalledTimes(2);
    refresh.stop();
    await vi.advanceTimersByTimeAsync(120_000);
    await refresh.request(true);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('recovers a thrown transport failure without an unhandled rejection', async () => {
    vi.useFakeTimers();
    const read = vi.fn().mockRejectedValueOnce(new Error('network unavailable')).mockResolvedValue(true);
    const refresh = createReadRefresh(read, { active: () => true });
    await expect(refresh.request()).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(read).toHaveBeenCalledTimes(2);
    refresh.stop();
  });
});
