# Contributing

Thanks for your interest in contributing! This is a small project — no bureaucracy, just keep it clean and tested.

## Dev setup

```sh
git clone https://github.com/vsfedorenko/next-logger.git
cd next-logger
npm install
```

## Project structure

Layered — dependencies point **down only**:

```
src/
  index.ts            — server entry (public barrel)
  browser.ts          — client-side entry (no patching, env-driven consola)
  init.ts             — runtime init: buildLogger + capture + patchConsole
  log-viewer.ts       — dev viewer facade (pinned): handler + public API
  viewer/             — viewer internals: ring-buffer store, reporter, HTML
  core/               — kernel: Logger interface, backend registry factory,
                         log-method wrapping, arg splitting, level clamping,
                         env defaults. Imports NOTHING internal.
  config/             — build-time + runtime config pipeline: withLogger
                         (serialises into NEXT_LOGGER_CONFIG env), config.ts
                         (reads/resolves it), plugins.ts (reporter/preset
                         registries), logger.ts (builds the instance)
  backends/           — consola (default), pino, winston adapters
  reporters/          — json, redaction, datadog, otlp, pino, sentry,
                         batching skeleton, optional-import memoizer
  patches/            — stdout/stderr capture, console.* interceptor,
                         Next.js log classifier
  features/           — metadata, sampling, request-scoped logging,
                         correlation IDs (wrap a Logger, depend on core only)
e2e/                 — real Next 16 Turbopack apps + driver tests
examples/basic/      — runnable example app
```

Import rules: `core` → (nothing internal); `config`/`backends`/`reporters`/`patches`/`features` → `core` + same layer; entries (`index`, `init`, `browser`, `log-viewer`) → everything. Public entry files and the `backends/`/`reporters/` directories are **pinned** by the package `exports` map — moving them breaks consumers.

## Commands

```sh
npm test              # unit tests (vitest)
bun run test:e2e      # e2e on real Next 16 apps (bun workspaces fixtures: consola + pino)
bun run build         # tsc → packages/next-logger/dist/
```

## Code style

- TypeScript strict mode. No `as any`, `@ts-ignore`, or `@ts-expect-error`.
- Match existing patterns — read the file before editing.
- Keep changes minimal and focused. A bug fix shouldn't refactor surrounding code.

## Commit conventions

Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `ci:`, `refactor:`). Look at `git log` for examples.

## Pull requests

1. Fork and branch from `main`.
2. Run `npm test` before submitting.
3. If you changed interception/patching logic, run `bun run test:e2e` too.
4. Keep PRs small and focused — one feature or fix per PR.

## Reporting bugs

Use the GitHub issue templates. Include your Next.js version, next-logger version, and bundler (Turbopack/webpack). Set `LOG_FORMAT=json` and include the relevant log output.
