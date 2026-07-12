# Example — basic Next.js app

A minimal Next.js 16 (App Router, Turbopack) app showing the two-step setup:

1. **`next.config.ts`** — `withLogger({ consola: { level: 4 } })(nextConfig)`
2. **`instrumentation.ts`** — `init()` patches `console.*`

Then every `console.*` call (server-side) flows through a single
level-controllable [consola](https://github.com/unjs/consola) sink. Next.js'
own internal logs are captured too — they funnel through `console.*`.

The `/client` route demonstrates client-side logging via the
`@vsfedorenko/next-logger/browser` subpath.

## Run

```sh
# from the example directory
npm install
npm run dev      # http://localhost:3000
```

Visit `/`, `/api/hello`, and `/client` — watch the **server terminal** for
structured logs (pretty text by default).

## JSON output (production-style)

```sh
LOG_FORMAT=json npm run build && LOG_FORMAT=json npm start
```

Each log line is newline-delimited JSON:

```json
{"level":"info","type":"log","tag":"console","msg":"API /api/hello hit","date":"2026-07-12T10:00:00.000Z"}
```

Lines carrying Next.js' marker symbols (`▲ ✓ ⚠ ● ✗`) are tagged `next.js`;
your own `console.*` output is tagged `console`.
