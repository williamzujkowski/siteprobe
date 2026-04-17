/**
 * Core probe logic.
 *
 * Resolves DNS, issues an HTTP request, and extracts TLS certificate info
 * for a single endpoint. All probes are bounded by a per-probe timeout and
 * return a structured `ProbeResult` — no exceptions thrown to callers.
 *
 * @module probe
 */

import { lookup } from 'node:dns/promises';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import { request as httpRequest } from 'node:http';
import type { TLSSocket } from 'node:tls';
import type { ProbeOptions, ProbeResult } from './types.js';

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_TLS_WARN_DAYS = 30;
const DEFAULT_USER_AGENT = 'siteprobe/1.0';

/**
 * Probe a single HTTP(S) endpoint.
 *
 * Returns a `ProbeResult` capturing DNS resolution, HTTP status, TLS
 * certificate details, and timing. Never throws.
 */
export async function probe(target: string, options: ProbeOptions = {}): Promise<ProbeResult> {
  const startedAt = new Date().toISOString();
  const startTime = performance.now();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const url = parseTarget(target);
    const dnsResult = await resolveDns(url.hostname, timeoutMs);

    if (!dnsResult.resolved) {
      return {
        target,
        ok: false,
        dns: dnsResult,
        durationMs: Math.round(performance.now() - startTime),
        error: `DNS resolution failed for ${url.hostname}`,
        errorCategory: 'dns_failure',
        startedAt,
      };
    }

    const httpResult = await httpProbe(url, options, timeoutMs);
    const durationMs = Math.round(performance.now() - startTime);
    return {
      target,
      ok: isOkStatus(httpResult.status, options.expectedStatus),
      httpStatus: httpResult.status,
      dns: dnsResult,
      ...(httpResult.tls !== undefined ? { tls: httpResult.tls } : {}),
      durationMs,
      startedAt,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      target,
      ok: false,
      durationMs: Math.round(performance.now() - startTime),
      error: msg,
      errorCategory: categorizeError(msg),
      startedAt,
    };
  }
}

/** Parse a target string into a URL. Accepts bare hostnames (defaults to https). */
function parseTarget(target: string): URL {
  if (/^https?:\/\//.test(target)) return new URL(target);
  // Bare hostname → prepend https://
  return new URL(`https://${target}`);
}

interface DnsInfo {
  readonly resolved: boolean;
  readonly addresses: readonly string[];
  readonly durationMs: number;
}

/** Resolve DNS with timing. */
async function resolveDns(hostname: string, timeoutMs: number): Promise<DnsInfo> {
  const start = performance.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    const results = await lookup(hostname, { all: true });
    clearTimeout(timer);
    return {
      resolved: true,
      addresses: results.map((r) => r.address),
      durationMs: Math.round(performance.now() - start),
    };
  } catch {
    return {
      resolved: false,
      addresses: [],
      durationMs: Math.round(performance.now() - start),
    };
  }
}

interface HttpProbeResult {
  readonly status: number;
  readonly tls?: ProbeResult['tls'];
}

/** Issue an HTTP(S) request and extract TLS cert if available. */
function httpProbe(url: URL, options: ProbeOptions, timeoutMs: number): Promise<HttpProbeResult> {
  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === 'https:';
    const reqFn = isHttps ? httpsRequest : httpRequest;
    const reqOptions: RequestOptions = {
      method: options.method ?? 'GET',
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      timeout: timeoutMs,
      headers: { 'User-Agent': options.userAgent ?? DEFAULT_USER_AGENT },
    };

    const req = reqFn(reqOptions, (res) => {
      res.resume(); // discard body
      const status = res.statusCode ?? 0;
      const tls = isHttps
        ? extractTlsInfo(res.socket as TLSSocket, options.tlsWarnDays ?? DEFAULT_TLS_WARN_DAYS)
        : undefined;
      resolve(tls !== undefined ? { status, tls } : { status });
    });

    req.on('timeout', () => {
      req.destroy(new Error('Request timeout'));
    });
    req.on('error', (e) => {
      reject(e);
    });
    req.end();
  });
}

/** Extract TLS certificate info from a TLS socket. */
function extractTlsInfo(
  socket: TLSSocket,
  warnDays: number
): NonNullable<ProbeResult['tls']> | undefined {
  try {
    const cert = socket.getPeerCertificate();
    if (cert === undefined || Object.keys(cert).length === 0) return undefined;

    const validTo = new Date(cert.valid_to);
    const now = new Date();
    const daysUntilExpiry = Math.floor((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    const base = {
      valid: socket.authorized && daysUntilExpiry > 0,
      validFrom: cert.valid_from,
      validTo: cert.valid_to,
      daysUntilExpiry,
    };
    const issuer = typeof cert.issuer?.CN === 'string' ? cert.issuer.CN : undefined;
    const subject = typeof cert.subject?.CN === 'string' ? cert.subject.CN : undefined;
    // Soft warn by not marking valid when expiry is within warnDays
    if (daysUntilExpiry <= warnDays && daysUntilExpiry > 0) {
      return {
        ...base,
        valid: false,
        ...(issuer !== undefined ? { issuer } : {}),
        ...(subject !== undefined ? { subject } : {}),
      };
    }
    return {
      ...base,
      ...(issuer !== undefined ? { issuer } : {}),
      ...(subject !== undefined ? { subject } : {}),
    };
  } catch {
    return undefined;
  }
}

/** Check if HTTP status code matches expected. */
function isOkStatus(
  status: number,
  expected: ProbeOptions['expectedStatus']
): boolean {
  if (expected === undefined) return status >= 200 && status < 400;
  if (typeof expected === 'number') return status === expected;
  return expected.includes(status);
}

/** Categorize an error message into a structured category. */
function categorizeError(msg: string): NonNullable<ProbeResult['errorCategory']> {
  const m = msg.toLowerCase();
  if (m.includes('timeout') || m.includes('timed out')) return 'timeout';
  if (m.includes('enotfound') || m.includes('eai_again')) return 'dns_failure';
  if (m.includes('econnrefused')) return 'connection_refused';
  if (m.includes('cert') && (m.includes('expired') || m.includes('has expired'))) return 'tls_expired';
  if (m.includes('http')) return 'http_error';
  return 'unknown';
}
