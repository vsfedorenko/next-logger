/**
 * Preset: patch Next.js' logger **and** the global `console.*`.
 *
 * This is the default — importing `next-log` or `next-log/presets/all`
 * applies both patches as side effects.
 *
 * Order matters: Next's logger is patched first so its internal calls are
 * already routed through consola before `console` itself is overwritten. Both
 * patches share the same {@link logger} instance.
 */

import "../patches/next";
import "../patches/console";

export {};
