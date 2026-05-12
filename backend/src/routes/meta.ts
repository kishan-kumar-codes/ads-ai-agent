import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  MetaApiError,
} from "../services/meta/client.js";
import {
  createAd,
  createAdCreative,
  createAdSet,
  createCampaign,
  deleteCampaign,
  getCampaignInsights,
  listAdAccounts,
  parseConversions,
  setCampaignStatus,
  type CampaignObjective,
} from "../services/meta/campaigns.js";
import { getMetaAccessTokenOrThrow, MetaConnectionMissingError } from "../services/meta/tokens.js";

export const metaRouter = Router();

const DEFAULT_SCOPES = [
  "ads_management",
  "ads_read",
  "business_management",
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
];

const oauthStates = new Map<string, { userId: string; expiresAt: number }>();
const STATE_TTL_MS = 10 * 60 * 1000;

function rememberState(userId: string): string {
  const token = randomBytes(24).toString("hex");
  oauthStates.set(token, { userId, expiresAt: Date.now() + STATE_TTL_MS });
  return token;
}

function consumeState(state: string): string | null {
  const entry = oauthStates.get(state);
  if (!entry) return null;
  oauthStates.delete(state);
  if (entry.expiresAt < Date.now()) return null;
  return entry.userId;
}

function isMetaConfigured(): boolean {
  return Boolean(env.META_APP_ID && env.META_APP_SECRET && env.META_REDIRECT_URI);
}

metaRouter.get("/config", requireAuth, (_req: AuthedRequest, res) => {
  res.json({
    configured: isMetaConfigured(),
    apiVersion: env.META_GRAPH_API_VERSION,
    redirectUri: env.META_REDIRECT_URI ?? null,
    loginConfigId: env.META_LOGIN_CONFIG_ID ?? null,
  });
});

metaRouter.get("/status", requireAuth, async (req: AuthedRequest, res) => {
  const connection = await prisma.platformConnection.findUnique({
    where: { userId_platform: { userId: req.userId!, platform: "meta" } },
    select: { id: true, scope: true, expiresAt: true, createdAt: true, updatedAt: true },
  });
  res.json({
    connected: Boolean(connection),
    connection,
    configured: isMetaConfigured(),
  });
});

metaRouter.get("/connect", requireAuth, (req: AuthedRequest, res) => {
  if (!isMetaConfigured()) {
    res.status(400).json({ error: "meta_not_configured" });
    return;
  }
  try {
    const state = rememberState(req.userId!);
    const url = buildAuthorizeUrl(state, DEFAULT_SCOPES);
    res.json({ url });
  } catch (err) {
    logger.error({ err }, "meta_connect_failed");
    res.status(500).json({ error: "meta_connect_failed" });
  }
});

metaRouter.get("/callback", async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : null;
  const state = typeof req.query.state === "string" ? req.query.state : null;
  if (!code || !state) {
    res.status(400).send("Missing code or state");
    return;
  }
  const userId = consumeState(state);
  if (!userId) {
    res.status(400).send("Invalid or expired state");
    return;
  }
  try {
    const short = await exchangeCodeForToken(code);
    const long = await exchangeForLongLivedToken(short.access_token).catch(() => short);
    const expiresAt = long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null;

    await prisma.platformConnection.upsert({
      where: { userId_platform: { userId, platform: "meta" } },
      create: {
        userId,
        platform: "meta",
        accessToken: long.access_token,
        scope: DEFAULT_SCOPES.join(","),
        expiresAt,
      },
      update: {
        accessToken: long.access_token,
        scope: DEFAULT_SCOPES.join(","),
        expiresAt,
      },
    });

    const redirect = `${env.WEB_ORIGIN}/settings/connections?meta=connected`;
    res.redirect(302, redirect);
  } catch (err) {
    logger.error({ err }, "meta_callback_failed");
    const redirect = `${env.WEB_ORIGIN}/settings/connections?meta=error`;
    res.redirect(302, redirect);
  }
});

metaRouter.post("/disconnect", requireAuth, async (req: AuthedRequest, res) => {
  await prisma.platformConnection
    .delete({ where: { userId_platform: { userId: req.userId!, platform: "meta" } } })
    .catch(() => null);
  res.json({ ok: true });
});

metaRouter.get("/ad-accounts", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const token = await getMetaAccessTokenOrThrow(req.userId!);
    const accounts = await listAdAccounts(token);
    res.json({ accounts });
  } catch (err) {
    handleMetaError(err, res);
  }
});

const createCampaignSchema = z.object({
  adAccountId: z.string().min(1),
  name: z.string().min(1).max(120),
  objective: z.enum([
    "OUTCOME_TRAFFIC",
    "OUTCOME_LEADS",
    "OUTCOME_SALES",
    "OUTCOME_AWARENESS",
    "OUTCOME_ENGAGEMENT",
    "OUTCOME_APP_PROMOTION",
  ]),
  dailyBudget: z.number().positive().optional(),
  status: z.enum(["ACTIVE", "PAUSED"]).default("PAUSED"),
});

metaRouter.post("/campaigns", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = createCampaignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", issues: parsed.error.issues });
    return;
  }
  try {
    const token = await getMetaAccessTokenOrThrow(req.userId!);
    const dailyBudgetCents = parsed.data.dailyBudget
      ? Math.round(parsed.data.dailyBudget * 100)
      : undefined;
    const created = await createCampaign({
      accessToken: token,
      adAccountId: parsed.data.adAccountId,
      name: parsed.data.name,
      objective: parsed.data.objective as CampaignObjective,
      dailyBudgetCents,
      status: parsed.data.status,
    });

    const dbCampaign = await prisma.campaign.create({
      data: {
        userId: req.userId!,
        platform: "meta",
        externalId: created.id,
        name: parsed.data.name,
        status: parsed.data.status === "ACTIVE" ? "active" : "draft",
        budget: parsed.data.dailyBudget ?? 0,
      },
    });

    res.status(201).json({ campaign: dbCampaign, externalId: created.id });
  } catch (err) {
    handleMetaError(err, res);
  }
});

