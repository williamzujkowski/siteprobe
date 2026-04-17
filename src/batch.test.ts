/**
 * Tests for runBatch — concurrency, progress callback, counting.
 */
import { describe, it, expect, vi } from 'vitest';
import { runBatch } from './batch.js';

describe('runBatch', () => {
  it('runs multiple targets and aggregates results', async () => {
    const targets = [
      'https://host-a-nonexistent-xyz.invalid',
      'https://host-b-nonexistent-xyz.invalid',
      'https://host-c-nonexistent-xyz.invalid',
    ];
    const batch = await runBatch(targets, { timeoutMs: 2000, concurrency: 3 });
    expect(batch.results).toHaveLength(3);
    expect(batch.failCount).toBe(3);
    expect(batch.okCount).toBe(0);
    expect(batch.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('calls onProgress for each probe', async () => {
    const onProgress = vi.fn();
    const targets = [
      'https://x1-nonexistent.invalid',
      'https://x2-nonexistent.invalid',
    ];
    await runBatch(targets, { timeoutMs: 2000, concurrency: 2, onProgress });
    expect(onProgress).toHaveBeenCalledTimes(2);
    // Each call: (result, done, total)
    const lastCall = onProgress.mock.calls[onProgress.mock.calls.length - 1];
    expect(lastCall?.[2]).toBe(2);
  });

  it('handles empty target list', async () => {
    const batch = await runBatch([], { timeoutMs: 1000 });
    expect(batch.results).toHaveLength(0);
    expect(batch.okCount).toBe(0);
    expect(batch.failCount).toBe(0);
  });

  it('respects concurrency=1 serial execution', async () => {
    const targets = [
      'https://serial-a.invalid',
      'https://serial-b.invalid',
    ];
    const batch = await runBatch(targets, { timeoutMs: 2000, concurrency: 1 });
    expect(batch.results).toHaveLength(2);
  });

  it('preserves result order matching input order', async () => {
    const targets = [
      'https://order-1.invalid',
      'https://order-2.invalid',
      'https://order-3.invalid',
    ];
    const batch = await runBatch(targets, { timeoutMs: 2000, concurrency: 3 });
    expect(batch.results[0]?.target).toBe('https://order-1.invalid');
    expect(batch.results[1]?.target).toBe('https://order-2.invalid');
    expect(batch.results[2]?.target).toBe('https://order-3.invalid');
  });
});
