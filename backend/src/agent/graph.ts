import { Annotation, Command, END, interrupt, START, StateGraph } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { executeCampaign } from "./adTools.js";
import { getMarketingCheckpointer } from "./checkpointer.js";
import { createMarketingChatModel, generateImageWithTelemetry, invokeStructuredWithTelemetry, invokeWithTelemetry, type MarketingChatModel } from "./model.js";
import type {
  AgentChatMessage,
  AgentCheckpoint,
  AgentIntent,
  AgentPendingAction,
  AgentResume,
  AgentStreamEvent,
  ApprovalRequest,
  BusinessContext,
  CampaignIntake,
  CampaignIntakeField,
  CampaignPreview,
  DraftCampaign,
  ExecutionResult,
  MetaSettingsContext,
  RunAgentOptions,
} from "./types.js";

const MAX_HISTORY_MESSAGES = 20;

const intakeFields: CampaignIntakeField[] = [
  "campaignName",
  "goal",
  "offer",
  "audience",
  "location",
  "ageRange",
  "gender",
  "interests",
  "placements",
  "budget",
  "schedule",
  "destinationUrl",
  "cta",
  "copyAngle",
  "conversionEvent",
];

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

const campaignPreviewSchema = z.object({
  campaignName: z.string(),
  goal: z.string(),
  offer: z.string(),
  audience: z.string(),
  location: z.string(),
  ageRange: z.string(),
  gender: z.string(),
  interests: z.array(z.string()).default([]),
  placements: z.array(z.string()).default([]),
  budget: z.string(),
  schedule: z.string(),
  destinationUrl: z.string(),
  cta: z.string(),
  copyAngle: z.string(),
  conversionEvent: z.string(),
  headlines: z.array(z.string()).default([]),
  descriptions: z.array(z.string()).default([]),
  targetingNotes: z.array(z.string()).default([]),
  image: z.object({
    requested: z.boolean(),
    prompt: z.string().optional(),
    url: z.string().optional(),
    status: z.enum(["generated", "declined", "unavailable"]),
  }),
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
  metaSettings: Annotation<MetaSettingsContext>({
    reducer: (_current, update) => update,
    default: () => ({}),
  }),
  intake: Annotation<CampaignIntake>({
    reducer: (current, update) => ({ ...current, ...update }),
    default: () => ({}),
  }),
  activeQuestion: Annotation<{ field: CampaignIntakeField; question: string } | undefined>({
    reducer: (_current, update) => update,
    default: () => undefined,
  }),
  imageChoice: Annotation<"yes" | "no" | undefined>({
    reducer: (_current, update) => update,
    default: () => undefined,
  }),
  imageUrl: Annotation<string | undefined>({
    reducer: (_current, update) => update,
    default: () => undefined,
  }),
  imagePrompt: Annotation<string | undefined>({
    reducer: (_current, update) => update,
    default: () => undefined,
  }),
  draftCampaign: Annotation<DraftCampaign | undefined>({
    reducer: (_current, update) => update,
    default: () => undefined,
  }),
  campaignPreview: Annotation<CampaignPreview | undefined>({
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
  pendingAction: Annotation<AgentPendingAction | undefined>({
    reducer: (_current, update) => update,
    default: () => undefined,
  }),
  revisionFeedback: Annotation<string | undefined>({
    reducer: (_current, update) => update,
    default: () => undefined,
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

export function createMarketingAgentGraph(
  { prisma, model = createMarketingChatModel() }: MarketingAgentDependencies,
  onEvent: RunAgentOptions["onEvent"] | undefined = undefined,
  checkpointer: BaseCheckpointSaver,
) {
  return new StateGraph(AgentGraphState)
    .addNode("gather_context", async (state) => gatherContextNode(state, prisma))
    .addNode("detect_campaign_need", async (state) => detectCampaignNeedNode(state, model))
    .addNode("ask_next_field", askNextFieldNode)
    .addNode("draft_campaign", async (state) => draftCampaignNode(state, model))
    .addNode("ask_image_choice", askImageChoiceNode)
    .addNode("maybe_generate_image", async (state) => maybeGenerateImageNode(state, model, onEvent))
    .addNode("preview_campaign", previewCampaignNode)
    .addNode("human_review", humanReviewNode, {
      ends: ["revise_campaign", "execute_action"],
    })
    .addNode("revise_campaign", async (state) => reviseCampaignNode(state, model))
    .addNode("execute_action", executeActionNode)
    .addNode("summarize_report", async (state) => reportNode(state, model))
    .addEdge(START, "gather_context")
    .addEdge("gather_context", "detect_campaign_need")
    .addConditionalEdges("detect_campaign_need", routeAfterCampaignDetection, [
      "ask_next_field",
      "summarize_report",
    ])
    .addConditionalEdges("ask_next_field", routeAfterIntakeQuestion, [
      "ask_next_field",
      "draft_campaign",
    ])
    .addEdge("draft_campaign", "ask_image_choice")
    .addConditionalEdges("ask_image_choice", routeAfterImageChoice, [
      "ask_image_choice",
      "maybe_generate_image",
    ])
    .addEdge("maybe_generate_image", "preview_campaign")
    .addEdge("preview_campaign", "human_review")
    .addEdge("revise_campaign", "preview_campaign")
    .addEdge("execute_action", "summarize_report")
    .addEdge("summarize_report", END)
    .compile({ checkpointer });
}

export async function runMarketingAgent(
  options: RunAgentOptions,
  dependencies: MarketingAgentDependencies,
) {
  await options.onEvent?.({
    type: "step",
    name: "agent_start",
    detail: "Starting Meta Ads workflow.",
  });

  const checkpointer = await getMarketingCheckpointer();
  const graph = createMarketingAgentGraph(dependencies, options.onEvent, checkpointer);

  const invokeConfig = {
    configurable: { thread_id: options.threadId } as const,
    recursionLimit: 60,
  };

  const result = options.resume
    ? await graph.invoke(new Command({ resume: options.resume }), invokeConfig)
    : await graph.invoke(
        {
          userId: options.userId,
          threadId: options.threadId,
          input: options.input,
          steps: [],
        },
        invokeConfig,
      );

  const interruptPayload = getInterruptPayload(result);
  const pendingAction = interruptPayload ? toPendingAction(interruptPayload) : undefined;
  const checkpoint = {
    ...toCheckpoint(options.threadId, result),
    pendingAction,
  };
  await persistCheckpoint(dependencies.prisma, checkpoint);

  await options.onEvent?.({ type: "checkpoint", checkpoint });

  const content = pendingAction
    ? formatPendingActionMessage(pendingAction)
    : result.report || "I reviewed the request and prepared the next campaign step.";

  await options.onEvent?.({ type: "message", content });

  return {
    content,
    checkpoint,
    interrupted: Boolean(pendingAction),
    pendingAction,
  };
}

async function gatherContextNode(state: AgentState, prisma: PrismaClient) {
  const [profile, messages, metaConnection] = await Promise.all([
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
    getMetaSettings(prisma, state.userId),
  ]);

  const businessContext = {
    productName: profile?.productName ?? undefined,
    audience: profile?.audience ?? undefined,
    goals: profile?.goals ?? undefined,
    defaultBudget: profile?.defaultBudget?.toString(),
    brandVoice: profile?.brandVoice ?? undefined,
  };

  return {
    businessContext,
    metaSettings: metaConnection,
    intake: seedIntakeFromContext(state.intake, businessContext, metaConnection),
    messages: messages.reverse().map((message) => ({
      role: message.role,
      content: message.content,
    })),
    steps: ["gather_context"],
  };
}

async function getMetaSettings(prisma: PrismaClient, userId: string): Promise<MetaSettingsContext> {
  const delegate = (prisma as unknown as {
    platformConnection?: {
      findFirst: (args: unknown) => Promise<{ scope?: string | null } | null>;
    };
  }).platformConnection;

  if (!delegate) return {};

  const connection = await delegate.findFirst({
    where: { userId, platform: "meta" },
    select: { scope: true },
  });

  const metadata = parseMetaConnectionScope(connection?.scope);

  return {
    adAccountId: stringValue(metadata.adAccountId),
    pageId: stringValue(metadata.pageId),
    pixelId: stringValue(metadata.pixelId),
    conversionEvent: stringValue(metadata.conversionEvent),
  };
}

function parseMetaConnectionScope(scope: string | null | undefined): Record<string, unknown> {
  if (!scope?.trim()) return {};
  try {
    const parsed = JSON.parse(scope);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

async function detectCampaignNeedNode(state: AgentState, model: MarketingChatModel | null) {
  const heuristic = classifyIntentHeuristic(state.input);
  if (heuristic === "general_help") {
    const modelIntent = await invokeWithTelemetry(
      model,
      [
        {
          role: "system",
          content:
            "Classify whether the user is asking to create, plan, draft, or launch a Meta ad campaign. Return campaign if yes, otherwise general.",
        },
        { role: "user", content: state.input },
      ],
      "detect_campaign_need",
    );
    if (modelIntent?.trim().toLowerCase() === "campaign") {
      return { intent: "plan_campaign" as const, steps: ["detect_campaign_need"] };
    }
  }

  return {
    intent: heuristic,
    intake: heuristic === "general_help" ? state.intake : seedIntakeFromInput(state.input, state.intake, state.businessContext),
    steps: ["detect_campaign_need"],
  };
}

function askNextFieldNode(state: AgentState) {
  const field = nextMissingField(state.intake);
  if (!field) {
    return {
      pendingAction: undefined,
      activeQuestion: undefined,
      steps: ["intake_complete"],
    };
  }

  const resume = readLastFieldAnswer(state.messages, field, state.input);
  if (resume) {
    return applyFieldResume(field, resume, questionForField(field, state), state.intake);
  }

  const question = questionForField(field, state);
  const answer = interrupt({
    kind: "field_question",
    field,
    question,
    progress: intakeProgress(state.intake),
  }) as AgentResume;

  if (!answer || answer.kind !== "field_answer" || answer.field !== field) {
    const retryQuestion = `I need ${fieldLabel(field).toLowerCase()} before I can build the preview. ${question}`;
    const retryAnswer = interrupt({
      kind: "field_question",
      field,
      question: retryQuestion,
      progress: intakeProgress(state.intake),
    }) as AgentResume;
    return applyFieldResume(field, retryAnswer, retryQuestion, state.intake);
  }

  return applyFieldResume(field, answer, question, state.intake);
}

function applyFieldResume(field: CampaignIntakeField, resume: AgentResume, question: string, intake: CampaignIntake) {
  if (!resume || resume.kind !== "field_answer" || resume.field !== field || !resume.value.trim()) {
    return {
      activeQuestion: { field, question },
      pendingAction: {
        kind: "field_question" as const,
        field,
        question,
        progress: intakeProgress(intake),
      },
      steps: ["validate_answer"],
    };
  }

  return {
    intake: { [field]: normalizeFieldAnswer(field, resume.value) },
    activeQuestion: undefined,
    pendingAction: undefined,
    steps: ["validate_answer"],
  };
}

function readLastFieldAnswer(messages: AgentChatMessage[], field: CampaignIntakeField, originalInput: string): AgentResume | undefined {
  const last = [...messages].reverse().find((message) => message.role === "user");
  if (!last?.content.trim()) return undefined;
  const value = last.content.trim();
  if (value === originalInput.trim()) return undefined;
  return { kind: "field_answer", field, value };
}

async function draftCampaignNode(state: AgentState, model: MarketingChatModel | null) {
  const fallback = buildFallbackDraft(state);
  const modelDraft = await invokeStructuredWithTelemetry(
    model,
    [
      {
        role: "system",
        content:
          "Create a Meta Ads campaign draft from the collected intake. Return objective, budget, audience, headlines, descriptions, and targeting notes. Keep it practical and ready for human review.",
      },
      {
        role: "user",
        content: JSON.stringify({
          intake: state.intake,
          businessContext: state.businessContext,
          revisionFeedback: state.revisionFeedback,
        }),
      },
    ],
    draftCampaignSchema,
    "draft_campaign",
  );

  return {
    draftCampaign: modelDraft ? mergeDraftWithFallback(modelDraft, fallback) : fallback,
    revisionFeedback: undefined,
    steps: ["draft_campaign"],
  };
}

function askImageChoiceNode(state: AgentState) {
  if (state.imageChoice) {
    return { steps: ["ask_image_choice"] };
  }

  const payload = {
    kind: "image_choice",
    question: "Do you want me to generate an image for this ad?",
  } as const;
  const answer = interrupt(payload) as AgentResume;

  const choice = answer?.kind === "image_choice" ? answer.choice : parseImageChoice(readLastUserMessage(state.messages) ?? "");
  if (!choice) {
    const retryAnswer = interrupt(payload) as AgentResume;
    if (retryAnswer?.kind !== "image_choice") {
      return {
        imageChoice: undefined,
        pendingAction: undefined,
        steps: ["ask_image_choice"],
      };
    }
    return {
      imageChoice: retryAnswer.choice,
      pendingAction: undefined,
      steps: ["ask_image_choice"],
    };
  }

  return {
    imageChoice: choice,
    pendingAction: undefined,
    steps: ["ask_image_choice"],
  };
}

function readLastUserMessage(messages: AgentChatMessage[]) {
  return [...messages].reverse().find((message) => message.role === "user")?.content;
}

async function maybeGenerateImageNode(
  state: AgentState,
  model: MarketingChatModel | null,
  onEvent?: RunAgentOptions["onEvent"],
) {
  const draft = state.draftCampaign ?? buildFallbackDraft(state);
  const imagePrompt = buildImagePrompt(draft, state.businessContext, state.intake);
  if (state.imageChoice !== "yes") {
    return {
      imagePrompt,
      imageUrl: undefined,
      steps: ["maybe_generate_image"],
    };
  }

  const imageUrl = await generateImageWithTelemetry(model, imagePrompt);
  if (imageUrl && onEvent) {
    await onEvent({ type: "image", url: imageUrl, prompt: imagePrompt });
  }

  return {
    imagePrompt,
    imageUrl: imageUrl ?? undefined,
    steps: ["maybe_generate_image"],
  };
}

function previewCampaignNode(state: AgentState) {
  const draft = state.draftCampaign ?? buildFallbackDraft(state);
  const preview = buildCampaignPreview(state, draft);
  return {
    campaignPreview: preview,
    approvalRequest: {
      action: "launch_campaign" as const,
      summary: `Review ${preview.campaignName} before I create a paused campaign shell.`,
      draftCampaign: { ...draft, requiresApproval: true },
      preview,
    },
    executionResult: {
      status: "pending_approval" as const,
      detail: "Waiting for review before creating a paused campaign shell.",
    },
    steps: ["preview_campaign"],
  };
}

function humanReviewNode(state: AgentState) {
  const approvalRequest = state.approvalRequest;
  if (!approvalRequest) {
    return new Command({
      update: {
        executionResult: {
          status: "skipped",
          detail: "No campaign preview was ready for review.",
        },
        steps: ["human_review"],
      },
      goto: "summarize_report",
    });
  }

  const payload = {
    kind: "campaign_preview",
    preview: approvalRequest.preview,
    summary: approvalRequest.summary,
  } as const;
  const decision = interrupt(payload) as AgentResume;

  const resolvedDecision = decision?.kind === "approval"
    ? decision
    : inferApprovalFromLastMessage(readLastUserMessage(state.messages) ?? "");

  if (!resolvedDecision) {
    const retryDecision = interrupt(payload) as AgentResume;
    return handleReviewDecision(
      retryDecision?.kind === "approval" ? retryDecision : { kind: "approval", approved: false },
    );
  }

  return handleReviewDecision(resolvedDecision);
}

function handleReviewDecision(decision: Extract<AgentResume, { kind: "approval" }>) {
  if (decision.approved) {
    return new Command({
      update: {
        pendingAction: undefined,
        steps: ["human_review"],
      },
      goto: "execute_action",
    });
  }

  const feedback = decision.feedback;
  return new Command({
    update: {
      revisionFeedback: feedback?.trim() || "Please improve the campaign preview before approval.",
      executionResult: {
        status: "skipped",
        detail: "Preview sent back for revision.",
      },
      pendingAction: undefined,
      steps: ["human_review"],
    },
    goto: "revise_campaign",
  });
}

function inferApprovalFromLastMessage(content: string): Extract<AgentResume, { kind: "approval" }> | undefined {
  const trimmed = content.trim();
  if (!trimmed) return undefined;
  if (/\b(approve|approved|yes|go ahead|publish|go live|launch)\b/i.test(trimmed)) {
    return { kind: "approval", approved: true };
  }
  if (/\b(reject|revise|change|cancel|no)\b/i.test(trimmed)) {
    return { kind: "approval", approved: false, feedback: trimmed };
  }
  return undefined;
}

async function reviseCampaignNode(state: AgentState, model: MarketingChatModel | null) {
  const draft = state.draftCampaign ?? buildFallbackDraft(state);
  const feedback = state.revisionFeedback ?? "Improve the preview.";
  const modelDraft = await invokeStructuredWithTelemetry(
    model,
    [
      {
        role: "system",
        content:
          "Revise this Meta Ads campaign draft using the reviewer's feedback. Keep the output structured and approval-ready.",
      },
      {
        role: "user",
        content: JSON.stringify({ feedback, intake: state.intake, draft }),
      },
    ],
    draftCampaignSchema,
    "revise_campaign",
  );

  const revised = modelDraft ? mergeDraftWithFallback(modelDraft, draft) : reviseDraftFallback(draft, feedback);
  return {
    draftCampaign: revised,
    campaignPreview: undefined,
    approvalRequest: undefined,
    executionResult: {
      status: "pending_approval" as const,
      detail: "Revised campaign preview is ready for review.",
    },
    steps: ["revise_campaign"],
  };
}

async function executeActionNode(state: AgentState) {
  if (!state.draftCampaign) {
    return {
      executionResult: {
        status: "skipped" as const,
        detail: "No campaign draft was available to create.",
      },
      steps: ["execute_action"],
    };
  }

  const result = await executeCampaign(state.draftCampaign, {
    userId: state.userId,
    campaignName: state.campaignPreview?.campaignName ?? state.intake.campaignName,
  });
  return {
    executionResult: {
      status: "executed" as const,
      detail: stringifyToolResult(result),
    },
    pendingAction: undefined,
    steps: ["execute_action"],
  };
}

async function reportNode(state: AgentState, model: MarketingChatModel | null) {
  return {
    report: await formatReport(state, model),
    steps: ["report"],
  };
}

function routeAfterCampaignDetection(state: AgentState) {
  switch (state.intent) {
    case "generate_ad_content":
    case "plan_campaign":
    case "launch_campaign":
      return "ask_next_field";
    case "report_metrics":
    case "general_help":
      return "summarize_report";
    default: {
      const exhaustive: never = state.intent;
      return exhaustive;
    }
  }
}

function routeAfterIntakeQuestion(state: AgentState) {
  return nextMissingField(state.intake) ? "ask_next_field" : "draft_campaign";
}

function routeAfterImageChoice(state: AgentState) {
  return state.imageChoice ? "maybe_generate_image" : "ask_image_choice";
}

function nextMissingField(intake: CampaignIntake) {
  return intakeFields.find((field) => !fieldIsAnswered(field, intake[field]));
}

function fieldIsAnswered(field: CampaignIntakeField, value: CampaignIntake[CampaignIntakeField]) {
  if (Array.isArray(value)) return value.length > 0;
  if (field === "conversionEvent") return typeof value === "string" && value.trim().length > 0;
  return typeof value === "string" && value.trim().length > 0;
}

function questionForField(field: CampaignIntakeField, state: AgentState) {
  const product = state.businessContext.productName ?? state.intake.offer ?? "the offer";
  const questions: Record<CampaignIntakeField, string> = {
    campaignName: "What should we call this campaign?",
    goal: "What is the main goal: leads, sales, traffic, awareness, engagement, or app promotion?",
    offer: `What product, service, or offer are we promoting${product !== "the offer" ? ` for ${product}` : ""}?`,
    audience: "Who is the target audience?",
    location: "Which location should the ads target?",
    ageRange: "What age range should we target?",
    gender: "Should targeting include all genders, or a specific gender?",
    interests: "Which interests or behaviors should we use for targeting?",
    placements: "Which placements should we use: Facebook feed, Instagram feed, Stories, Reels, or Advantage+ placements?",
    budget: "What budget should we use, and is it daily or lifetime?",
    schedule: "When should the campaign start and end?",
    destinationUrl: "What destination URL should the ad send people to?",
    cta: "What call-to-action should the ad use?",
    copyAngle: "What creative angle should the copy lead with?",
    conversionEvent: state.metaSettings.conversionEvent
      ? "Which conversion event should this optimize for?"
      : "Which conversion event should this optimize for, such as lead, purchase, or complete registration?",
  };
  return questions[field];
}

function intakeProgress(intake: CampaignIntake) {
  const answered = intakeFields.filter((field) => fieldIsAnswered(field, intake[field])).length;
  return { answered, total: intakeFields.length };
}

function fieldLabel(field: CampaignIntakeField) {
  return field.replace(/[A-Z]/g, (match) => ` ${match.toLowerCase()}`).replace(/^./, (c) => c.toUpperCase());
}

function normalizeFieldAnswer(field: CampaignIntakeField, raw: string) {
  const value = raw.trim();
  if (field === "interests" || field === "placements") {
    return splitList(value);
  }
  return value;
}

function splitList(value: string) {
  return value
    .split(/,|\band\b/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function seedIntakeFromContext(
  current: CampaignIntake,
  context: BusinessContext,
  metaSettings: MetaSettingsContext,
): CampaignIntake {
  return {
    ...current,
    offer: current.offer ?? context.productName,
    audience: current.audience ?? context.audience,
    budget: current.budget ?? context.defaultBudget,
    goal: current.goal ?? context.goals,
    conversionEvent: current.conversionEvent ?? metaSettings.conversionEvent,
  };
}

function seedIntakeFromInput(input: string, current: CampaignIntake, context: BusinessContext): CampaignIntake {
  const product = inferProductName(input, context);
  return {
    ...current,
    offer: current.offer ?? (product === "your offer" ? undefined : product),
    goal: current.goal ?? inferObjective(input, context, product),
    audience: current.audience ?? inferAudience(input, context),
  };
}

function parseImageChoice(input: string): "yes" | "no" | undefined {
  const lower = input.toLowerCase();
  if (/\b(no|skip|without image|copy only)\b/.test(lower)) return "no";
  if (/\b(yes|generate|image|photo|visual|picture|banner)\b/.test(lower)) return "yes";
  return undefined;
}

function classifyIntentHeuristic(input: string): AgentIntent {
  const lower = input.toLowerCase();
  if (/\b(report|metrics|performance|spend|clicks|conversions|impressions)\b/.test(lower)) {
    return "report_metrics";
  }
  if (/\b(launch|publish|go live|activate|execute)\b/.test(lower)) return "launch_campaign";
  if (/\b(campaign|meta ad|facebook ad|instagram ad|ad set|targeting|budget|plan)\b/.test(lower)) {
    return "plan_campaign";
  }
  if (/\b(headlines?|ad\s+copy|copy|descriptions?|creatives?|ad\s+text|write\s+(three\s+)?ads?)\b/.test(lower)) {
    return "generate_ad_content";
  }
  return "general_help";
}

function mergeDraftWithFallback(modelDraft: z.infer<typeof draftCampaignSchema>, fallback: DraftCampaign): DraftCampaign {
  return {
    platform: "meta",
    objective: modelDraft.objective || fallback.objective,
    budget: modelDraft.budget && modelDraft.budget.trim() !== "" ? modelDraft.budget : fallback.budget,
    audience: modelDraft.audience && modelDraft.audience.trim() !== "" ? modelDraft.audience : fallback.audience,
    headlines: modelDraft.headlines.length ? modelDraft.headlines : fallback.headlines,
    descriptions: modelDraft.descriptions.length ? modelDraft.descriptions : fallback.descriptions,
    targetingNotes: modelDraft.targetingNotes.length ? modelDraft.targetingNotes : fallback.targetingNotes,
    requiresApproval: true,
  };
}

function reviseDraftFallback(draft: DraftCampaign, feedback: string): DraftCampaign {
  return {
    ...draft,
    headlines: draft.headlines.map((headline, index) => (
      index === 0 ? truncateHeadline(`${headline} - improved`) : headline
    )),
    descriptions: [
      `Updated based on feedback: ${feedback}`,
      ...draft.descriptions,
    ].slice(0, 3),
  };
}

function buildFallbackDraft(state: AgentState): DraftCampaign {
  const product = state.intake.offer ?? inferProductName(state.input, state.businessContext);
  const audience = state.intake.audience ?? inferAudience(state.input, state.businessContext);
  const objective = state.intake.goal ?? inferObjective(state.input, state.businessContext, product);
  const productTitle = toTitleCase(product);

  return {
    platform: "meta",
    objective,
    budget: state.intake.budget ?? state.businessContext.defaultBudget,
    audience,
    headlines: [
      truncateHeadline(`Try ${productTitle}`),
      truncateHeadline(`Discover ${productTitle}`),
      truncateHeadline(`Start With ${productTitle}`),
    ],
    descriptions: [
      `Promote ${product} to ${audience} with a focused Meta campaign.`,
      `${state.intake.copyAngle ?? "Lead with a clear benefit"} and invite people to ${state.intake.cta ?? "learn more"}.`,
    ],
    targetingNotes: [
      `Target ${audience}.`,
      state.intake.location ? `Focus location: ${state.intake.location}.` : "Use the selected campaign location.",
      state.intake.interests?.length ? `Interest stack: ${state.intake.interests.join(", ")}.` : "Use relevant interest targeting.",
    ],
    requiresApproval: true,
  };
}

function buildCampaignPreview(state: AgentState, draft: DraftCampaign): CampaignPreview {
  const preview = {
    campaignName: state.intake.campaignName ?? draft.objective,
    goal: state.intake.goal ?? draft.objective,
    offer: state.intake.offer ?? state.businessContext.productName ?? "Offer to confirm",
    audience: state.intake.audience ?? draft.audience ?? "Audience to confirm",
    location: state.intake.location ?? "Location to confirm",
    ageRange: state.intake.ageRange ?? "All eligible ages",
    gender: state.intake.gender ?? "All genders",
    interests: state.intake.interests ?? [],
    placements: state.intake.placements ?? ["Advantage+ placements"],
    budget: state.intake.budget ?? draft.budget ?? "Budget to confirm",
    schedule: state.intake.schedule ?? "Schedule to confirm",
    destinationUrl: state.intake.destinationUrl ?? "",
    cta: state.intake.cta ?? "Learn More",
    copyAngle: state.intake.copyAngle ?? "Benefit-led creative",
    conversionEvent: state.intake.conversionEvent ?? state.metaSettings.conversionEvent ?? "lead",
    headlines: draft.headlines,
    descriptions: draft.descriptions,
    targetingNotes: draft.targetingNotes,
    image: {
      requested: state.imageChoice === "yes",
      prompt: state.imagePrompt,
      url: state.imageUrl,
      status: state.imageChoice === "yes"
        ? state.imageUrl ? "generated" as const : "unavailable" as const
        : "declined" as const,
    },
  };
  return campaignPreviewSchema.parse(preview);
}

function buildImagePrompt(draft: DraftCampaign, context: BusinessContext, intake: CampaignIntake): string {
  const product = context.productName ?? intake.offer ?? draft.objective;
  const audience = intake.audience ?? context.audience ?? draft.audience ?? "the target audience";
  const headline = draft.headlines[0] ?? draft.objective;
  const suffix = context.brandVoice ? " Style: " + context.brandVoice + "." : "";
  return (
    "Professional advertising creative for "
    + JSON.stringify(product)
    + ". Audience: " + audience
    + ". Headline concept: " + JSON.stringify(headline)
    + ". Designed for Facebook and Instagram placements."
    + suffix + " No text overlays."
  );
}

async function formatReport(state: AgentState, model: MarketingChatModel | null) {
  if (state.intent === "report_metrics") {
    return [
      "I can help summarize campaign performance once metric sync is connected.",
      "Right now I do not see live metric data in this chat to report on.",
    ].join("\n");
  }

  if (!state.draftCampaign) {
    const modelResponse = await invokeWithTelemetry(
      model,
      [
        {
          role: "system",
          content:
            "You are a helpful AI Marketing Agent. Reply naturally in 1-3 short sentences. Do not mention internal classifier labels.",
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

  if (state.executionResult?.status === "executed") {
    return "Approved. I created the paused campaign shell so it can be reviewed in Ads Manager before anything goes live.";
  }

  if (state.campaignPreview) {
    return "Here is the campaign preview. Review the card and approve it, or send it back with feedback.";
  }

  return "I prepared the campaign draft and am ready for the next review step.";
}

function formatGeneralHelpFallback(input: string) {
  const lower = input.toLowerCase().trim();

  if (/^(hi|hello|hey|yo|hiya)\b[!. ]*$/.test(lower)) {
    return "Hi, I’m your AI Marketing Agent. Tell me what you want to promote and I’ll guide you through the Meta ad setup one question at a time.";
  }

  if (/\b(who are you|what are you|your name)\b/.test(lower)) {
    return "I’m the AI Marketing Agent for this workspace. I can help plan ads, shape creative, prepare a preview, and wait for your approval before creating anything.";
  }

  if (/\b(thanks|thank you)\b/.test(lower)) {
    return "You’re welcome. Send me the offer you want to promote when you’re ready.";
  }

  return "I can help turn a campaign idea into a reviewed Meta ad preview. Tell me what you want to promote and I’ll ask for the details one step at a time.";
}

function formatPendingActionMessage(action: AgentPendingAction) {
  switch (action.kind) {
    case "field_question":
      return action.question;
    case "image_choice":
      return action.question;
    case "campaign_preview":
      return "Here is the campaign preview. Review the details, then approve it or send it back with feedback.";
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

function toPendingAction(value: unknown): AgentPendingAction | undefined {
  const parsedField = z
    .object({
      kind: z.literal("field_question"),
      field: z.enum(intakeFields as [CampaignIntakeField, ...CampaignIntakeField[]]),
      question: z.string(),
      progress: z.object({ answered: z.number(), total: z.number() }),
    })
    .safeParse(value);
  if (parsedField.success) return parsedField.data;

  const parsedImage = z
    .object({
      kind: z.literal("image_choice"),
      question: z.string(),
    })
    .safeParse(value);
  if (parsedImage.success) return parsedImage.data;

  const parsedPreview = z
    .object({
      kind: z.literal("campaign_preview"),
      preview: campaignPreviewSchema,
      summary: z.string(),
    })
    .safeParse(value);
  if (parsedPreview.success) return parsedPreview.data;

  return undefined;
}

function getInterruptPayload(result: unknown): unknown | null {
  if (!result || typeof result !== "object" || !("__interrupt__" in result)) return null;
  const interrupts = (result as { __interrupt__?: Array<{ value?: unknown }> }).__interrupt__;
  return interrupts?.[0]?.value ?? null;
}

function toCheckpoint(threadId: string, state: AgentState): AgentCheckpoint {
  return {
    threadId,
    intent: state.intent,
    businessContext: state.businessContext,
    metaSettings: state.metaSettings,
    intake: state.intake,
    draftCampaign: state.draftCampaign,
    campaignPreview: state.campaignPreview,
    approvalRequest: state.approvalRequest,
    executionResult: state.executionResult,
    report: state.report,
    pendingAction: state.pendingAction,
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
  return headline.length <= 40 ? headline : headline.slice(0, 40).trimEnd();
}

function toTitleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
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
