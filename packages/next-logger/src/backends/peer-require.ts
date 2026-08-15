/**
 * Shared lazy-require helper for built-in backend adapters.
 *
 * Every backend wraps an OPTIONAL peer dependency (pino, winston, …). The
 * adapter must return a Logger synchronously from `buildLogger()`, so the
 * dependency is loaded with a synchronous `require()` — lazily, only when
 * the backend is actually selected. When the package is missing, the user
 * gets a clear, actionable error naming the backend and the install command.
 */

/**
 * Synchronously load an optional peer dependency.
 *
 * `load` must contain the LITERAL `require("pkg")` call at its call site —
 * bundlers (Turbopack/webpack) statically analyze require arguments; a
 * dynamic `require(pkgName)` here would compile into a "module expression
 * too dynamic" error inside the user's build.
 *
 * @param pkgName  the npm package name ("pino", "winston", …), for the error
 * @param backendName the backend id used in error messages ("pino", …)
 * @param load     thunk performing the literal `require("pkg")`
 * @throws a clear install-instructions error when the package is missing
 */
export function requirePeerSync<T>(
  pkgName: string,
  backendName: string,
  load: () => T,
): T {
  try {
    return load();
  } catch (err) {
    throw new Error(
      `@vsfedorenko/next-logger: backend "${backendName}" requires the "${pkgName}" package. ` +
        `Install it: npm install ${pkgName}`,
      { cause: err },
    );
  }
}
