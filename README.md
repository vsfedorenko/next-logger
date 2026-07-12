# @vsfedorenko/next-logger

[![npm version](https://img.shields.io/npm/v/@vsfedorenko/next-logger.svg)](https://www.npmjs.com/package/@vsfedorenko/next-logger)

> Languages: **English** | [Русский](README.ru.md) | [中文](README.zh.md)

A **universal logging kit for Next.js**.

Monkeypatches Next.js' internal logger (`next/dist/build/output/log`) **and**
the global `console.*` so all diagnostic output flows through a single
level-controllable sink — [consola](https://github.com/unjs/consola) by default,
with pluggable reporters for **Sentry**, structured **JSON**, and more — without
a custom Next.js server.

Inspired by [`sainsburys-tech/next-logger`](https://github.com/sainsburys-tech/next-logger),
which does the same with [pino](https://getpino.io). This package swaps pino
for consola as the default backend and adds a reporter API so logs can be
fanned out to any integration (Sentry breadcrumbs, JSON aggregators, …).

## Install

```sh
bun add @vsfedorenko/next-logger consola
# or
npm install @vsfedorenko/next-logger consola
```

`consola` is a peer dependency — install it alongside this package.

## Usage

### Option A — Instrumentation hook (recommended)

```ts
// instrumentation.ts (project root)
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@vsfedorenko/next-logger");
  }
}
```

The default import applies both patches: Next.js' logger **and** the global
`console.*`.

### Option B — `-r` preload

```sh
node -r @vsfedorenko/next-logger server.js
```

### Patch Next only (leave `console` untouched)

```ts
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@vsfedorenko/next-logger/presets/next-only");
  }
}
```

Useful when you want Next's internal logs routed through consola but prefer
native `console.*` formatting (e.g. in development).

### Browser / Client Components

The main entry (`@vsfedorenko/next-logger`) imports the patch modules, which
depend on `require.cache` and `lilconfig` — neither exists in a browser bundle.
For Client Components or any browser-side code, use the
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
resolution: `LOG_LEVEL` → `NEXT_PUBLIC_LOG_LEVEL` → `3`), without the
server-side patching machinery. For build-time-inlined levels visible in the
browser bundle, use `NEXT_PUBLIC_LOG_LEVEL`.

## Configuration

Optional config file (discovered from cwd upward via
[lilconfig](https://github.com/antonk52/lilconfig)). Supported filenames:

- `next-logger.config.ts` / `next-logger.config.js` / `next-logger.config.cjs`
- `.next-loggerrc.ts` / `.next-loggerrc.js` / `.next-loggerrc.cjs`
- `.next-loggerrc` (JSON)
- `.next-loggerrc.json`
- `next-logger` key in `package.json`

**TypeScript configs** (`.ts`) are loaded via [jiti](https://github.com/unjs/jiti).
Install it as an optional peer dependency:

```sh
bun add -d jiti   # or: npm install -D jiti
```

### Custom consola instance

```ts
// next-logger.config.ts
import { createConsola } from "consola";

export default {
  consola: createConsola({ level: 4 }),
};
```

### Partial options (merged with defaults)

```ts
import type { ConsolaOptions } from "consola";

export default {
  consola: { level: 4, formatOptions: { date: false } } satisfies Partial<ConsolaOptions>,
};
```

### Factory (receives the library defaults)

```ts
import type { ConsolaOptions } from "consola";
import { createConsola } from "consola";

export default {
  consola: (defaults: Partial<ConsolaOptions>) =>
    createConsola({ ...defaults, level: 5 }),
};
```

## Log level

Without a config file, the level resolves from (in order):

1. `LOG_LEVEL` (numeric or named)
2. `NEXT_PUBLIC_LOG_LEVEL` (numeric or named)

Falling back to `3` (info).

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
{"level":"error","type":"error","tag":"next.js","msg":"failed to compile","date":"2026-07-11T13:43:10.712Z"}
```

Each line contains:

| Field   | Description                                                                  |
|---------|------------------------------------------------------------------------------|
| `level` | Named level (`error`/`warn`/`info`/`debug`/`trace`)                          |
| `type`  | Consola log type (e.g. `error`, `warn`, `info`, `success`, `ready`, `event`) |
| `tag`   | The consola tag (`next.js`, `console`, `app`, …)                             |
| `msg`   | The message string (multi-arg strings joined with space)                     |
| `date`  | ISO 8601 timestamp                                                           |
| `args`  | Additional structured arguments (omitted when none)                          |

Errors are serialised as `{ name, message, stack }`. Circular references become
`[Circular]`. BigInts become strings.

Only applies to the server entry (`@vsfedorenko/next-logger`) — the browser
entry always uses consola's built-in browser reporter. A custom consola instance
from a config file bypasses format selection entirely.

## How it works

1. **Next.js logger patch** (`patches/next.ts`) — replaces the methods exported
   by `next/dist/build/output/log` (`wait`, `error`, `warn`, `ready`, `info`,
   `event`, `trace`) with bound consola methods tagged `next.js`. Preserves the
   critical Next 13+ workaround: since Next defines these exports as
   non-configurable accessors, the patch replaces `require.cache[...].exports`
   with a shallow copy, then redefines each method on the copy.

2. **Console patch** (`patches/console.ts`) — overwrites
   `console.{log,debug,info,warn,error}` with bound consola methods tagged
   `console`. `log` and `info` both map to consola `info`.

Both patches share a single consola instance built by `logger.ts`, so the log
level is controllable from one place.

### Empty-message skipping

Both patches skip printing when a message is **empty** — no arguments, or only
`undefined`/`null`/`""` (values that carry no diagnostic value and would render
as a bare tag line under consola). This mirrors Next.js' own behaviour, where
`prefixedLog` drops the prefix when the message is empty.

Falsy-but-present values (`0`, `false`) are **not** considered empty and are
printed normally.

## Differences from `sainsburys-tech/next-logger`

| Concern           | sainsburys-tech (pino)                        | this package (consola)                          |
|-------------------|-----------------------------------------------|-------------------------------------------------|
| Backend           | pino (JSON to stdout)                         | consola (pretty by default)                     |
| Arg normalisation | custom `hooks.logMethod`                      | not needed — consola handles console-style args |
| Child logger      | `logger.child({ name })`                      | `consola.withTag(tag)`                          |
| Custom backend    | any logger with `.child()` (pino, winston, …) | consola instances / options only                |
| `trace` level     | falls back to `debug` (Winston has no trace)  | native — consola has `trace`                    |
| Default level     | hardcoded `debug`                             | env-driven (`LOG_LEVEL`)                        |
| Language          | plain JS (CommonJS)                           | TypeScript (CJS output)                         |

## License

MIT
