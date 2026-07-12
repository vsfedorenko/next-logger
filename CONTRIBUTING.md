# Contributing

Thanks for your interest in contributing! This is a small project — no bureaucracy, just keep it clean and tested.

## Dev setup

```sh
git clone https://github.com/vsfedorenko/next-logger.git
cd next-logger
npm install
```

## Project structure

```
src/
  config.ts          — reads NEXT_LOGGER_CONFIG env (build-time inlined)
  withLogger.ts      — config wrapper HOF (serialises options into env key)
  init.ts            — runtime init: buildLogger + patchConsole
  logger.ts          — builds the shared consola instance
  defaults.ts        — level/format resolution from env
  reporters/json.ts  — NDJSON reporter for structured logging
  patches/console.ts — console.* sink interceptor
  patches/next.ts    — isNextLog classifier (▲/✓/⚠/●/✗ markers)
  browser.ts         — client-side entry (no patching, env-driven consola)
e2e/                 — real Next 16 Turbopack app + driver tests
examples/basic/      — runnable example app
```

## Commands

```sh
npm test              # unit tests (vitest)
npm run test:e2e      # e2e on real Next 16 app (installs fixture deps, builds, serves)
npm run build         # tsc → dist/
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
3. If you changed interception/patching logic, run `npm run test:e2e` too.
4. Keep PRs small and focused — one feature or fix per PR.

## Reporting bugs

Use the GitHub issue templates. Include your Next.js version, next-logger version, and bundler (Turbopack/webpack). Set `LOG_FORMAT=json` and include the relevant log output.
