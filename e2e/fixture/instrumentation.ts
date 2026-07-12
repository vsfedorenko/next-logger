/**
 * Instrumentation hook — initialises @vsfedorenko/next-logger in the Node.js
 * server runtime. This is what patches Next's internal logger and `console.*`.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { init } = await import("@vsfedorenko/next-logger");
    await init();
  }
}
