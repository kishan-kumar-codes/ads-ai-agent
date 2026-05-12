import { tool } from "@langchain/core/tools";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { createCampaign, type CampaignObjective } from "../services/meta/campaigns.js";
import { FacebookPagePublishError, publishFacebookPhotoPost } from "../services/meta/posts.js";
import { getMetaConnection } from "../services/meta/tokens.js";
import { env } from "../lib/env.js";
import type { DraftCampaign, CampaignPreview } from "./types.js";

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
    objective: draft.topic,
    budget: undefined,
  };
  return previewMetaCampaignTool.invoke(payload);
}

export async function executeCampaign(
  draft: DraftCampaign,
  options: { userId?: string; campaignName?: string } = {},
) {
  const payload = {
    platform: "meta" as const,
    objective: draft.topic,
    budget: undefined,
  };
  const real = await tryRealMetaLaunch(draft, options);
  if (real) return real;
  return executeMetaCampaignTool.invoke(payload);
}

export async function publishFacebookPost(
  draft: DraftCampaign,
  preview: CampaignPreview,
  options: { userId?: string; prisma: PrismaClient },
) {
  const caption = composeFacebookCaption(preview.caption, preview.hashtags);
  const imageBase64 = preview.image.base64 ?? draft.image?.base64;

  const pendingPost = await options.prisma.socialPost.create({
    data: {
      userId: options.userId ?? "",
      pageId: preview.pageId ?? "connected-page",
      pageName: preview.pageName,
      topic: preview.topic,
      caption: preview.caption,
      hashtags: preview.hashtags,
      imagePrompt: preview.image.prompt ?? draft.imagePrompt,
      imageUrl: preview.image.url,
      imageMimeType: preview.image.mimeType ?? "image/png",
      status: "pending_review",
    },
  });

  try {
    if (!options.userId) throw new FacebookPagePublishError("facebook_page_missing");
    const connection = await getMetaConnection(options.userId);
    const accessToken = connection?.accessToken ?? env.META_GRAPH_ACCESS_TOKEN;
    if (!accessToken) throw new FacebookPagePublishError("facebook_page_missing");
    if (!imageBase64) throw new FacebookPagePublishError("facebook_image_missing");

    const published = await publishFacebookPhotoPost({
      userAccessToken: accessToken,
      pageId: preview.pageId,
      caption,
      imageBase64,
      imageMimeType: preview.image.mimeType ?? draft.image?.mimeType,
    });

    await options.prisma.socialPost.update({
      where: { id: pendingPost.id },
      data: {
        pageId: published.page.id,
        pageName: published.page.name,
        facebookPhotoId: published.photoId,
        facebookPostId: published.postId,
        status: "published",
        publishedAt: new Date(),
      },
    });

    return `Published Facebook post${published.postId ? ` ${published.postId}` : ""} to ${published.page.name}.`;
  } catch (err) {
    const detail = err instanceof Error ? err.message : "facebook_publish_failed";
    logger.warn({ err, socialPostId: pendingPost.id }, "facebook_post_publish_failed");
    await options.prisma.socialPost.update({
      where: { id: pendingPost.id },
      data: {
        status: "failed",
        error: detail,
      },
    });
    return publishFailureMessage(detail);
  }
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

    const dailyBudget = parseDailyBudget(undefined);
    const created = await createCampaign({
      accessToken: connection.accessToken,
      adAccountId: env.META_DEFAULT_AD_ACCOUNT_ID,
      name: (campaignName || draft.topic).slice(0, 80),
      objective: inferMetaObjective(draft.goal ?? draft.topic),
      dailyBudgetCents: dailyBudget ? Math.round(dailyBudget * 100) : undefined,
      status: "PAUSED",
    });
    return `Created Meta campaign ${created.id} (paused) for "${campaignName || draft.topic}".`;
  } catch (err) {
    logger.warn({ err }, "meta_real_launch_failed");
    return null;
  }
}

function composeFacebookCaption(caption: string, hashtags: string[]) {
  const normalized = hashtags.map((tag) => tag.startsWith("#") ? tag : `#${tag}`);
  return [caption.trim(), normalized.join(" ")].filter(Boolean).join("\n\n");
}

function publishFailureMessage(detail: string) {
  switch (detail) {
    case "facebook_page_missing":
      return "I could not publish because no connected Facebook Page is available. Reconnect Facebook and select a Page first.";
    case "facebook_page_permission_missing":
      return "I could not publish because the Facebook connection is missing Page publishing permission. Reconnect Facebook with pages_manage_posts.";
    case "facebook_image_missing":
      return "I could not publish because the approved post does not have a generated image.";
    default:
      return `I could not publish the Facebook post: ${detail}`;
  }
}
