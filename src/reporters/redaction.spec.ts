import { describe, expect, it, vi } from "vitest";
import type { LogObject, ConsolaReporter } from "consola";

import {
  createRedactionReporter,
  DEFAULT_PATTERNS,
  DEFAULT_KEYS,
  DEFAULT_REPLACEMENT,
} from "./redaction";

/**
 * Redaction reporter tests.
 *
 * Two concerns:
 *   1. The built-in defaults (patterns + keys) strip common secrets.
 *   2. The reporter decorates a wrapped reporter — it forwards a sanitised
 *      copy and never mutates the original log object.
 */

// --- helpers ---------------------------------------------------------------

function makeLog(args: unknown[], opts: { tag?: string; message?: string } = {}): LogObject {
  return {
    level: 3,
    type: "info",
    tag: opts.tag ?? "app",
    args,
    date: new Date(),
    message: opts.message,
  };
}

/** A minimal sink that records every log object it receives. */
function captureReporter(): { reporter: ConsolaReporter; calls: LogObject[] } {
  const calls: LogObject[] = [];
  const reporter: ConsolaReporter = {
    log: (logObj: LogObject) => {
      calls.push(logObj);
    },
  };
  return { reporter, calls };
}

/** Resolve the single forwarded log object (asserts exactly one call). */
function forwarded(calls: LogObject[]): LogObject {
  expect(calls).toHaveLength(1);
  return calls[0]!;
}

// --- defaults --------------------------------------------------------------

describe("redaction — built-in defaults", () => {
  it("exposes sensible default patterns", () => {
    expect(DEFAULT_PATTERNS.length).toBeGreaterThanOrEqual(4);
  });

  it("exposes sensible default keys", () => {
    expect(DEFAULT_KEYS).toContain("password");
    expect(DEFAULT_KEYS).toContain("token");
  });

  it("uses [REDACTED] as the default replacement", () => {
    expect(DEFAULT_REPLACEMENT).toBe("[REDACTED]");
  });
});

// --- string-arg pattern redaction ------------------------------------------

describe("redaction — string args", () => {
  it("redacts email addresses in string args", () => {
    const { reporter, calls } = captureReporter();
    const r = createRedactionReporter({ reporter });
    r.log(makeLog(["contact admin@example.com for help"]), {} as never);

    expect(forwarded(calls).args).toEqual(["contact [REDACTED] for help"]);
  });

  it("redacts multiple emails in a single string", () => {
    const { reporter, calls } = captureReporter();
    const r = createRedactionReporter({ reporter });
    r.log(makeLog(["from a@x.com to b@y.org"]), {} as never);

    expect(forwarded(calls).args).toEqual(["from [REDACTED] to [REDACTED]"]);
  });

  it("redacts credit-card-number-shaped strings", () => {
    const { reporter, calls } = captureReporter();
    const r = createRedactionReporter({ reporter });
    r.log(makeLog(["card 4111 1111 1111 1111 charged"]), {} as never);

    expect(forwarded(calls).args).toEqual(["card [REDACTED] charged"]);
  });

  it("redacts JWT tokens", () => {
    const { reporter, calls } = captureReporter();
    const r = createRedactionReporter({ reporter });
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    r.log(makeLog([`bearer ${jwt}`]), {} as never);

    expect(forwarded(calls).args).toEqual([`bearer [REDACTED]`]);
  });

  it("redacts long hex API keys", () => {
    const { reporter, calls } = captureReporter();
    const r = createRedactionReporter({ reporter });
    const key = "a".repeat(40); // 40-char hex (sha1-shaped)
    r.log(makeLog([`key=${key}`]), {} as never);

    expect(forwarded(calls).args).toEqual([`key=[REDACTED]`]);
  });

  it("redacts the top-level message field too", () => {
    const { reporter, calls } = captureReporter();
    const r = createRedactionReporter({ reporter });
    r.log(makeLog(["clean arg"], { message: "ping admin@example.com" }), {} as never);

    expect(forwarded(calls).message).toBe("ping [REDACTED]");
  });
});

// --- object-arg key-based redaction ----------------------------------------

