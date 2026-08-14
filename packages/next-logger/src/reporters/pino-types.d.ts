/**
 * Ambient declaration for the optional `pino` peer dependency.
 *
 * `pino` is listed as an optional peer dependency in package.json — consumers
 * that don't use pino don't install it, so it's not available during this
 * package's own build. This minimal ambient module satisfies TypeScript's
 * dynamic-import resolution (`import("pino")`) without pulling the real
 * package into the dev dependency tree.
 *
 * At runtime, the dynamic import resolves to the consumer's installed copy of
 * `pino`, or rejects if the package is absent (the reporter catches that and
 * becomes a no-op).
 *
 * This file is an ambient module definition (not an augmentation) — it must
 * be a top-level `.d.ts` with no imports/exports of its own so TypeScript
 * treats it as a module declaration rather than an augmentation.
 */
declare module "pino" {
  /**
   * A pino logger instance — the subset of level methods this reporter calls.
   * Defined locally to avoid importing from `pino` at build time.
   */
  export interface PinoLogger {
    error(msg: string, ...args: unknown[]): void;
    error(obj: Record<string, unknown>, msg?: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    warn(obj: Record<string, unknown>, msg?: string, ...args: unknown[]): void;
    info(msg: string, ...args: unknown[]): void;
    info(obj: Record<string, unknown>, msg?: string, ...args: unknown[]): void;
    debug(msg: string, ...args: unknown[]): void;
    debug(obj: Record<string, unknown>, msg?: string, ...args: unknown[]): void;
    trace(msg: string, ...args: unknown[]): void;
    trace(obj: Record<string, unknown>, msg?: string, ...args: unknown[]): void;
  }

  /**
   * `pino()` factory options — the subset relevant to this reporter. Any
   * consumer-supplied options are forwarded verbatim to the real `pino()`
   * call at runtime.
   */
  export interface PinoOptions {
    name?: string;
    level?: string;
    [key: string]: unknown;
  }

  /**
   * The `pino` default export is a factory: `pino(options?) → PinoLogger`.
   */
  function pino(options?: PinoOptions): PinoLogger;
  export default pino;
}
