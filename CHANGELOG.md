# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — 2026-07-12

### Changed

- **Breaking:** completely new API — `withLogger()` config wrapper + `init()` call replace bare-import side-effect, `-r` preload, and presets
- **Breaking:** config delivered via `NEXT_LOGGER_CONFIG` env (Next's validated `env` key) instead of lilconfig config files
- **Breaking:** interception moved from `require.cache` module patching to `console.*` sink wrapping
- **Breaking:** `next` is no longer a peer dependency (zero Next.js internal imports)
- `isNextLog` classifier tags `▲/✓/⚠/●/✗` marker lines as `next.js`, others as `console`
- `withLogger` generic constraint relaxed from `Record<string, unknown>` to `object` for Next.js `NextConfig` compatibility

### Added

- `withLogger()` — idiomatic config wrapper (like `withPWA`)
- `init()` — runtime initialisation (patches `console.*`)
- `getLogger()` — access the shared consola instance
- `isNextLog()` — exported Next-log classifier
- E2E test suite on a real Next 16 Turbopack app (4 tests)
- Runnable example app (`examples/basic/`)
- CI workflow, Dependabot, issue templates, PR template, CONTRIBUTING.md
- Russian and Chinese README translations

### Removed

- Bare-import side-effect (`await import("next-logger")`)
- `-r` preload support
- `presets/` subpaths (`next-only`, `all`)
- Config file discovery (`next-logger.config.ts`, `.next-loggerrc`, `package.json` key)
- `lilconfig` and `jiti` dependencies
- `require.cache`-based module monkeypatching
- `patchNext` / `routeNextMethod` (dead under Turbopack)

## [0.1.0] — 2026-07-12

### Added

- Initial release
- `require.cache`-based Next.js logger patching + `console.*` wrapping
- lilconfig config file discovery with jiti TypeScript support
- consola backend with JSON reporter
- presets: `all` (default), `next-only`
- Browser subpath (`/browser`) for client components
- npm publish workflow with provenance

[0.2.0]: https://github.com/vsfedorenko/next-logger/releases/tag/v0.2.0
[0.1.0]: https://github.com/vsfedorenko/next-logger/releases/tag/v0.1.0
