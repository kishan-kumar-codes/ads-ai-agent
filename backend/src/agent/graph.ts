import { Annotation, Command, END, interrupt, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { executeCampaign, previewCampaign } from "./adTools.js";
import { createMarketingChatModel, invokeStructuredWithTelemetry, invokeWithTelemetry, type MarketingChatModel } from "./model.js";
import type {
  AgentChatMessage,
  AgentCheckpoint,
  AgentIntent,
  ApprovalRequest,
  BusinessContext,
  DraftCampaign,
  ExecutionResult,
  RunAgentOptions,
} from "./types.js";

const MAX_HISTORY_MESSAGES = 20;

const draftCampaignSchema = z.object({
  platform: z.enum(["google", "meta", "both"]).default("meta"),
  objective: z.string().min(1),
  budget: z.string().default(""),
  audience: z.string().default(""),
  headlines: z.array(z.string()).default([]),
  descriptions: z.array(z.string()).default([]),
  targetingNotes: z.array(z.string()).default([]),
  requiresApproval: z.boolean().default(false),
});

const AgentGraphState = Annotation.Root({
  userId: Annotation<string>(),
  threadId: Annotation<string>(),
  input: Annotation<string>(),
  messages: Annotation<AgentChatMessage[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  intent: Annotation<AgentIntent>({
    reducer: (_current, update) => update,
    default: () => "general_help",
  }),
  businessContext: Annotation<BusinessContext>({
    reducer: (_current, update) => update,
    default: () => ({}),
  }),
  draftCampaign: Annotation<DraftCampaign | undefined>({
    reducer: (_current, update) => update,
    default: () => undefined,
  }),
  approvalRequest: Annotation<ApprovalRequest | undefined>({
    reducer: (_current, update) => update,
    default: () => undefined,
  }),
  executionResult: Annotation<ExecutionResult | undefined>({
    reducer: (_current, update) => update,
    default: () => undefined,
  }),
  report: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => "",
  }),
  steps: Annotation<string[]>({
    reducer: (current, update) => current.concat(update),
    default: () => [],
  }),
});

type AgentState = typeof AgentGraphState.State;

export interface MarketingAgentDependencies {
  prisma: PrismaClient;
  model?: MarketingChatModel | null;
}

export function createMarketingAgentGraph({ prisma, model = createMarketingChatModel() }: MarketingAgentDependencies) {
  return new StateGraph(AgentGraphState)
    .addNode("gather_context", async (state) => gatherContextNode(state, prisma))
    .addNode("classify_intent", async (state) => classifyIntentNode(state, model))
    .addNode("generate_ad_content", async (state) => generateAdContentNode(state, model))
    .addNode("plan_campaign", async (state) => planCampaignNode(state, model))
    .addNode("human_approval", humanApprovalNode, {
      ends: ["execute_action", "summarize_report"],
    })
    .addNode("execute_action", executeActionNode)
    .addNode("summarize_report", async (state) => reportNode(state, model))
    .addEdge(START, "gather_context")
    .addEdge("gather_context", "classify_intent")
    .addConditionalEdges("classify_intent", routeAfterIntent, [
      "generate_ad_content",
      "plan_campaign",
      "summarize_report",
    ])
    .addEdge("generate_ad_content", "plan_campaign")
    .addConditionalEdges("plan_campaign", routeAfterPlan, ["human_approval", "summarize_report"])
    .addEdge("execute_action", "summarize_report")
    .addEdge("summarize_report", END)
    .compile({ checkpointer: new MemorySaver() });
}

