import { metaRequest } from "./client.js";

export type CampaignObjective =
  | "OUTCOME_TRAFFIC"
  | "OUTCOME_LEADS"
  | "OUTCOME_SALES"
  | "OUTCOME_AWARENESS"
  | "OUTCOME_ENGAGEMENT"
  | "OUTCOME_APP_PROMOTION";

export type EffectiveStatus = "ACTIVE" | "PAUSED" | "DELETED" | "ARCHIVED";

export interface MetaAdAccount {
  id: string;
  account_id: string;
  name: string;
  account_status: number;
  currency: string;
  timezone_name: string;
}

export interface MetaCampaignSummary {
  id: string;
  name: string;
  status: EffectiveStatus;
  objective: CampaignObjective;
  daily_budget?: string;
  lifetime_budget?: string;
}

export interface CreateCampaignInput {
  accessToken: string;
  adAccountId: string;
  name: string;
  objective: CampaignObjective;
  dailyBudgetCents?: number;
  lifetimeBudgetCents?: number;
  status?: "ACTIVE" | "PAUSED";
  specialAdCategories?: string[];
}

export interface CreateAdSetInput {
  accessToken: string;
  adAccountId: string;
  campaignId: string;
  name: string;
  dailyBudgetCents: number;
  billingEvent?: "IMPRESSIONS" | "LINK_CLICKS";
  optimizationGoal?: string;
  bidStrategy?: "LOWEST_COST_WITHOUT_CAP" | "LOWEST_COST_WITH_BID_CAP";
  startTime?: string;
  endTime?: string;
  targeting: Record<string, unknown>;
  status?: "ACTIVE" | "PAUSED";
}

export interface CreateAdCreativeInput {
  accessToken: string;
  adAccountId: string;
  name: string;
  pageId: string;
  message: string;
  link: string;
  imageHash?: string;
  callToActionType?: string;
}

export interface CreateAdInput {
  accessToken: string;
  adAccountId: string;
  adSetId: string;
  creativeId: string;
  name: string;
  status?: "ACTIVE" | "PAUSED";
}

export interface CampaignInsightsRow {
  date_start: string;
  date_stop: string;
  impressions?: string;
  clicks?: string;
  spend?: string;
  reach?: string;
  cpc?: string;
  ctr?: string;
  actions?: Array<{ action_type: string; value: string }>;
}

const ACCOUNT_PREFIX = "act_";

function normalizeAccountId(id: string) {
  return id.startsWith(ACCOUNT_PREFIX) ? id : `${ACCOUNT_PREFIX}${id}`;
}

export async function listAdAccounts(accessToken: string) {
  const result = await metaRequest<{ data: MetaAdAccount[] }>({
    accessToken,
    path: "/me/adaccounts",
    query: {
      fields: "id,account_id,name,account_status,currency,timezone_name",
      limit: 50,
    },
  });
  return result.data;
}

export async function createCampaign(input: CreateCampaignInput) {
  const body: Record<string, unknown> = {
    name: input.name,
    objective: input.objective,
    status: input.status ?? "PAUSED",
    special_ad_categories: input.specialAdCategories ?? [],
  };
  if (input.dailyBudgetCents) body.daily_budget = input.dailyBudgetCents;
  if (input.lifetimeBudgetCents) body.lifetime_budget = input.lifetimeBudgetCents;

  return metaRequest<{ id: string }>({
    accessToken: input.accessToken,
    path: `/${normalizeAccountId(input.adAccountId)}/campaigns`,
    method: "POST",
    body,
  });
}

export async function createAdSet(input: CreateAdSetInput) {
  return metaRequest<{ id: string }>({
    accessToken: input.accessToken,
    path: `/${normalizeAccountId(input.adAccountId)}/adsets`,
    method: "POST",
    body: {
      name: input.name,
      campaign_id: input.campaignId,
      daily_budget: input.dailyBudgetCents,
      billing_event: input.billingEvent ?? "IMPRESSIONS",
      optimization_goal: input.optimizationGoal ?? "LINK_CLICKS",
      bid_strategy: input.bidStrategy ?? "LOWEST_COST_WITHOUT_CAP",
      start_time: input.startTime,
      end_time: input.endTime,
      targeting: input.targeting,
      status: input.status ?? "PAUSED",
    },
  });
}

export async function createAdCreative(input: CreateAdCreativeInput) {
  const linkData: Record<string, unknown> = {
    message: input.message,
    link: input.link,
  };
  if (input.imageHash) linkData.image_hash = input.imageHash;
  if (input.callToActionType) {
    linkData.call_to_action = {
      type: input.callToActionType,
      value: { link: input.link },
    };
  }

  return metaRequest<{ id: string }>({
    accessToken: input.accessToken,
    path: `/${normalizeAccountId(input.adAccountId)}/adcreatives`,
    method: "POST",
    body: {
      name: input.name,
      object_story_spec: {
        page_id: input.pageId,
        link_data: linkData,
      },
    },
  });
}

export async function createAd(input: CreateAdInput) {
  return metaRequest<{ id: string }>({
    accessToken: input.accessToken,
    path: `/${normalizeAccountId(input.adAccountId)}/ads`,
    method: "POST",
    body: {
      name: input.name,
      adset_id: input.adSetId,
      creative: { creative_id: input.creativeId },
      status: input.status ?? "PAUSED",
    },
  });
}

export async function setCampaignStatus(
  accessToken: string,
  campaignId: string,
  status: "ACTIVE" | "PAUSED",
) {
  return metaRequest<{ success: boolean }>({
    accessToken,
    path: `/${campaignId}`,
    method: "POST",
    body: { status },
  });
}

export async function deleteCampaign(accessToken: string, campaignId: string) {
  return metaRequest<{ success: boolean }>({
    accessToken,
    path: `/${campaignId}`,
    method: "DELETE",
  });
}

export async function getCampaignInsights(
  accessToken: string,
  campaignId: string,
  options: { datePreset?: string; since?: string; until?: string } = {},
) {
  const query: Record<string, string> = {
    fields: "impressions,clicks,spend,reach,cpc,ctr,actions,date_start,date_stop",
    level: "campaign",
  };
  if (options.datePreset) {
    query.date_preset = options.datePreset;
  } else if (options.since && options.until) {
    query.time_range = JSON.stringify({ since: options.since, until: options.until });
  } else {
    query.date_preset = "last_7d";
  }
  return metaRequest<{ data: CampaignInsightsRow[] }>({
    accessToken,
    path: `/${campaignId}/insights`,
    query,
  });
}

export function parseConversions(row: CampaignInsightsRow): number {
  if (!row.actions) return 0;
  const target = row.actions.find((a) =>
    ["purchase", "lead", "complete_registration", "offsite_conversion"].some((t) =>
      a.action_type.includes(t),
    ),
  );
  return target ? Number(target.value) : 0;
}
