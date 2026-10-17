// @vitest-environment node
import { describe, expect, it } from "vitest";

// Server-side rendering imports modules without a DOM: nothing may touch
// HTMLElement or customElements at import time.
describe("server-side imports", () => {
  it("imports appret/tabs without a DOM", async () => {
    expect(typeof HTMLElement).toBe("undefined");
    const module = await import("./index.js");
    expect(module.TabsController).toBeTypeOf("function");
    expect(module.TabsElement).toBeTypeOf("function");
  });

  it("imports appret/define/tabs without a DOM", async () => {
    await expect(import("../define/tabs.js")).resolves.toBeDefined();
  });
});