describe("redaction — object args (key-based)", () => {
  it("redacts known sensitive keys (password, token, etc.)", () => {
    const { reporter, calls } = captureReporter();
    const r = createRedactionReporter({ reporter });
    r.log(
      makeLog([
        {
          username: "alice",
          password: "hunter2",
          token: "abc123",
          apiKey: "sk_live_xyz",
        },
      ]),
      {} as never,
    );

    const arg = forwarded(calls).args[0] as Record<string, unknown>;
    expect(arg.username).toBe("alice");
    expect(arg.password).toBe("[REDACTED]");
    expect(arg.token).toBe("[REDACTED]");
    expect(arg.apiKey).toBe("[REDACTED]");
  });

  it("redacts nested sensitive keys", () => {
    const { reporter, calls } = captureReporter();
    const r = createRedactionReporter({ reporter });
    r.log(
      makeLog([{ db: { host: "db", password: "s3cr3t" } }]),
      {} as never,
    );

    const arg = forwarded(calls).args[0] as { db: Record<string, unknown> };
    expect(arg.db.host).toBe("db");
    expect(arg.db.password).toBe("[REDACTED]");
  });

  it("redacts sensitive keys inside arrays", () => {
    const { reporter, calls } = captureReporter();
    const r = createRedactionReporter({ reporter });
    r.log(
      makeLog([{ users: [{ name: "bob", secret: "shh" }] }]),
      {} as never,
    );

    const arg = forwarded(calls).args[0] as { users: Array<Record<string, unknown>> };
    expect(arg.users[0]!.name).toBe("bob");
    expect(arg.users[0]!.secret).toBe("[REDACTED]");
  });

  it("matches sensitive keys case-insensitively and as substrings", () => {
    const { reporter, calls } = captureReporter();
    const r = createRedactionReporter({ reporter });
    r.log(
      makeLog([{ UserPassword: "x", AccessToken: "y" }]),
      {} as never,
    );

    const arg = forwarded(calls).args[0] as Record<string, unknown>;
    expect(arg.UserPassword).toBe("[REDACTED]");
    expect(arg.AccessToken).toBe("[REDACTED]");
  });
});

// --- preservation ----------------------------------------------------------

describe("redaction — preserves non-sensitive data", () => {
  it("leaves clean strings untouched", () => {
    const { reporter, calls } = captureReporter();
    const r = createRedactionReporter({ reporter });
    r.log(makeLog(["just a normal message"]), {} as never);

    expect(forwarded(calls).args).toEqual(["just a normal message"]);
  });

  it("leaves clean objects untouched (structurally)", () => {
    const { reporter, calls } = captureReporter();
    const r = createRedactionReporter({ reporter });
    const input = { status: 200, duration: 42, nested: { ok: true } };
    r.log(makeLog([input]), {} as never);

    expect(forwarded(calls).args).toEqual([input]);
  });

  it("does not redact short numeric/hex strings (< 32 chars)", () => {
    const { reporter, calls } = captureReporter();
    const r = createRedactionReporter({ reporter });
    r.log(makeLog(["id=1a2b3c4d"]), {} as never); // 8 chars — not an API key

    expect(forwarded(calls).args).toEqual(["id=1a2b3c4d"]);
  });
});

// --- customisation ---------------------------------------------------------

describe("redaction — custom patterns", () => {
  it("replaces the defaults when supplied", () => {
    const { reporter, calls } = captureReporter();
    const r = createRedactionReporter({
      reporter,
      patterns: [/ORD-\d{6}/g], // order numbers only
    });
    // Email should NOT be redacted — defaults were replaced.
    r.log(makeLog(["email a@b.com order ORD-123456"]), {} as never);

    expect(forwarded(calls).args).toEqual(["email a@b.com order [REDACTED]"]);
  });

  it("accepts string patterns (matched literally, case-insensitive)", () => {
    const { reporter, calls } = captureReporter();
    const r = createRedactionReporter({
      reporter,
      patterns: ["SuperSecret"],
    });
    r.log(makeLog(["the SuperSecret value and supersecret too"]), {} as never);

    expect(forwarded(calls).args).toEqual([
      "the [REDACTED] value and [REDACTED] too",
    ]);
  });
});