export async function runMarketingAgent(
  options: RunAgentOptions,
  dependencies: MarketingAgentDependencies,
) {
  await options.onEvent?.({
    type: "step",
    name: "agent_start",
    detail: "Starting LangGraph marketing workflow.",
  });

  const graph = createMarketingAgentGraph(dependencies);
  const result = await graph.invoke(
    {
      userId: options.userId,
      threadId: options.threadId,
      input: options.input,
      steps: [],
    },
    {
      configurable: { thread_id: options.threadId },
      recursionLimit: 10,
    },
  );

  const checkpoint = toCheckpoint(options.threadId, result);
  await persistCheckpoint(dependencies.prisma, checkpoint);

  await options.onEvent?.({ type: "checkpoint", checkpoint });

  const interruptPayload = getInterruptPayload(result);
  const content = interruptPayload
    ? formatApprovalPrompt(interruptPayload)
    : result.report || "I reviewed the request and prepared the next campaign step.";

  await options.onEvent?.({ type: "message", content });

  return {
    content,
    checkpoint,
    interrupted: Boolean(interruptPayload),
  };
}

async function gatherContextNode(state: AgentState, prisma: PrismaClient) {
  const [profile, messages] = await Promise.all([
    prisma.businessProfile.findUnique({
      where: { userId: state.userId },
      select: {
        productName: true,
        audience: true,
        goals: true,
        defaultBudget: true,
        brandVoice: true,
      },
    }),
    prisma.message.findMany({
      where: { threadId: state.threadId },
      orderBy: { createdAt: "desc" },
      take: MAX_HISTORY_MESSAGES,
      select: {
        role: true,
        content: true,
      },
    }),
  ]);

  return {
    businessContext: {
      productName: profile?.productName ?? undefined,
      audience: profile?.audience ?? undefined,
      goals: profile?.goals ?? undefined,
      defaultBudget: profile?.defaultBudget?.toString(),
      brandVoice: profile?.brandVoice ?? undefined,
    },
    messages: messages.reverse().map((message) => ({
      role: message.role,
      content: message.content,
    })),
    steps: ["gather_context"],
  };
}

async function classifyIntentNode(state: AgentState, model: MarketingChatModel | null) {
  const modelIntent = await invokeWithTelemetry(
    model,
    [
      {
        role: "system",
        content:
          "Classify the user request as exactly one of: generate_ad_content, plan_campaign, launch_campaign, report_metrics, general_help. Return only the label.",
      },
      { role: "user", content: state.input },
    ],
    "classify_intent",
  );

  return {
    intent: parseIntent(modelIntent) ?? classifyIntentHeuristic(state.input),
    steps: ["classify_intent"],
  };
}

async function generateAdContentNode(state: AgentState, model: MarketingChatModel | null) {
  const fallback = buildFallbackDraft(state);
  const modelDraft = await invokeStructuredWithTelemetry(
    model,
    [
      {
        role: "system",
        content:
          "Create an ad draft for Meta Ads (Facebook + Instagram) ONLY. Always set platform to \"meta\" — Google Ads support is not available in this build. Fill objective, budget, audience, headlines, descriptions, and targetingNotes from the user's request and business context.",
      },
      {
        role: "user",
        content: JSON.stringify({
          request: state.input,
          businessContext: state.businessContext,
          history: state.messages.slice(-6),
        }),
      },
    ],
    draftCampaignSchema,
    "generate_ad_content",
  );

  return {
    draftCampaign: modelDraft ? mergeDraftWithFallback(modelDraft, fallback) : fallback,
    steps: ["generate_ad_content"],
  };
}

async function planCampaignNode(state: AgentState, model: MarketingChatModel | null) {
  const draft = state.draftCampaign ?? buildFallbackDraft(state);
  const modelPlan = await invokeStructuredWithTelemetry(
    model,
    [
      {
        role: "system",
        content:
          "Improve this Meta Ads (Facebook + Instagram) campaign plan. Enhance the objective, headlines, descriptions, and targeting notes. Keep platform = \"meta\" — Google Ads is not supported in this build.",
      },
      { role: "user", content: JSON.stringify({ request: state.input, draft }) },
    ],
    draftCampaignSchema,
    "plan_campaign",
  );
  const plannedDraft = modelPlan ? mergeDraftWithFallback(modelPlan, draft) : draft;
  const preview = await previewCampaign(plannedDraft);
  const approvalRequest =
    state.intent === "launch_campaign"
      ? {
          action: "launch_campaign" as const,
          summary: stringifyToolResult(preview),
          draftCampaign: { ...plannedDraft, requiresApproval: true },
        }
      : undefined;

  return {
    draftCampaign: approvalRequest?.draftCampaign ?? plannedDraft,
    approvalRequest,
    executionResult:
      state.intent === "launch_campaign"
        ? { status: "pending_approval" as const, detail: "Waiting for human approval before launch." }
        : { status: "skipped" as const, detail: stringifyToolResult(preview) },
    steps: ["plan_campaign"],
  };
}

