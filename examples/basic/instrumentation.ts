/**
 * Step 2 — call `init()` from the instrumentation hook.
 *
 * This patches `console.*` (the sink that Next.js' own internal logger also
 * funnels through), so all diagnostic output flows through a single
 * level-controllable consola instance.
 *
 * The Node.js guard keeps the patch server-side only.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { init } = await import("@vsfedorenko/next-logger");
    init();
  }
}
