import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import type { Express } from "express";

let app: Express;

beforeAll(async () => {
  const { createApp } = await import("../src/app.js");
  app = createApp();
});

describe("auth handler is mounted", () => {
  it("rejects sign-up with malformed body (handler is reached, not 404)", async () => {
    // Better Auth's /sign-up/email exists; an empty payload returns a 4xx,
    // proving the request reached Better Auth and not the catch-all 404.
    const res = await request(app)
      .post("/api/auth/sign-up/email")
      .set("Content-Type", "application/json")
      .send("{}");
    expect(res.status).not.toBe(404);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});

describe("GET /api/me without session", () => {
  it("returns 401 when no auth cookie", async () => {
    const res = await request(app).get("/api/me");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unauthorized");
  });
});