function humanApprovalNode(state: AgentState) {
  const approvalRequest = state.approvalRequest;
  if (!approvalRequest) {
    return new Command({
      update: {
        executionResult: {
          status: "skipped",
          detail: "No launch approval was required.",
        },
        steps: ["human_approval"],
      },
      goto: "summarize_report",
    });
  }

  const decision = interrupt(approvalRequest) as { approved?: boolean; feedback?: string } | boolean;
  const approved = typeof decision === "boolean" ? decision : Boolean(decision.approved);

  if (!approved) {
    const feedback = typeof decision === "object" ? decision.feedback : undefined;
    return new Command({
      update: {
        executionResult: {
          status: "skipped",
          detail: feedback ? `Launch rejected: ${feedback}` : "Launch rejected by reviewer.",
        },
        steps: ["human_approval"],
      },
      goto: "summarize_report",
    });
  }

  return new Command({
    update: {
      steps: ["human_approval"],
    },
    goto: "execute_action",
  });
}

async function executeActionNode(state: AgentState) {
  if (!state.draftCampaign) {
    return {
      executionResult: {
        status: "skipped" as const,
        detail: "No draft campaign was available to execute.",
      },
      steps: ["execute_action"],
    };
  }

  const result = await executeCampaign(state.draftCampaign, { userId: state.userId });
  return {
    executionResult: {
      status: "executed" as const,
      detail: stringifyToolResult(result),
    },
    steps: ["execute_action"],
  };
}

async function reportNode(state: AgentState, model: MarketingChatModel | null) {
  return {
    report: await formatReport(state, model),
    steps: ["report"],
  };
}

function routeAfterIntent(state: AgentState) {
  switch (state.intent) {
    case "generate_ad_content":
    case "launch_campaign":
      return "generate_ad_content";
    case "plan_campaign":
      return "plan_campaign";
    case "report_metrics":
    case "general_help":
      return "summarize_report";
    default: {
      const exhaustive: never = state.intent;
      return exhaustive;
    }
  }
}

function routeAfterPlan(state: AgentState) {
  return state.intent === "launch_campaign" ? "human_approval" : "summarize_report";
}

function classifyIntentHeuristic(input: string): AgentIntent {
  const lower = input.toLowerCase();
  if (
    /\b(headlines?|ad\s+copy|copy|descriptions?|creatives?|ad\s+text|write\s+(three\s+)?google\s+ads?)\b/.test(
      lower,
    )
  ) {
    return "generate_ad_content";
  }
  if (/\b(launch|publish|go live|activate|execute)\b/.test(lower)) return "launch_campaign";
  if (/\b(report|metrics|performance|spend|clicks|conversions|impressions)\b/.test(lower)) {
    return "report_metrics";
  }
  if (/\b(plan|budget|target|audience|campaign)\b/.test(lower)) return "plan_campaign";
  return "general_help";
}

function parseIntent(content: string | null): AgentIntent | null {
  const normalized = content?.trim().toLowerCase().replace(/[^a-z_]/g, "");
  if (!normalized) return null;
  return (["generate_ad_content", "plan_campaign", "launch_campaign", "report_metrics", "general_help"] as const).find(
    (intent) => intent === normalized,
  ) ?? null;
}

