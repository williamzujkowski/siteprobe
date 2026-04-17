/**
 * Tests for renderer — glyph/ASCII modes, NO_COLOR, batch summary.
 */
import { describe, it, expect } from 'vitest';
import { renderResult, renderBatch, renderJson } from './render.js';
import type { BatchResult, ProbeResult } from './types.js';

const okResult: ProbeResult = {
  target: 'https://example.com',
  ok: true,
  httpStatus: 200,
  durationMs: 123,
  startedAt: '2026-04-17T12:00:00.000Z',
  tls: {
    valid: true,
    daysUntilExpiry: 75,
    validFrom: 'Jan 1 00:00:00 2026 GMT',
    validTo: 'Jul 1 00:00:00 2026 GMT',
    issuer: 'Test CA',
    subject: 'example.com',
  },
};

const failResult: ProbeResult = {
  target: 'https://broken.invalid',
  ok: false,
  durationMs: 5000,
  startedAt: '2026-04-17T12:00:00.000Z',
  error: 'ENOTFOUND broken.invalid',
  errorCategory: 'dns_failure',
};

describe('renderResult', () => {
  it('renders ASCII marker when tty=false', () => {
    const line = renderResult(okResult, { tty: false });
    expect(line).toContain('[ ok  ]');
    expect(line).toContain('example.com');
    expect(line).toContain('HTTP 200');
    expect(line).toContain('TLS valid (75d)');
  });

  it('renders FAIL marker for failed probes', () => {
    const line = renderResult(failResult, { tty: false });
    expect(line).toContain('[FAIL ]');
    expect(line).toContain('dns_failure');
  });

  it('renders glyph when tty=true and noColor=false', () => {
    const line = renderResult(okResult, { tty: true, noColor: false });
    expect(line).toContain('✓');
    // Check for ANSI escape
    expect(line).toContain('\x1b[32m');
  });

  it('omits color when noColor=true even if tty', () => {
    const line = renderResult(okResult, { tty: true, noColor: true });
    expect(line).toContain('[ ok  ]');
    expect(line).not.toContain('\x1b[');
  });

  it('formats duration >=1s as seconds', () => {
    const slowResult = { ...okResult, durationMs: 2300 };
    const line = renderResult(slowResult, { tty: false });
    expect(line).toContain('2.3s');
  });

  it('truncates long error messages', () => {
    const long = {
      ...failResult,
      error: 'very long error message that should be truncated to fit in the terminal output cleanly',
    };
    const line = renderResult(long, { tty: false });
    expect(line).toMatch(/…/); // truncation marker
  });
});

describe('renderBatch', () => {
  it('renders summary line with ok/total counts', () => {
    const batch: BatchResult = {
      results: [okResult, failResult],
      okCount: 1,
      failCount: 1,
      totalDurationMs: 5123,
      startedAt: '2026-04-17T12:00:00.000Z',
    };
    const output = renderBatch(batch, { tty: false });
    expect(output).toContain('1/2 ok');
    expect(output).toContain('5.1s total');
  });
});

describe('renderJson', () => {
  it('produces valid parseable JSON', () => {
    const batch: BatchResult = {
      results: [okResult],
      okCount: 1,
      failCount: 0,
      totalDurationMs: 100,
      startedAt: '2026-04-17T12:00:00.000Z',
    };
    const output = renderJson(batch);
    expect(() => JSON.parse(output)).not.toThrow();
    const parsed = JSON.parse(output) as BatchResult;
    expect(parsed.okCount).toBe(1);
  });
});