const adSetSchema = z.object({
  adAccountId: z.string().min(1),
  campaignId: z.string().min(1),
  name: z.string().min(1).max(120),
  dailyBudget: z.number().positive(),
  optimizationGoal: z.string().optional(),
  targeting: z.record(z.string(), z.unknown()).default({ geo_locations: { countries: ["US"] } }),
  status: z.enum(["ACTIVE", "PAUSED"]).default("PAUSED"),
});

metaRouter.post("/ad-sets", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = adSetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", issues: parsed.error.issues });
    return;
  }
  try {
    const token = await getMetaAccessTokenOrThrow(req.userId!);
    const result = await createAdSet({
      accessToken: token,
      adAccountId: parsed.data.adAccountId,
      campaignId: parsed.data.campaignId,
      name: parsed.data.name,
      dailyBudgetCents: Math.round(parsed.data.dailyBudget * 100),
      optimizationGoal: parsed.data.optimizationGoal,
      targeting: parsed.data.targeting,
      status: parsed.data.status,
    });
    res.status(201).json(result);
  } catch (err) {
    handleMetaError(err, res);
  }
});

const creativeSchema = z.object({
  adAccountId: z.string().min(1),
  name: z.string().min(1).max(120),
  pageId: z.string().min(1),
  message: z.string().min(1).max(2000),
  link: z.string().url(),
  imageHash: z.string().optional(),
  callToActionType: z.string().optional(),
});

metaRouter.post("/ad-creatives", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = creativeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", issues: parsed.error.issues });
    return;
  }
  try {
    const token = await getMetaAccessTokenOrThrow(req.userId!);
    const result = await createAdCreative({
      accessToken: token,
      ...parsed.data,
    });
    res.status(201).json(result);
  } catch (err) {
    handleMetaError(err, res);
  }
});

const adSchema = z.object({
  adAccountId: z.string().min(1),
  adSetId: z.string().min(1),
  creativeId: z.string().min(1),
  name: z.string().min(1).max(120),
  status: z.enum(["ACTIVE", "PAUSED"]).default("PAUSED"),
});

metaRouter.post("/ads", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = adSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", issues: parsed.error.issues });
    return;
  }
  try {
    const token = await getMetaAccessTokenOrThrow(req.userId!);
    const result = await createAd({
      accessToken: token,
      ...parsed.data,
    });
    res.status(201).json(result);
  } catch (err) {
    handleMetaError(err, res);
  }
});

const statusSchema = z.object({ status: z.enum(["ACTIVE", "PAUSED"]) });

metaRouter.patch("/campaigns/:externalId/status", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const externalId = String(req.params.externalId);
  try {
    const token = await getMetaAccessTokenOrThrow(req.userId!);
    await setCampaignStatus(token, externalId, parsed.data.status);
    await prisma.campaign.updateMany({
      where: { userId: req.userId!, platform: "meta", externalId },
      data: { status: parsed.data.status === "ACTIVE" ? "active" : "paused" },
    });
    res.json({ ok: true });
  } catch (err) {
    handleMetaError(err, res);
  }
});

metaRouter.delete("/campaigns/:externalId", requireAuth, async (req: AuthedRequest, res) => {
  const externalId = String(req.params.externalId);
  try {
    const token = await getMetaAccessTokenOrThrow(req.userId!);
    await deleteCampaign(token, externalId);
    await prisma.campaign.updateMany({
      where: { userId: req.userId!, platform: "meta", externalId },
      data: { status: "ended" },
    });
    res.json({ ok: true });
  } catch (err) {
    handleMetaError(err, res);
  }
});

metaRouter.post("/campaigns/:externalId/sync-insights", requireAuth, async (req: AuthedRequest, res) => {
  const externalId = String(req.params.externalId);
  try {
    const token = await getMetaAccessTokenOrThrow(req.userId!);
    const campaign = await prisma.campaign.findFirst({
      where: { userId: req.userId!, platform: "meta", externalId },
      select: { id: true },
    });
    if (!campaign) {
      res.status(404).json({ error: "campaign_not_found" });
      return;
    }
    const insights = await getCampaignInsights(token, externalId, {
      datePreset: typeof req.query.preset === "string" ? req.query.preset : "last_7d",
    });

    const created = await Promise.all(
      insights.data.map((row) =>
        prisma.metricSnapshot.create({
          data: {
            campaignId: campaign.id,
            capturedAt: new Date(`${row.date_stop}T00:00:00.000Z`),
            impressions: Number(row.impressions ?? 0),
            clicks: Number(row.clicks ?? 0),
            conversions: parseConversions(row),
            spend: row.spend ?? 0,
          },
        }),
      ),
    );

    res.json({ inserted: created.length, rows: insights.data });
  } catch (err) {
    handleMetaError(err, res);
  }
});

function handleMetaError(err: unknown, res: import("express").Response) {
  if (err instanceof MetaConnectionMissingError) {
    res.status(409).json({ error: "meta_not_connected" });
    return;
  }
  if (err instanceof MetaApiError) {
    logger.warn({ status: err.status, code: err.code, fbtraceId: err.fbtraceId }, "meta_api_error");
    res.status(err.status >= 400 && err.status < 600 ? err.status : 502).json({
      error: "meta_api_error",
      message: err.message,
      code: err.code,
      fbtraceId: err.fbtraceId,
    });
    return;
  }
  logger.error({ err }, "meta_unexpected_error");
  res.status(500).json({ error: "meta_unexpected_error" });
}
