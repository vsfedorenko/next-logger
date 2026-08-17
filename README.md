# @vsfedorenko/next-logger

[![npm version](https://img.shields.io/npm/v/@vsfedorenko/next-logger.svg)](https://www.npmjs.com/package/@vsfedorenko/next-logger)
[![npm downloads](https://img.shields.io/npm/dm/@vsfedorenko/next-logger.svg)](https://www.npmjs.com/package/@vsfedorenko/next-logger)
[![CI](https://github.com/vsfedorenko/next-logger/actions/workflows/ci.yml/badge.svg)](https://github.com/vsfedorenko/next-logger/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/npm/l/@vsfedorenko/next-logger.svg)](./LICENSE)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@vsfedorenko/next-logger)](https://bundlephobia.com/package/@vsfedorenko/next-logger)

> Languages: **English** | [Русский](README.ru.md) | [中文](README.zh.md)

A **universal structured logging kit for Next.js** — patches Next.js'
internal logger and the global `console.*` sink, routing all server-side
output through a single level-controllable [consola](https://github.com/unjs/consola)
instance with pluggable reporters for structured **JSON logging**, **Sentry**,
and beyond. Works with the App Router, Turbopack, and Node.js
instrumentation — no custom server, no module monkey-patching.

Wraps the global `console.*` — the same sink Next.js' own internal logger
funnels through — so all diagnostic output flows through a single
level-controllable [consola](https://github.com/unjs/consola) instance, with
pluggable reporters for structured **JSON** and more. No custom server, no
module monkey-patching (which is unreachable under Turbopack anyway).

Inspired by [`sainsburys-tech/next-logger`](https://github.com/sainsburys-tech/next-logger),
which does the same with [pino](https://getpino.io). This package swaps pino
for consola and delivers configuration through an idiomatic `withLogger()`
config wrapper.

## Install

```sh
npm install @vsfedorenko/next-logger consola
# or
bun add @vsfedorenko/next-logger consola
```

`consola` is a peer dependency — install it alongside this package.

## Quick start

Two steps.

**1. Wrap your Next.js config** (`next.config.ts`):

```ts
import { withLogger } from "@vsfedorenko/next-logger";

export default withLogger({ consola: { level: 4 } })({
  // ...your other next config
});
```

**2. Call `init()` from instrumentation** (`instrumentation.ts`, project root):

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { init } = await import("@vsfedorenko/next-logger");
    init();
  }
}
```

Done. Every `console.*` call on the server now flows through consola. Next.js'
own logs (build output, route compilation, etc.) are captured too — they share
the same `console.*` sink.

> A runnable example app lives in [`examples/basic/`](examples/basic/).

## Configuration

`withLogger(options)` serialises `options` into the `NEXT_LOGGER_CONFIG`
environment variable via Next.js' validated `env` config key — inlined at
build time, read back at runtime. No "Unrecognized key" warning, works under
both webpack and Turbopack.

```ts
withLogger({
  consola: {
    level: 4,                          // debug
    formatOptions: { date: false },    // consola format options
  },
})
```

Only serialisable consola options are supported (`level`, `formatOptions`, …).

### Skip console patching

`init({ console: false })` builds the logger without wrapping `console.*`.
Use this if you want the configured consola instance (via `getLogger()`) for
manual logging but prefer to leave the global `console` untouched.

## Custom backend

`@vsfedorenko/next-logger` is backend-agnostic. The default backend is
`consola`, but you can register your own logging backend adapter — winston,
pino, loglevel, or anything that satisfies the `Logger` interface.

Register your own logging backend:

```ts
import { defineBackend, withLogger } from "@vsfedorenko/next-logger";

defineBackend("winston", (opts) => {
  const winston = createMyWinstonLogger(opts);
  return {
    level: winston.level,
    trace: (...a) => winston.verbose(...a),
    debug: (...a) => winston.debug(...a),
    info: (...a) => winston.info(...a),
    warn: (...a) => winston.warn(...a),
    error: (...a) => winston.error(...a),
    fatal: (...a) => winston.error(...a),
    log: (...a) => winston.info(...a),
    withTag: (tag) => winston.child({ tag }),
  };
});

// Use it:
withLogger({ backend: "winston" })({
  // ...your next config
});
```

### Built-in backends

| Backend   | Package  | Description                                                   |
|-----------|----------|---------------------------------------------------------------|
| `consola` | `consola`| Default — pretty output, pluggable reporters (JSON, Sentry).  |
| `pino`    | `pino`   | JSON-first, high performance. Optional peer dependency.       |
| `winston` | `winston`| Versatile, transport-based. Optional peer dependency.         |

Use `backend` in `withLogger` to select:

```ts
withLogger({ backend: "pino", backendOptions: { name: "api" } })
```

## Log level

The level resolves in order:

1. `consola.level` from `withLogger`
2. `LOG_LEVEL` (numeric or named)
3. `NEXT_PUBLIC_LOG_LEVEL` (numeric or named)
4. `3` (info) — default

Named levels: `silent` (-∞), `fatal` (0), `error` (0), `warn` (1),
`log` (2), `info` (3), `success` (3), `debug` (4), `trace` (5), `verbose` (∞).

## Log format

Server-side output format, controlled by env var:

1. `LOG_FORMAT` (`text` or `json`)
2. `NEXT_PUBLIC_LOG_FORMAT` (same values)

Falling back to `text` (consola's default pretty reporter).

### `text` (default)

Human-readable, coloured in TTY, with timestamps — consola's built-in reporter.
Best for local development.

### `json`

Newline-delimited JSON to stdout (errors → stderr), suitable for structured-log
aggregators (Loki, Datadog, CloudWatch, Elasticsearch). Best for production.

```json
{"level":"info","type":"log","tag":"console","msg":"API /api/hello hit","date":"2026-07-12T10:00:00.000Z"}
```

Each line contains:

| Field   | Description                                                                  |
|---------|------------------------------------------------------------------------------|
| `level` | Named level (`error`/`warn`/`info`/`debug`/`trace`)                          |
| `type`  | Consola log type (e.g. `error`, `warn`, `info`, `success`, `ready`, `event`) |
| `tag`   | The consola tag (`next.js`, `console`, …)                                    |
| `msg`   | The message string (multi-arg strings joined with space)                     |
| `date`  | ISO 8601 timestamp                                                            |
| `args`  | Additional structured arguments (omitted when none)                          |

Errors are serialised as `{ name, message, stack }`. Circular references become
`[Circular]`. BigInts become strings.

## Redaction

The **redaction reporter** is a middleware that strips sensitive data from log
entries before they reach a wrapped reporter. It protects every downstream
sink — JSON, pretty console, Sentry breadcrumb — with a single decorator.

```ts
// instrumentation.ts
import { init, getLogger, createJsonReporter, createRedactionReporter } from "@vsfedorenko/next-logger";

init();
const logger = getLogger();

const json = createJsonReporter();
const redacting = createRedactionReporter({ reporter: json });
logger.setReporters([redacting]);
```

Two redaction strategies run together:

1. **Pattern-based** — regexes matched against every string in a log entry
   (string args, error messages, object values). Ships with sensible defaults:
   emails, credit-card numbers, JWT tokens, and long hex/base64 API keys.

2. **Key-based** — when a plain-object arg contains a key whose name matches a
   known sensitive key (`password`, `token`, `apiKey`, …), the value is
   replaced, regardless of type. The original log object is never mutated — a
   sanitised shallow copy is forwarded.

| Input                                                | Output                                                       |
|------------------------------------------------------|--------------------------------------------------------------|
| `logger.info("ping admin@example.com")`              | `ping [REDACTED]`                                            |
| `logger.info("user", { name: "alice", password: "x" })` | `user` + `{ name: "alice", password: "[REDACTED]" }`     |

### Options

| Option        | Type                 | Default              | Description                                                |
|---------------|----------------------|----------------------|------------------------------------------------------------|
| `reporter`    | `ConsolaReporter`    | *(required)*         | The wrapped reporter that receives sanitised log objects.  |
| `patterns`    | `(RegExp \| string)[]` | built-in defaults  | Regex patterns applied to strings. Replaces the defaults.  |
| `keys`        | `string[]`           | built-in defaults    | Sensitive object-key names (case-insensitive substring).   |
| `replacement` | `string`             | `"[REDACTED]"`       | Replacement text for every match.                          |

```ts
// Custom patterns + keys + replacement
const redacting = createRedactionReporter({
  reporter: createJsonReporter(),
  patterns: [/ORD-\d{6}/g],        // order numbers only (replaces defaults)
  keys: ["ssn", "taxId"],          // replaces default keys
  replacement: "***",
});
```

Pass `patterns` or `keys` to **replace** the defaults (merging is intentional
opt-in — a caller that supplies them owns the full set).

## Pino

The **pino reporter** bridges every consola log entry into a
[pino](https://getpino.io) logger. For teams already invested in pino —
transports, destinations, pipelines, tooling — it lets `next-logger` feed
pino without giving up consola's level control, console patching, or other
reporters. Consola remains the single sink; pino becomes one of its outputs.

```ts
// instrumentation.ts
import { init, getLogger } from "@vsfedorenko/next-logger";
import { createPinoReporter } from "@vsfedorenko/next-logger/reporters/pino";

init();
const logger = getLogger();
logger.addReporter(createPinoReporter({ options: { name: "api" } }));
```

`pino` is an **optional** peer dependency — install it only when you use this
reporter:

```sh
npm install pino
```

If `pino` isn't installed, the reporter resolves its dynamic import once,
caches the failure, and becomes a silent no-op — safe to attach
unconditionally.

Consola log levels map onto pino levels as follows:

| Consola level             | Pino level |
|---------------------------|------------|
| `error` / `fatal` (0)     | `error`    |
| `warn` (1)                | `warn`     |
| `log` (2)                 | `info`     |
| `info` / `success` (3)    | `info`     |
| `debug` (4)               | `debug`    |
| `trace` / `verbose` (5)   | `trace`    |

Each entry is forwarded as `logger.<level>(mergeContext, msg)`:

- **`msg`** — string arguments and `logObj.message` joined into the primary
  message.
- **`tag`** — the consola tag, passed as a `tag` field in the merge context.
- **structured args** — `Error` instances (`{ name, message, stack }`) and
  plain objects are merged into the context keyed by argument position.

### Options

| Option    | Type            | Default      | Description                                                       |
|-----------|-----------------|--------------|-------------------------------------------------------------------|
| `options` | `PinoOptions`   | *(none)*     | Options forwarded to the lazily-resolved `pino()` factory.        |
| `logger`  | `PinoLogger`    | *(none)*     | A pre-built pino instance. Skips the factory call when supplied.  |

Pass `options` to let the reporter build its own pino logger, or `logger` to
inject one you've already configured (transports, destinations, custom
levels). The two are mutually exclusive — `logger` wins.

## Winston

The **winston backend** replaces the default consola sink with a
[winston](https://github.com/winstonjs/winston) logger. For teams already
invested in winston — transports, formats, custom levels, log files — it lets
`next-logger` route all output through winston directly. Winston becomes the
single sink instead of consola.

```ts
// instrumentation.ts
import { init } from "@vsfedorenko/next-logger";
import { registerWinstonBackend } from "@vsfedorenko/next-logger/backends/winston";

registerWinstonBackend();
init();
```

Select the backend in your Next config:

```ts
// next.config.ts
import { withLogger } from "@vsfedorenko/next-logger";

withLogger({ backend: "winston", backendOptions: { level: "info" } })({
  // ...your next config
});
```

`winston` is an **optional** peer dependency — install it only when you use
this backend:

```sh
npm install winston
```

If `winston` isn't installed, the adapter throws a clear error with install
instructions when the backend is selected.

Consola log levels map onto winston levels as follows:

| Consola level             | Winston level |
|---------------------------|---------------|
| `error` / `fatal` (0)     | `error`       |
| `warn` (1)                | `warn`        |
| `log` (2)                 | `info`        |
| `info` / `success` (3)    | `info`        |
| `debug` (4)               | `debug`       |
| `trace` / `verbose` (5)   | `verbose`     |

All arguments are passed through to the underlying winston level method
verbatim — no serialisation or string-joining is applied, so winston's own
formatting, splat handling, and transport pipelines receive the original
values.

`withTag(tag)` creates a child logger via `winston.child({ tag })`, carrying
the tag as a persistent binding on every subsequent log entry.

## Datadog

The **Datadog Logs reporter** batches log entries and ships them to the
[Datadog Logs intake](https://docs.datadoghq.com/logs/log_collection/?tab=http) over plain `fetch` — **zero dependencies**: no `@datadog/*` packages are installed or required. The API key is read from the environment (`DATADOG_API_KEY` / `DD_API_KEY`) at reporter creation, never from config.

```ts
// instrumentation.ts
import { init, getLogger } from "@vsfedorenko/next-logger";
import { createDatadogLogsReporter } from "@vsfedorenko/next-logger/reporters/datadog";

init();
const logger = getLogger();
logger.addReporter(
  createDatadogLogsReporter({
    service: "my-next-app",
    env: process.env.NODE_ENV,
    ddtags: "team:web",
  }),
);
```

Entries buffer and flush when `batchSize` entries accumulate or every
`flushIntervalMs` — whichever comes first. The reporter exposes an
explicit `flush()` — call it from a shutdown hook (`SIGTERM`, serverless
freeze) so entries buffered below the threshold are shipped instead of
lost at process exit. Failures never throw from `log()`: a failed batch
is dropped with a single stderr warning. Without an API key the reporter
warns once and becomes a silent no-op.

### Options

| Option             | Type     | Default                                          | Description                                          |
|--------------------|----------|--------------------------------------------------|------------------------------------------------------|
| `site`             | string   | `datadoghq.com`                                  | Datadog site — the `<site>` in `http-intake.logs.<site>`. |
| `service`          | string   | *(none)*                                         | The `service` attribute on every entry.              |
| `env`              | string   | *(none)*                                         | Added as `env:<value>` tag on every entry.           |
| `ddtags`           | string   | *(none)*                                         | Comma-separated `key:value` tags on every entry.     |
| `intakeUrl`        | string   | `https://http-intake.logs.<site>/api/v2/logs`   | Full intake URL override (self-hosted / tests).      |
| `batchSize`        | number   | `50`                                             | Entries per flush batch.                             |
| `flushIntervalMs`  | number   | `5000`                                           | Max wait before a partial batch flushes.             |

## OpenTelemetry (OTLP)

The **OTLP logs reporter** batches log records and ships them to any
OpenTelemetry Collector via OTLP/HTTP JSON (`/v1/logs`) over plain `fetch`
— **zero dependencies**: no `@opentelemetry/*` packages are installed or
required. The endpoint is resolved from the spec-defined environment
variables at reporter creation, never from config.

```ts
// instrumentation.ts
import { init, getLogger } from "@vsfedorenko/next-logger";
import { createOtlpLogsReporter } from "@vsfedorenko/next-logger/reporters/otlp";

init();
const logger = getLogger();
logger.addReporter(
  createOtlpLogsReporter({
    serviceName: "my-next-app", // or set OTEL_SERVICE_NAME
  }),
);
```

Environment resolution (spec-compliant):

| Variable                            | Meaning                                            |
|-------------------------------------|----------------------------------------------------|
| `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`  | Full logs endpoint, wins over the generic base.     |
| `OTEL_EXPORTER_OTLP_ENDPOINT`       | Generic base — `/v1/logs` is appended per spec.     |
| `OTEL_SERVICE_NAME`                 | Resource `service.name` when `serviceName` is unset.|

Entries map to OTLP `LogRecord`s: consola's numeric level becomes
`severityNumber`/`severityText`, string args join into `body`, `Error`
args land as structured `exception` attributes, and `service.name` rides
the resource. Records buffer and flush when `batchSize` accumulate or
every `flushIntervalMs`; the explicit `flush()` ships tail records from a
shutdown hook. Failures never throw from `log()`: a failed batch is
dropped with a single stderr warning. Without an endpoint the reporter
warns once and becomes a silent no-op.

### Options

| Option                | Type     | Default                          | Description                                       |
|-----------------------|----------|----------------------------------|---------------------------------------------------|
| `endpoint`            | string   | *(env resolution)*               | Full collector endpoint override.                 |
| `serviceName`         | string   | `OTEL_SERVICE_NAME`              | Resource `service.name`.                          |
| `resourceAttributes`  | object   | *(none)*                         | Extra resource attributes.                        |
| `scopeName`           | string   | `@vsfedorenko/next-logger`       | Scope name for the emitted `scopeLogs`.           |
| `headers`             | object   | *(none)*                         | Extra headers (vendor gateway auth etc.).         |
| `batchSize`           | number   | `50`                             | Records per flush batch.                          |
| `flushIntervalMs`     | number   | `5000`                           | Max wait before a partial batch flushes.          |

## Browser / Client Components

The server entry patches `console.*`, which only makes sense in Node.js. For
Client Components or any browser-side code, use the
**`@vsfedorenko/next-logger/browser`** subpath:

```ts
"use client";
import { logger } from "@vsfedorenko/next-logger/browser";

export function MyComponent() {
  logger.info("rendered");
  logger.warn("deprecation notice");
  return <div>…</div>;
}
```

This entry builds a consola instance from env-driven defaults (same level
resolution: `LOG_LEVEL` → `NEXT_PUBLIC_LOG_LEVEL` → `3`), without any
server-side patching. For build-time-inlined levels visible in the browser
bundle, use `NEXT_PUBLIC_LOG_LEVEL`.

## How it works

1. **Config wrapper** (`withLogger`, build time) — serialises logger options
   into `NEXT_LOGGER_CONFIG` via Next's `env` key. Next inlines this at build
   time, so the runtime reads it as `process.env.NEXT_LOGGER_CONFIG` with no
   file-system or Next.js-internal imports.

2. **Console-sink patch** (`patches/console.ts`, runtime) — wraps
   `console.{log,debug,info,warn,error}` so every call routes through the
   shared consola instance. `log` and `info` both map to consola `info`.

3. **Next-log classifier** (`patches/next.ts`, runtime) — inspects each
   `console.*` call: if the first argument carries a Next.js marker symbol
   (`▲`, `✓`, `⚠`, `●`, `✗`, …) the line is tagged `next.js`; otherwise it's
   tagged `console`. This works under Turbopack, where the old
   `require.cache`-based monkeypatch is dead (Next's logger lives in a separate
   bundled instance).

### Empty-message skipping

The patch skips printing when a message is **empty** — no arguments, or only
`undefined`/`null`/`""` (values that carry no diagnostic value and would
render as a bare tag line under consola). This mirrors Next.js' own behaviour,
where `prefixedLog` drops the prefix when the message is empty.

Falsy-but-present values (`0`, `false`) are **not** considered empty and are
printed normally.

### Turbopack note

Next.js' **startup banner** (`▲ Next.js`, `✓ Ready`, …) prints *before* the
instrumentation hook runs, so those specific lines are not captured. Any log
emitted after boot — route compilation, request-time output, your own
`console.*` calls — flows through the patch normally.

## Log sampling

High-volume loggers (per-request logs, hot-loop debug traces, chatty
dependencies) can drown a log aggregator. Log sampling drops a deterministic
fraction of log calls so you see a representative sample instead of every
single entry.

### `LOG_SAMPLE_RATE`

Set `LOG_SAMPLE_RATE` (a float between `0.0` and `1.0`) to configure the
default sampling ratio. The default is `1.0` — log everything.

```bash
# Keep ~10% of sampled log calls.
LOG_SAMPLE_RATE=0.1 next dev
```

Resolve the configured rate at runtime:

```ts
import { resolveSampleRate } from "@vsfedorenko/next-logger";

const rate = resolveSampleRate(); // 0.1 (or 1.0 when unset)
```

### `sampleLogger`

Wrap any {@link Logger} so each log call is sampled at the given rate. The
returned logger preserves `withTag` — a child logger is sampled independently
with its own counter, so tagging doesn't change the effective ratio.

```ts
import { getLogger, sampleLogger } from "@vsfedorenko/next-logger";

// Keep ~10% of entries from a noisy logger.
const noisy = sampleLogger(getLogger(), 0.1);

noisy.info("request handled", { path: "/healthz" });
noisy.withTag("db").debug("query"); // still ~10%
```

### `createSamplingWrapper`

For non-logger use cases, `createSamplingWrapper` returns a low-level sampler
you can wrap any side-effecting function in. Sampling is **deterministic**
(counter-based, no RNG): `rate = 0.1` calls the wrapped function exactly once
every 10 invocations, so the long-run ratio tracks the target exactly and
tests are reproducible.

```ts
import { createSamplingWrapper } from "@vsfedorenko/next-logger";

const sample = createSamplingWrapper(0.1); // keep 1 in 10
sample(() => sendAnalytics("pageview"));
```

| `rate` | behaviour                                   |
|--------|---------------------------------------------|
| `≥ 1`  | always calls                                |
| `≤ 0`  | never calls                                 |
| `0–1`  | deterministic fraction (e.g. `0.1` → 1/10)  |

## Correlation IDs

Every request gets a unique correlation ID (or reuses the one carried by the
`X-Request-ID` header) that flows through the same `AsyncLocalStorage` used by
the request-scoped logger — so it appears in every log entry for that request
with zero manual threading.

### `correlationMiddleware`

Drop-in Next.js middleware that reads `X-Request-ID` (generating a UUIDv4 when
missing) and establishes the active log context for the downstream handler.

```ts
// middleware.ts
import { correlationMiddleware } from "@vsfedorenko/next-logger";

export const middleware = correlationMiddleware();
export const config = { matcher: ["/((?!_next).*)"] };
```

Downstream route handlers can read the ID directly:

```ts
import { getCorrelationId } from "@vsfedorenko/next-logger";

export function GET() {
  const id = getCorrelationId(); // "3f2504e0-..."
  return Response.json({ ok: true, correlationId: id });
}
```

Because the ID is stored in the `LogContext`, `createRequestLogger`
automatically appends it to every log entry — no extra wiring.

### `getOrCreateCorrelationId`

Returns the correlation ID for the current scope, generating and caching a
UUIDv4 when none exists yet. Repeat calls within the same scope return the
same value.

```ts
import { runWithLogContext, getOrCreateCorrelationId } from "@vsfedorenko/next-logger";

runWithLogContext({}, () => {
  const id = getOrCreateCorrelationId(); // generated + cached
  const again = getOrCreateCorrelationId(); // same id
});
```

### `setCorrelationId` / `getCorrelationId`

Explicit access. `setCorrelationId` writes into the active scope (must be
called inside `runWithLogContext`); `getCorrelationId` is read-only and
returns `null` when no scope is active.

```ts
import { runWithLogContext, setCorrelationId, getCorrelationId } from "@vsfedorenko/next-logger";

runWithLogContext({}, () => {
  setCorrelationId("my-trace-id");
  getCorrelationId(); // "my-trace-id"
});

getCorrelationId(); // null (no scope)
```

| Function                  | Generates? | Behaviour when no scope active            |
|---------------------------|------------|-------------------------------------------|
| `getCorrelationId`        | no         | returns `null`                            |
| `getOrCreateCorrelationId`| yes        | returns an ephemeral UUID (not persisted) |
| `setCorrelationId`        | n/a        | throws                                    |

## Structured metadata

Attach a fixed bag of structured fields to every log entry produced by a
logger, without threading them into every call site by hand. This is the
`logger.with({ requestId, userId })` fluent API — a base context that every
downstream log call inherits.

### `withMetadata`

Wrap any `Logger` so each log call carries the metadata:

```ts
import { getLogger, withMetadata } from "@vsfedorenko/next-logger";

const logger = withMetadata(getLogger(), { requestId: "abc", userId: 42 });

logger.info("processing");          // → info("processing", { requestId: "abc", userId: 42 })
logger.info("done", { ms: 12 });     // → info("done", { requestId: "abc", userId: 42, ms: 12 })
logger.withTag("db").info("query");  // child logger preserves the metadata
```

**Merge rules** (applied to each argument):

| Argument type             | Behaviour                                                            |
|---------------------------|----------------------------------------------------------------------|
| String / number / boolean | Metadata appended as a trailing object argument                      |
| Plain object              | Metadata keys merged in (per-call keys override metadata on collision) |
| `Error` / `Date` / array  | Forwarded verbatim; metadata appended as a trailing object argument  |
| Empty metadata `{}`       | Arguments forwarded unchanged (no trailing object)                   |

`withTag(tag)` returns a **child logger that preserves the metadata** — tagging
never drops the base context. The original argument and metadata objects are
never mutated; new objects are produced per call.

### `LOG_METADATA` / `resolveMetadataFromEnv`

Set deployment-wide metadata (service name, version, region) once via the
`LOG_METADATA` environment variable — a JSON object:

```bash
# Apply at boot without touching application code.
LOG_METADATA='{"service":"api","version":"1.0"}' next start
```

```ts
import { getLogger, withMetadata, resolveMetadataFromEnv } from "@vsfedorenko/next-logger";

const logger = withMetadata(getLogger(), resolveMetadataFromEnv());
logger.info("boot"); // → info("boot", { service: "api", version: "1.0" })
```

`resolveMetadataFromEnv()` is non-fatal: a missing, empty, malformed, or
non-object value (arrays, primitives) returns `{}` rather than crashing boot.

## Differences from `sainsburys-tech/next-logger`

| Concern           | sainsburys-tech (pino)                        | this package (consola)                          |
|-------------------|-----------------------------------------------|-------------------------------------------------|
| Backend           | pino (JSON to stdout)                         | consola (pretty by default)                     |
| Config delivery   | `next-logger.config.js` + preload             | `withLogger()` wrapper (idiomatic, type-safe)   |
| Interception      | patches `next/dist/build/output/log`          | wraps `console.*` sink (Turbopack-safe)         |
| Arg normalisation | custom `hooks.logMethod`                      | not needed — consola handles console-style args |
| Child logger      | `logger.child({ name })`                      | `consola.withTag(tag)`                          |
| `trace` level     | falls back to `debug` (Winston has no trace)  | native — consola has `trace`                    |
| Default level     | hardcoded `debug`                             | env-driven (`LOG_LEVEL`)                        |
| Turbopack         | `require.cache` patch breaks                  | console-sink — works                            |
| Language          | plain JS (CommonJS)                           | TypeScript (CJS output)                         |

## Contributing

Contributions are welcome! Please read the [Contributing guide](./CONTRIBUTING.md)
for the dev setup, project structure, and conventions before opening a pull
request. By participating you agree to follow the
[Code of Conduct](./CODE_OF_CONDUCT.md).

## License

MIT
