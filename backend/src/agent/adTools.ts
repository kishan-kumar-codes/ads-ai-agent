import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { createCampaign, type CampaignObjective } from "../services/meta/campaigns.js";
import { getMetaConnection } from "../services/meta/tokens.js";
import { env } from "../lib/env.js";
import type { DraftCampaign } from "./types.js";

const campaignToolSchema = z.object({
  platform: z.enum(["google", "meta", "both"]),
  objective: z.string(),
  budget: z.string().optional(),
});

export const previewGoogleCampaignTool = tool(
  async ({ objective, budget }) =>
    `Prepared a Google Ads search campaign preview for "${objective}" with budget ${budget ?? "to be confirmed"}.`,
  {
    name: "preview_google_campaign",
    description: "Preview a Google Ads campaign plan without publishing it.",
    schema: campaignToolSchema,
  },
);

export const previewMetaCampaignTool = tool(
  async ({ objective, budget }) =>
    `Prepared a Meta campaign preview for "${objective}" with budget ${budget ?? "to be confirmed"}.`,
  {
    name: "preview_meta_campaign",
    description: "Preview a Meta Ads campaign plan without publishing it.",
    schema: campaignToolSchema,
  },
);

export const executeGoogleCampaignTool = tool(
  async ({ objective }) =>
    `Google Ads launch is queued for "${objective}". Real API execution is deferred to the Google Ads phase.`,
  {
    name: "execute_google_campaign",
    description: "Launch a Google Ads campaign after human approval.",
    schema: campaignToolSchema,
  },
);

export const executeMetaCampaignTool = tool(
  async ({ objective }) =>
    `Meta Ads launch is queued for "${objective}". Real API execution is deferred to the Meta Ads phase.`,
  {
    name: "execute_meta_campaign",
    description: "Launch a Meta campaign after human approval.",
    schema: campaignToolSchema,
  },
);

export const adPlatformTools = [
  previewGoogleCampaignTool,
  previewMetaCampaignTool,
  executeGoogleCampaignTool,
  executeMetaCampaignTool,
] as const;

// Meta-only mode: route every preview/execute to the Meta path,
// regardless of what the planner produced. Google support is deferred.
export async function previewCampaign(draft: DraftCampaign) {
  const payload = {
    platform: "meta" as const,
    objective: draft.objective,
    budget: draft.budget,
  };
  return previewMetaCampaignTool.invoke(payload);
}

export async function executeCampaign(
  draft: DraftCampaign,
  options: { userId?: string; campaignName?: string } = {},
) {
  const metaDraft: DraftCampaign = { ...draft, platform: "meta" };
  const payload = {
    platform: "meta" as const,
    objective: metaDraft.objective,
    budget: metaDraft.budget,
  };
  const real = await tryRealMetaLaunch(metaDraft, options);
  if (real) return real;
  return executeMetaCampaignTool.invoke(payload);
}

const META_OBJECTIVE_FALLBACK: CampaignObjective = "OUTCOME_TRAFFIC";

const META_OBJECTIVE_KEYWORDS: Array<{ keywords: RegExp; objective: CampaignObjective }> = [
  { keywords: /(lead|signup|sign-up|form)/i, objective: "OUTCOME_LEADS" },
  { keywords: /(sale|purchase|conversion|checkout|buy)/i, objective: "OUTCOME_SALES" },
  { keywords: /(awareness|brand|reach)/i, objective: "OUTCOME_AWARENESS" },
  { keywords: /(engagement|follower|like|comment)/i, objective: "OUTCOME_ENGAGEMENT" },
  { keywords: /(install|app)/i, objective: "OUTCOME_APP_PROMOTION" },
];

function inferMetaObjective(objective: string): CampaignObjective {
  const match = META_OBJECTIVE_KEYWORDS.find((entry) => entry.keywords.test(objective));
  return match?.objective ?? META_OBJECTIVE_FALLBACK;
}

function parseDailyBudget(budget: string | undefined): number | undefined {
  if (!budget) return undefined;
  const match = budget.match(/[\d,]+(?:\.\d+)?/);
  if (!match) return undefined;
  const value = Number(match[0].replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

async function tryRealMetaLaunch(
  draft: DraftCampaign,
  options: { userId?: string; campaignName?: string },
): Promise<string | null> {
  const { userId, campaignName } = options;
  if (!userId) return null;
  if (!env.META_DEFAULT_AD_ACCOUNT_ID) return null;
  try {
    const connection = await getMetaConnection(userId);
    if (!connection?.accessToken) return null;

    const dailyBudget = parseDailyBudget(draft.budget);
    const created = await createCampaign({
      accessToken: connection.accessToken,
      adAccountId: env.META_DEFAULT_AD_ACCOUNT_ID,
      name: (campaignName || draft.objective).slice(0, 80),
      objective: inferMetaObjective(draft.objective),
      dailyBudgetCents: dailyBudget ? Math.round(dailyBudget * 100) : undefined,
      status: "PAUSED",
    });
    return `Created Meta campaign ${created.id} (paused) for "${campaignName || draft.objective}".`;
  } catch (err) {
    logger.warn({ err }, "meta_real_launch_failed");
    return null;
  }
}
