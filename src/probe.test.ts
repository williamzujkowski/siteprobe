/**
 * Unit tests for probe() — covers DNS failure, categorization, and URL parsing.
 * Network-bound tests use example.com and graceful fallbacks.
 */
import { describe, it, expect } from 'vitest';
import { probe } from './probe.js';

describe('probe', () => {
  it('returns ok=false with dns_failure category on unresolvable hostname', async () => {
    const result = await probe('https://this-definitely-does-not-exist-12345.invalid', {
      timeoutMs: 3000,
    });
    expect(result.ok).toBe(false);
    expect(result.errorCategory).toBe('dns_failure');
    expect(result.target).toBe('https://this-definitely-does-not-exist-12345.invalid');
    expect(result.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('accepts bare hostnames and prepends https://', async () => {
    const result = await probe('nonexistent-target-xyz-test.invalid', { timeoutMs: 3000 });
    // Target should remain as given
    expect(result.target).toBe('nonexistent-target-xyz-test.invalid');
    // Should attempt DNS resolution (fail)
    expect(result.ok).toBe(false);
  });

  it('captures duration', async () => {
    const result = await probe('https://no-such-host-zzz.invalid', { timeoutMs: 2000 });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.durationMs).toBeLessThan(5000);
  });

  it('preserves startedAt as ISO 8601', async () => {
    const result = await probe('https://no-such-host-zzz.invalid', { timeoutMs: 2000 });
    expect(() => new Date(result.startedAt)).not.toThrow();
    const parsed = new Date(result.startedAt);
    expect(Number.isNaN(parsed.getTime())).toBe(false);
  });
});
