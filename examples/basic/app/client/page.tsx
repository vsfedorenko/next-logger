"use client";

import { useState } from "react";
import { logger } from "@vsfedorenko/next-logger/browser";

/**
 * Client Component — uses the `/browser` subpath, which provides a consola
 * instance with env-driven defaults (NEXT_PUBLIC_LOG_LEVEL) and no server-side
 * patching machinery.
 */
export default function ClientCounter() {
  const [count, setCount] = useState(0);

  function click() {
    const next = count + 1;
    logger.info(`button clicked — count is now ${next}`);
    if (next === 5) logger.warn("you clicked 5 times!");
    setCount(next);
  }

  return (
    <main>
      <h1>Client-side logging</h1>
      <p>Open the browser console — logs go there via consola.</p>
      <p>Count: {count}</p>
      <button onClick={click}>click me</button>
    </main>
  );
}
