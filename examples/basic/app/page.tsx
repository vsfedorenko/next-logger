import Link from "next/link";

/**
 * Server Component — `console.*` calls here are intercepted by the patch
 * installed in `instrumentation.ts` and routed through consola tagged
 * `console`.
 */
export default function Page() {
  console.log("Server page rendered");
  console.info("This is an info log");
  console.warn("This is a warning");
  console.debug("This is a debug log (visible because level is set to 4)");

  return (
    <main>
      <h1>@vsfedorenko/next-logger — example</h1>
      <p>Check the server terminal for structured logs.</p>
      <ul>
        <li>
          <Link href="/api/hello">/api/hello</Link> — API route that logs
        </li>
        <li>
          <Link href="/client">/client</Link> — client component logging via
          the <code>/browser</code> subpath
        </li>
      </ul>
    </main>
  );
}
