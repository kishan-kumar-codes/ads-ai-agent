import { describe, it, expect, vi, afterEach } from "vitest";
import { api } from "../src/lib/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetch(impl: typeof fetch) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

describe("api()", () => {
  it("returns parsed JSON for 2xx", async () => {
    mockFetch(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const data = await api<{ ok: boolean }>("/api/health");
    expect(data).toEqual({ ok: true });
  });

  it("throws on non-2xx", async () => {
    mockFetch(async () => new Response("nope", { status: 500 }));
    await expect(api("/api/boom")).rejects.toThrow(/API 500/);
  });

  it("returns undefined for 204", async () => {
    mockFetch(async () => new Response(null, { status: 204 }));
    await expect(api("/api/empty")).resolves.toBeUndefined();
  });

  it("includes credentials and JSON header", async () => {
    const spy = vi.fn(async () => new Response("{}", { status: 200 }));
    mockFetch(spy as unknown as typeof fetch);
    await api("/api/x");
    const init = spy.mock.calls[0]![1] as RequestInit;
    expect(init.credentials).toBe("include");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });
});
