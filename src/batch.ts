/**
 * Concurrent batch probe runner with bounded parallelism.
 *
 * @module batch
 */

import type { BatchResult, ProbeOptions, ProbeResult } from './types.js';
import { probe } from './probe.js';

/** Default maximum concurrent probes. */
const DEFAULT_CONCURRENCY = 10;

/** Options for batch execution. */
export interface BatchOptions extends ProbeOptions {
  /** Maximum concurrent probes (default: 10). */
  readonly concurrency?: number;
  /** Optional progress callback. */
  readonly onProgress?: (result: ProbeResult, done: number, total: number) => void;
}

/**
 * Run probes against a list of targets concurrently.
 *
 * Uses a bounded worker pool to limit parallelism. Returns when all probes
 * have completed (successfully or with error). Individual probe failures do
 * not abort the batch.
 */
export async function runBatch(
  targets: readonly string[],
  options: BatchOptions = {}
): Promise<BatchResult> {
  const startedAt = new Date().toISOString();
  const startTime = performance.now();
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  const results = new Array<ProbeResult>(targets.length);

  let nextIndex = 0;
  let completed = 0;

  const worker = async (): Promise<void> => {
    while (nextIndex < targets.length) {
      const i = nextIndex++;
      const target = targets[i];
      if (target === undefined) continue;
      const result = await probe(target, options);
      results[i] = result;
      completed++;
      options.onProgress?.(result, completed, targets.length);
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, targets.length) }, () => worker());
  await Promise.all(workers);

  const finalResults = results.filter((r): r is ProbeResult => r !== undefined);
  const okCount = finalResults.filter((r) => r.ok).length;
  return {
    results: finalResults,
    totalDurationMs: Math.round(performance.now() - startTime),
    okCount,
    failCount: finalResults.length - okCount,
    startedAt,
  };
}
