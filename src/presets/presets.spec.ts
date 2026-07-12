import { describe, expect, it } from "vitest";

/**
 * Preset smoke tests.
 *
 * Verifies the preset modules load without error (applying their side effects)
 * and export the expected surface. Deep routing is covered by the per-patch
 * suites; here we only confirm the wiring is intact.
 */

describe("presets", () => {
  it("presets/all module loads without throwing", async () => {
    await expect(import("./all")).resolves.toBeDefined();
  });

  it("presets/next-only module loads without throwing", async () => {
    await expect(import("./next-only")).resolves.toBeDefined();
  });
});
