import { tool } from "@langchain/core/tools";
import { z } from "zod";
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

export async function previewCampaign(draft: DraftCampaign) {
  const payload = {
    platform: draft.platform,
    objective: draft.objective,
    budget: draft.budget,
  };

  if (draft.platform === "google") return previewGoogleCampaignTool.invoke(payload);
  if (draft.platform === "meta") return previewMetaCampaignTool.invoke(payload);

  const [google, meta] = await Promise.all([
    previewGoogleCampaignTool.invoke(payload),
    previewMetaCampaignTool.invoke(payload),
  ]);
  return `${google}\n${meta}`;
}

export async function executeCampaign(draft: DraftCampaign) {
  const payload = {
    platform: draft.platform,
    objective: draft.objective,
    budget: draft.budget,
  };

  if (draft.platform === "google") return executeGoogleCampaignTool.invoke(payload);
  if (draft.platform === "meta") return executeMetaCampaignTool.invoke(payload);

  const [google, meta] = await Promise.all([
    executeGoogleCampaignTool.invoke(payload),
    executeMetaCampaignTool.invoke(payload),
  ]);
  return `${google}\n${meta}`;
}
