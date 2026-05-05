import { describe, it, expect } from "vitest";

describe("env loader", () => {
  it("parses required env vars", async () => {
    const { env } = await import("../src/lib/env.js");
    expect(env.PORT).toBe(4001);
    expect(env.NODE_ENV).toBe("test");
    expect(env.BETTER_AUTH_SECRET.length).toBeGreaterThanOrEqual(16);
    expect(env.WEB_ORIGIN).toMatch(/^http/);
  });
});