function mergeDraftWithFallback(modelDraft: z.infer<typeof draftCampaignSchema>, fallback: DraftCampaign): DraftCampaign {
  return {
    // Meta-only mode: ignore whatever the LLM picked and force "meta".
    platform: "meta",
    objective: modelDraft.objective || fallback.objective,
    budget: modelDraft.budget && modelDraft.budget.trim() !== "" ? modelDraft.budget : fallback.budget,
    audience: modelDraft.audience && modelDraft.audience.trim() !== "" ? modelDraft.audience : fallback.audience,
    headlines: modelDraft.headlines.length ? modelDraft.headlines : fallback.headlines,
    descriptions: modelDraft.descriptions.length ? modelDraft.descriptions : fallback.descriptions,
    targetingNotes: modelDraft.targetingNotes.length ? modelDraft.targetingNotes : fallback.targetingNotes,
    requiresApproval: fallback.requiresApproval || modelDraft.requiresApproval,
  };
}

function buildFallbackDraft(state: AgentState): DraftCampaign {
  const product = inferProductName(state.input, state.businessContext);
  const audience = inferAudience(state.input, state.businessContext);
  const objective = inferObjective(state.input, state.businessContext, product);
  const productTitle = toTitleCase(product);

  return {
    platform: inferPlatform(state.input),
    objective,
    budget: state.businessContext.defaultBudget,
    audience,
    headlines: [
      truncateHeadline(`Try ${productTitle}`),
      truncateHeadline(`Book ${productTitle}`),
      truncateHeadline("Reach Your Fitness Goals"),
    ],
    descriptions: [
      `Promote ${product} to ${audience} with a focused campaign.`,
      `Turn high-intent searches into booked sessions for ${product}.`,
    ],
    targetingNotes: [
      `Start with ${audience}.`,
      state.businessContext.goals ? `Optimize toward ${state.businessContext.goals}.` : "Optimize toward qualified leads.",
    ],
    requiresApproval: state.intent === "launch_campaign",
  };
}

function inferObjective(input: string, context: BusinessContext, product: string) {
  const lower = input.toLowerCase();
  if (lower.includes("lead")) return "Generate qualified leads";
  if (lower.includes("sale") || lower.includes("purchase")) return "Drive purchases";
  if (lower.includes("awareness")) return "Build awareness";
  if (product !== "your offer") return `Promote ${product}`;
  return context.goals ?? "Launch and validate a performance campaign";
}

function inferProductName(input: string, context: BusinessContext) {
  if (context.productName) return context.productName;

  const cleaned = input
    .replace(/\s+/g, " ")
    .replace(/[.?!]+$/g, "")
    .trim();
  const productMatch =
    /\bfor\s+(?:an?\s+|the\s+)?(.+?)(?:\s+product|\s+service|\s+brand|\s+business)?$/i.exec(cleaned);
  const rawProduct = productMatch?.[1]?.trim();
  if (!rawProduct) return "your offer";

  return rawProduct
    .replace(/^(?:an?\s+|the\s+)/i, "")
    .replace(/\b(google|meta|facebook|instagram)\s+ad\s+headlines?\s+for\s+/i, "")
    .trim();
}

function inferAudience(input: string, context: BusinessContext) {
  if (context.audience) return context.audience;

  const lower = input.toLowerCase();
  if (lower.includes("fitness") || lower.includes("coaching")) {
    return "people actively searching for fitness coaching";
  }
  return "high-intent prospects";
}

function truncateHeadline(headline: string) {
  return headline.length <= 30 ? headline : headline.slice(0, 30).trimEnd();
}

function toTitleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function inferPlatform(_input: string): DraftCampaign["platform"] {
  // Meta-only mode: Google Ads support is deferred to a later phase.
  return "meta";
}

