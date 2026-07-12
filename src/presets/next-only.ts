/**
 * Preset: patch Next.js' logger **only**, leaving the global `console.*`
 * untouched.
 *
 * Import `next-log/presets/next-only` instead of the default entry when you
 * want Next's internal logs routed through consola but prefer to keep
 * `console.log`/`console.error` with their native Node.js formatting (e.g. for
 * terminal-pretty output in development).
 */

import "../patches/next";

export {};
