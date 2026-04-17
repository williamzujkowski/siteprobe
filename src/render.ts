/**
 * Terminal output renderer for probe results.
 *
 * Glyph mode on TTY, ASCII in CI/pipes. Honors NO_COLOR convention.
 *
 * @module render
 */

import type { BatchResult, ProbeResult } from './types.js';

export interface RenderOptions {
  /** Force TTY glyph mode regardless of environment. */
  readonly tty?: boolean;
  /** Disable color codes. */
  readonly noColor?: boolean;
}

/** Format a single probe result as a single-line status string. */
export function renderResult(result: ProbeResult, opts: RenderOptions = {}): string {
  const tty = opts.tty ?? process.stdout.isTTY === true;
  const noColor = opts.noColor ?? process.env['NO_COLOR'] !== undefined;
  const useGlyphs = tty && !noColor;

  const glyph = result.ok
    ? color(useGlyphs, '\x1b[32m', '✓')
    : color(useGlyphs, '\x1b[31m', '✗');
  const asciiMarker = result.ok ? '[ ok  ]' : '[FAIL ]';
  const marker = useGlyphs ? glyph : asciiMarker;

  const target = padRight(result.target, 40);
  const duration = formatDuration(result.durationMs);
  const detail = buildDetail(result);

  return `${marker} ${target} ${duration.padStart(7)} ${detail}`;
}

/** Render full batch summary. */
export function renderBatch(batch: BatchResult, opts: RenderOptions = {}): string {
  const lines = batch.results.map((r) => renderResult(r, opts));
  const summary = `\n${batch.okCount}/${batch.results.length} ok · ${formatDuration(batch.totalDurationMs)} total`;
  return lines.join('\n') + summary;
}

/** Render as JSON (for piping/scripting). */
export function renderJson(batch: BatchResult): string {
  return JSON.stringify(batch, null, 2);
}

/** Build the per-result detail string (status, TLS, error). */
function buildDetail(r: ProbeResult): string {
  if (!r.ok) {
    const category = r.errorCategory ?? 'unknown';
    const err = r.error ?? '';
    return `${category}${err.length > 0 ? `: ${truncate(err, 50)}` : ''}`;
  }
  const parts: string[] = [];
  if (r.httpStatus !== undefined) parts.push(`HTTP ${String(r.httpStatus)}`);
  if (r.tls !== undefined) {
    const tls = r.tls;
    if (tls.daysUntilExpiry !== undefined) {
      parts.push(`TLS ${tls.valid ? 'valid' : 'warn'} (${String(tls.daysUntilExpiry)}d)`);
    }
  }
  return parts.join(' · ');
}

function color(enabled: boolean, code: string, text: string): string {
  return enabled ? `${code}${text}\x1b[0m` : text;
}

function padRight(s: string, len: number): string {
  return s.length >= len ? s : s + ' '.repeat(len - s.length);
}

function truncate(s: string, len: number): string {
  return s.length <= len ? s : s.slice(0, len - 1) + '…';
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${String(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
