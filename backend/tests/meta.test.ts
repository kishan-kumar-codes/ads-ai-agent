import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Express } from "express";

const mocks = vi.hoisted(() => {
  const prisma = {
    platformConnection: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    campaign: {
      create: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    metricSnapshot: {
      create: vi.fn(),
    },
  };
  return {
    sessionUserId: "user-1" as string | null,
    prisma,
  };
});

vi.mock("../src/lib/auth.js", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () =>
        mocks.sessionUserId
          ? { user: { id: mocks.sessionUserId }, session: { id: "session-1" } }
          : null,
      ),
    },
  },
}));

vi.mock("../src/lib/prisma.js", () => ({
  prisma: mocks.prisma,
}));

let app: Express;

beforeAll(async () => {
  process.env.META_APP_ID = "test-app-id";
  process.env.META_APP_SECRET = "test-app-secret";
  process.env.META_REDIRECT_URI = "http://localhost:4001/api/meta/callback";
  process.env.META_GRAPH_API_VERSION = "v21.0";
  const { createApp } = await import("../src/app.js");
  app = createApp();
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sessionUserId = "user-1";
  vi.unstubAllGlobals();
});

describe("meta routes", () => {
  it("requires auth on /api/meta/status", async () => {
    mocks.sessionUserId = null;
    const res = await request(app).get("/api/meta/status");
    expect(res.status).toBe(401);
  });

  it("reports configured but disconnected when no row exists", async () => {
    mocks.prisma.platformConnection.findUnique.mockResolvedValue(null);
    const res = await request(app).get("/api/meta/status");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ connected: false, configured: true });
  });

  it("returns a Facebook authorize URL on /api/meta/connect", async () => {
    const res = await request(app).get("/api/meta/connect");
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/facebook\.com\/v21\.0\/dialog\/oauth/);
    expect(res.body.url).toContain("client_id=test-app-id");
    expect(res.body.url).toContain("scope=ads_management");
  });

  it("returns 409 from /api/meta/ad-accounts when not connected", async () => {
    mocks.prisma.platformConnection.findUnique.mockResolvedValue(null);
    const res = await request(app).get("/api/meta/ad-accounts");
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("meta_not_connected");
  });

  it("calls Graph API for ad-accounts when connected", async () => {
    mocks.prisma.platformConnection.findUnique.mockResolvedValue({
      accessToken: "token-abc",
    });
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ data: [{ id: "act_1", account_id: "1", name: "Acme", account_status: 1, currency: "USD", timezone_name: "UTC" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await request(app).get("/api/meta/ad-accounts");
    expect(res.status).toBe(200);
    expect(res.body.accounts[0]).toMatchObject({ id: "act_1", name: "Acme" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("/v21.0/me/adaccounts");
  });

  it("propagates Graph API error status as 4xx", async () => {
    mocks.prisma.platformConnection.findUnique.mockResolvedValue({
      accessToken: "bad-token",
    });
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: "Invalid OAuth", code: 190, type: "OAuthException" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await request(app).get("/api/meta/ad-accounts");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "meta_api_error", code: 190 });
  });

  it("creates a campaign and persists a Campaign row", async () => {
    mocks.prisma.platformConnection.findUnique.mockResolvedValue({ accessToken: "token-abc" });
    mocks.prisma.campaign.create.mockResolvedValue({ id: "db-1", externalId: "fb-1" });
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "fb-1" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await request(app)
      .post("/api/meta/campaigns")
      .send({
        adAccountId: "act_123",
        name: "Spring sale",
        objective: "OUTCOME_TRAFFIC",
        dailyBudget: 25,
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ externalId: "fb-1" });
    expect(mocks.prisma.campaign.create).toHaveBeenCalled();
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("/v21.0/act_123/campaigns");
  });

  it("disconnects by deleting the platform connection", async () => {
    mocks.prisma.platformConnection.delete.mockResolvedValue({});
    const res = await request(app).post("/api/meta/disconnect");
    expect(res.status).toBe(200);
    expect(mocks.prisma.platformConnection.delete).toHaveBeenCalledWith({
      where: { userId_platform: { userId: "user-1", platform: "meta" } },
    });
  });
});
