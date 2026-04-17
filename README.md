# siteprobe

Fast, concurrent endpoint health checker with rich terminal output.

Checks HTTP status, response time, TLS certificate expiry, and DNS resolution in parallel. Designed for operators who need a quick "is everything up?" check across a fleet of services.

## Install

```sh
npm install -g siteprobe
```

Or run directly with npx:

```sh
npx siteprobe check https://example.com
```

## Usage

### Basic CLI

```sh
# Check one endpoint
siteprobe check https://example.com

# Check multiple (concurrent)
siteprobe check https://api.example.com https://db.example.com https://cdn.example.com

# JSON output for scripting
siteprobe check --json https://example.com

# Custom timeout and concurrency
siteprobe check --timeout 10000 --concurrency 20 [urls...]

# From a config file
siteprobe check --config ./siteprobe.json
```

### Config file

A JSON file with a `targets` array:

```json
{
  "targets": [
    "https://example.com",
    "https://api.example.com:8080/health",
    "https://internal.example.com"
  ]
}
```

### Expected output

TTY mode with glyphs:

```
✓ https://example.com                       122ms HTTP 200 · TLS valid (75d)
✓ https://api.example.com                   101ms HTTP 200 · TLS valid (47d)
✗ https://broken.example.com               5000ms timeout

2/3 ok · 5.1s total
```

CI/pipe mode (ASCII, no color):

```
[ ok  ] https://example.com                       122ms HTTP 200 · TLS valid (75d)
[ ok  ] https://api.example.com                   101ms HTTP 200 · TLS valid (47d)
[FAIL ] https://broken.example.com               5000ms timeout

2/3 ok · 5.1s total
```

### Exit codes

- `0` — all probes succeeded
- `1` — one or more probes failed
- `2` — usage error (bad flags, no targets)

Use in scripts and CI:

```sh
siteprobe check --config ./endpoints.json || {
  echo "One or more endpoints down" >&2
  exit 1
}
```

## Library API

```ts
import { probe, runBatch } from 'siteprobe';

// Single probe
const result = await probe('https://example.com', {
  timeoutMs: 5000,
  tlsWarnDays: 30,
});
console.log(result.ok, result.httpStatus, result.tls?.daysUntilExpiry);

// Batch with concurrency
const batch = await runBatch(['https://a.com', 'https://b.com'], {
  concurrency: 10,
  onProgress: (r, done, total) => {
    process.stdout.write(`[${done}/${total}] ${r.target}: ${r.ok ? 'ok' : 'fail'}\n`);
  },
});
console.log(`${batch.okCount}/${batch.results.length} ok in ${batch.totalDurationMs}ms`);
```

## Options

| Flag | Default | Description |
|---|---|---|
| `--timeout <ms>` | 5000 | Per-probe timeout in milliseconds |
| `--concurrency <n>` | 10 | Maximum concurrent probes |
| `--tls-warn-days <n>` | 30 | Warn if TLS cert expires within N days |
| `--method <GET\|HEAD>` | GET | HTTP method |
| `--expect <code>` | 200-399 | Expected HTTP status code |
| `--json` | false | Output as JSON |
| `--no-color` | false | Disable ANSI colors |

## Environment

- `NO_COLOR` — disables color output (standard convention)

## What it checks

For each target:

- **DNS resolution** — can we resolve the hostname? How many addresses?
- **HTTP status** — did the server respond with the expected code?
- **Response time** — total wall-clock probe duration in milliseconds
- **TLS certificate** — valid? When does it expire? (warns if within `--tls-warn-days`)
- **Error category** — structured classification: `timeout`, `dns_failure`, `connection_refused`, `tls_expired`, `http_error`, `unknown`

## Why siteprobe?

- **Zero dependencies** — pure Node.js stdlib (dns, https). No npm bloat.
- **Fast** — bounded concurrency, per-probe timeouts, no sequential waiting.
- **Structured output** — JSON mode for scripting; glyph/ASCII auto-detection.
- **Honest errors** — categorized, not just string-matched.
- **Small** — about 500 lines including tests.

## License

MIT
