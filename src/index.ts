/**
 * siteprobe — fast, concurrent endpoint health checker.
 *
 * Library entry point. For CLI usage, see `siteprobe` binary.
 *
 * @example
 * ```ts
 * import { probe, runBatch } from 'siteprobe';
 *
 * const result = await probe('https://example.com');
 * console.log(result.ok, result.httpStatus);
 *
 * const batch = await runBatch(['https://a.com', 'https://b.com']);
 * console.log(`${batch.okCount}/${batch.results.length} ok`);
 * ```
 *
 * @module siteprobe
 */

export { probe } from './probe.js';
export { runBatch, type BatchOptions } from './batch.js';
export { renderResult, renderBatch, renderJson, type RenderOptions } from './render.js';
export type { ProbeResult, ProbeOptions, BatchResult } from './types.js';
