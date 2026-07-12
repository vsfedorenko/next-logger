# @vsfedorenko/next-logger

[![npm version](https://img.shields.io/npm/v/@vsfedorenko/next-logger.svg)](https://www.npmjs.com/package/@vsfedorenko/next-logger)
[![CI](https://github.com/vsfedorenko/next-logger/actions/workflows/ci.yml/badge.svg)](https://github.com/vsfedorenko/next-logger/actions/workflows/ci.yml)

> Languages: **English** | [Русский](README.ru.md) | [中文](README.zh.md)

A **universal logging kit for Next.js**.

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

## License

MIT
