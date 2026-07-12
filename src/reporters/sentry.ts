/**
 * Sentry breadcrumb reporter for consola — mirrors every browser log entry
 * into Sentry as a **breadcrumb**.
 *
 * Breadcrumbs are NOT events — they don't create issues or cost anything on
 * their own. They attach as context to the next real error captured by
 * Sentry, giving you the full log trail that led to a crash.
 *
 * ## Optional dependency
 *
 * `@sentry/nextjs` is an **optional** peer dependency. The reporter resolves
 * it lazily via dynamic `import()` inside `log()`. If the consumer hasn't
 * installed `@sentry/nextjs`, the import rejects, the reporter catches it,
 * and subsequent calls become a silent no-op — the logger keeps working.
 *
 * ## Usage
 *
 * ```ts
 * // instrumentation-client.ts (or sentry.client.config.ts)
 * import { logger } from "@vsfedorenko/next-logger/browser";
 * import { createSentryBreadcrumbReporter } from "@vsfedorenko/next-logger/reporters/sentry";
 *
 * Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN });
 * logger.addReporter(createSentryBreadcrumbReporter());
 * ```
 *
 * Attach AFTER `Sentry.init` so the lazily-resolved client is ready. Safe to
 * attach unconditionally — `addBreadcrumb` is a no-op when no DSN is set.
 */

import type { ConsolaReporter, LogObject } from "consola";

/// <reference path="./sentry-types.d.ts" />

/**
 * Sentry severity levels, ordered from highest to lowest.
 *
 * Mirrored here (not imported from `@sentry/nextjs`) so this module has **zero
 * static dependency** on Sentry — the type alias is compile-time only and
 * erased in the output.
 */
type SeverityLevel = "fatal" | "error" | "warning" | "log" | "info" | "debug";

/**
 * Map consola's numeric level to Sentry's breadcrumb severity.
 *
 * Consola: 0=error/fatal, 1=warn, 2=log, 3=info, 4=debug, 5=trace/verbose.
 *
 * `fatal` and `error` both collapse to Sentry `error` — breadcrumbs are
 * diagnostic context, not standalone error events. Real error capture goes
 * through `captureException` / `onRequestError`.
 */
const SEVERITY_MAP: readonly SeverityLevel[] = [
  "error", // 0 — error / fatal
  "warning", // 1 — warn
  "log", // 2 — log
  "info", // 3 — info / success / ready
  "debug", // 4 — debug
  "debug", // 5 — trace / verbose
];

/**
 * The shape of a Sentry breadcrumb — the subset of fields this reporter
 * populates. Defined locally to avoid importing from `@sentry/nextjs`.
 */
interface SentryBreadcrumb {
  level?: SeverityLevel;
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
}

/**
 * Build a Sentry breadcrumb from a consola log object.
 *
 * Pure function — no Sentry dependency, fully testable in isolation.
 *
 * - String arguments and `logObj.message` are joined into `message`.
 * - `Error` instances go into `data` as `{ name, message }` (stack is omitted
 *   — breadcrumbs are one-line context, not stack traces).
 * - Plain objects go into `data` keyed by argument position.
 */
export function logObjectToBreadcrumb(logObj: LogObject): SentryBreadcrumb {
  const level = SEVERITY_MAP[Math.max(0, Math.min(5, logObj.level))] ?? "info";

  const args = logObj.args ?? [];
  const messageParts: string[] = [];
  const data: Record<string, unknown> = {};

  if (logObj.message) messageParts.push(logObj.message);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg instanceof Error) {
      data[`arg_${i}`] = { name: arg.name, message: arg.message };
    } else if (typeof arg === "object" && arg !== null) {
      data[`arg_${i}`] = arg;
    } else {
      messageParts.push(String(arg));
    }
  }

  return {
    level,
    category: logObj.tag || "console",
    message: messageParts.length > 0 ? messageParts.join(" ") : undefined,
    data: Object.keys(data).length > 0 ? data : undefined,
  };
}

/**
 * Cached dynamic-import result — resolved once, reused on every `log()` call.
 *
 * `null` marks a cached failure (`@sentry/nextjs` not installed) so we don't
 * retry the failing import on every log call.
 */
type SentryNs = typeof import("@sentry/nextjs");
let sentryPromise: Promise<SentryNs | null> | null = null;

/**
 * Lazily resolve the `@sentry/nextjs` module.
 *
 * The import is attempted once and cached:
 * - If the consumer has `@sentry/nextjs` installed → resolves to the module.
 * - If not installed → the rejection is caught and `null` is cached, making
 *   subsequent `log()` calls a silent no-op without retrying.
 */
function getSentry(): Promise<SentryNs | null> {
  if (sentryPromise) return sentryPromise;
  sentryPromise = import("@sentry/nextjs")
    .then((mod: SentryNs) => mod)
    .catch(() => null);
  return sentryPromise;
}

/**
 * Create a consola reporter that forwards every log entry to
 * `Sentry.addBreadcrumb`.
 *
 * The reporter is safe to attach unconditionally:
 * - `@sentry/nextjs` not installed → silent no-op (cached failed import).
 * - Installed but no DSN configured → `addBreadcrumb` is a no-op internally.
 */
export function createSentryBreadcrumbReporter(): ConsolaReporter {
  return {
    log(logObj: LogObject) {
      const crumb = logObjectToBreadcrumb(logObj);
      void getSentry().then((sentry) => sentry?.addBreadcrumb(crumb));
    },
  };
}