describe("redaction — custom replacement text", () => {
  it("uses the provided replacement", () => {
    const { reporter, calls } = captureReporter();
    const r = createRedactionReporter({
      reporter,
      replacement: "***",
    });
    r.log(makeLog(["ping admin@example.com"]), {} as never);

    expect(forwarded(calls).args).toEqual(["ping ***"]);
  });

  it("uses the custom replacement for key-based redaction too", () => {
    const { reporter, calls } = captureReporter();
    const r = createRedactionReporter({
      reporter,
      replacement: "<hidden>",
    });
    r.log(makeLog([{ password: "hunter2" }]), {} as never);

    const arg = forwarded(calls).args[0] as Record<string, unknown>;
    expect(arg.password).toBe("<hidden>");
  });
});

describe("redaction — custom keys", () => {
  it("replaces the default key set when supplied", () => {
    const { reporter, calls } = captureReporter();
    const r = createRedactionReporter({
      reporter,
      keys: ["ssn"],
    });
    r.log(makeLog([{ ssn: "123-45-6789", password: "keep" }]), {} as never);

    const arg = forwarded(calls).args[0] as Record<string, unknown>;
    expect(arg.ssn).toBe("[REDACTED]");
    expect(arg.password).toBe("keep"); // default keys were replaced
  });
});

// --- error redaction -------------------------------------------------------

describe("redaction — errors", () => {
  it("redacts sensitive data in error messages", () => {
    const { reporter, calls } = captureReporter();
    const r = createRedactionReporter({ reporter });
    const err = new Error("auth failed for admin@example.com");
    r.log(makeLog([err]), {} as never);

    const out = forwarded(calls).args[0] as Error;
    expect(out.message).toBe("auth failed for [REDACTED]");
    expect(out).not.toBe(err); // cloned, not mutated
  });

  it("does not mutate the original error", () => {
    const { reporter } = captureReporter();
    const r = createRedactionReporter({ reporter });
    const err = new Error("admin@example.com");
    r.log(makeLog([err]), {} as never);

    expect(err.message).toBe("admin@example.com");
  });
});

// --- middleware behaviour --------------------------------------------------

describe("redaction — passes through to wrapped reporter", () => {
  it("forwards exactly one log call per log()", () => {
    const wrapped = { log: vi.fn() };
    const r = createRedactionReporter({ reporter: wrapped });
    const logObj = makeLog(["clean"]);
    r.log(logObj, { options: {} } as never);

    expect(wrapped.log).toHaveBeenCalledTimes(1);
  });

  it("forwards the context object unchanged", () => {
    const wrapped = { log: vi.fn() };
    const r = createRedactionReporter({ reporter: wrapped });
    const ctx = { options: {} } as never;
    r.log(makeLog(["clean"]), ctx);

    expect(wrapped.log).toHaveBeenCalledWith(expect.anything(), ctx);
  });

  it("does not mutate the original logObj", () => {
    const { reporter } = captureReporter();
    const r = createRedactionReporter({ reporter });
    const original = makeLog(["admin@example.com", { password: "x" }]);
    const snapshot = {
      args: [...original.args],
      message: original.message,
    };
    r.log(original, {} as never);

    expect(original.args).toEqual(snapshot.args);
    expect(original.args[0]).toBe("admin@example.com"); // unchanged reference content
    expect((original.args[1] as Record<string, unknown>).password).toBe("x");
  });

  it("preserves level, type, tag, and date on the forwarded object", () => {
    const { reporter, calls } = captureReporter();
    const r = createRedactionReporter({ reporter });
    r.log(makeLog(["admin@example.com"], { tag: "auth" }), {} as never);

    const out = forwarded(calls);
    expect(out.level).toBe(3);
    expect(out.type).toBe("info");
    expect(out.tag).toBe("auth");
    expect(out.date).toBeInstanceOf(Date);
  });

  it("works as middleware around the JSON reporter end-to-end", () => {
    const { reporter, calls } = captureReporter();
    const r = createRedactionReporter({ reporter });
    r.log(
      makeLog([
        "login",
        { user: "alice", password: "hunter2", email: "alice@example.com" },
      ]),
      {} as never,
    );

    const out = forwarded(calls);
    expect(out.args[0]).toBe("login");
    const obj = out.args[1] as Record<string, unknown>;
    expect(obj.user).toBe("alice");
    expect(obj.password).toBe("[REDACTED]");
    expect(obj.email).toBe("[REDACTED]"); // 'email' is a default key
  });
});