async function formatReport(state: AgentState, model: MarketingChatModel | null) {
  if (state.intent === "report_metrics") {
    return [
      "I can report on campaign metrics once Phase 10 metric sync is connected.",
      "For now, I checked this thread context and found no live metric snapshots to summarize.",
    ].join("\n");
  }

  if (!state.draftCampaign) {
    const modelResponse = await invokeWithTelemetry(
      model,
      [
        {
          role: "system",
          content:
            "You are the AI Marketing Agent chat assistant. Answer conversational messages naturally in 1-3 short sentences. If useful, mention you can help with ad copy, campaign planning, approvals, and metrics. Do not ask for campaign details unless the user is actually asking to build or plan a campaign.",
        },
        ...state.messages.slice(-6).map((message) => ({
          role: message.role === "assistant" ? "assistant" as const : "user" as const,
          content: message.content,
        })),
        { role: "user" as const, content: state.input },
      ],
      "general_help",
    );

    return modelResponse?.trim() || formatGeneralHelpFallback(state.input);
  }

  const approvalLine =
    state.executionResult?.status === "pending_approval"
      ? "This campaign is waiting for human approval before any platform action."
      : state.executionResult?.detail;

  return [
    `Intent: ${state.intent.replace(/_/g, " ")}`,
    `Platform: ${state.draftCampaign.platform}`,
    `Objective: ${state.draftCampaign.objective}`,
    state.draftCampaign.budget ? `Budget: ${state.draftCampaign.budget}` : undefined,
    state.draftCampaign.audience ? `Audience: ${state.draftCampaign.audience}` : undefined,
    "Headlines:",
    ...state.draftCampaign.headlines.map((headline) => `- ${headline}`),
    "Descriptions:",
    ...state.draftCampaign.descriptions.map((description) => `- ${description}`),
    approvalLine,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatGeneralHelpFallback(input: string) {
  const lower = input.toLowerCase().trim();

  if (/^(hi|hello|hey|yo|hiya)\b[!. ]*$/.test(lower)) {
    return "Hi, I’m your AI Marketing Agent. I can help draft ads, plan campaigns, prep launches for approval, and summarize performance once metrics are connected.";
  }

  if (/\b(who are you|what are you|your name)\b/.test(lower)) {
    return "I’m the AI Marketing Agent for this workspace. I help turn marketing requests into ad copy, campaign plans, launch approval steps, and performance summaries.";
  }

  if (/\b(thanks|thank you)\b/.test(lower)) {
    return "You’re welcome. Send me an ad, audience, budget, or campaign question when you’re ready.";
  }

  return [
    "I’m here to help with marketing work.",
    "You can ask me to draft ad copy, plan budget and targeting, prepare a campaign for approval, or explain performance once metrics are connected.",
  ].join("\n");
}

function formatApprovalPrompt(approvalRequest: ApprovalRequest) {
  return [
    "Approval needed before launch.",
    approvalRequest.summary,
    `Objective: ${approvalRequest.draftCampaign.objective}`,
    "Reply with approval in the next workflow step before this can execute against ad platforms.",
  ].join("\n");
}

function toCheckpoint(threadId: string, state: AgentState): AgentCheckpoint {
  return {
    threadId,
    intent: state.intent,
    businessContext: state.businessContext,
    draftCampaign: state.draftCampaign,
    approvalRequest: state.approvalRequest,
    executionResult: state.executionResult,
    report: state.report,
    steps: state.steps,
    updatedAt: new Date().toISOString(),
  };
}

async function persistCheckpoint(prisma: PrismaClient, checkpoint: AgentCheckpoint) {
  await prisma.agentState.upsert({
    where: { threadId: checkpoint.threadId },
    create: {
      threadId: checkpoint.threadId,
      checkpoint: toJsonValue(checkpoint),
    },
    update: {
      checkpoint: toJsonValue(checkpoint),
    },
  });
}

function getInterruptPayload(result: unknown): ApprovalRequest | null {
  if (!result || typeof result !== "object" || !("__interrupt__" in result)) return null;

  const interrupts = (result as { __interrupt__?: Array<{ value?: unknown }> }).__interrupt__;
  const value = interrupts?.[0]?.value;
  const parsed = z
    .object({
      action: z.literal("launch_campaign"),
      summary: z.string(),
      draftCampaign: draftCampaignSchema,
    })
    .safeParse(value);

  return parsed.success ? parsed.data : null;
}

function stringifyToolResult(result: unknown) {
  if (typeof result === "string") return result;
  if (result && typeof result === "object" && "content" in result) {
    const content = result.content;
    return typeof content === "string" ? content : JSON.stringify(content);
  }
  return JSON.stringify(result);
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
