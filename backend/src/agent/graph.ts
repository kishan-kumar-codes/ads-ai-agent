import { Annotation, Command, END, interrupt, START, StateGraph } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { publishFacebookPost } from "./adTools.js";
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
import { postIntakeFields } from "./types.js";

const MAX_HISTORY_MESSAGES = 20;

const intakeFields: CampaignIntakeField[] = [
  "postTopic",
  "businessName",
  "audience",
  "goal",
  "tone",
  "keyMessage",
];

const draftCampaignSchema = z.object({
  topic: z.string().min(1),
  businessName: z.string().default(""),
  audience: z.string().default(""),
  goal: z.string().default(""),
  caption: z.string().min(1),
  hashtags: z.array(z.string()).default([]),
  imagePrompt: z.string().min(1),
  requiresApproval: z.boolean().default(false),
});

const campaignPreviewSchema = z.object({
  topic: z.string(),
  businessName: z.string(),
  audience: z.string(),
  goal: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()).default([]),
  pageId: z.string().optional(),
  pageName: z.string().optional(),
  image: z.object({
    requested: z.boolean(),
    prompt: z.string().optional(),
    revisedPrompt: z.string().optional(),
    url: z.string().optional(),
    base64: z.string().optional(),
    mimeType: z.string().optional(),
    status: z.enum(["generated", "unavailable"]),
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
  regenerationScope: Annotation<"image" | "caption" | "hashtags" | "all" | undefined>({
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
    .addNode("execute_action", async (state) => executeActionNode(state, prisma))
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
    detail: "Starting Facebook post workflow.",
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
    : result.report || "I reviewed the request and prepared the next Facebook post step.";

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
      findFirst?: (args: unknown) => Promise<{ scope?: string | null } | null>;
      findUnique?: (args: unknown) => Promise<{ scope?: string | null } | null>;
    };
  }).platformConnection;

  if (!delegate) return {};

  const connection = delegate.findFirst
    ? await delegate.findFirst({
    where: { userId, platform: "meta" },
    select: { scope: true },
  })
    : await delegate.findUnique?.({
      where: { userId_platform: { userId, platform: "meta" } },
      select: { scope: true },
    });

  const metadata = parseMetaConnectionScope(connection?.scope);

  return {
    adAccountId: stringValue(metadata.adAccountId),
    pageId: stringValue(metadata.pageId),
    pixelId: stringValue(metadata.pixelId),
    conversionEvent: stringValue(metadata.conversionEvent),
    scopes: parseScopeList(connection?.scope),
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

function parseScopeList(scope: string | null | undefined): string[] {
  if (!scope?.trim()) return [];
  try {
    const parsed = JSON.parse(scope);
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { scopes?: unknown }).scopes)) {
      return (parsed as { scopes: unknown[] }).scopes.filter((item): item is string => typeof item === "string");
    }
  } catch {
    // Fall through to legacy comma-separated scope storage.
  }
  return scope.split(",").map((part) => part.trim()).filter(Boolean);
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
            "Classify whether the user is asking to create, draft, preview, regenerate, or publish a Facebook Page post. Return post if yes, otherwise general.",
        },
        { role: "user", content: state.input },
      ],
      "detect_post_need",
    );
    if (modelIntent?.trim().toLowerCase() === "post") {
      return {
        intent: "create_post" as const,
        intake: seedIntakeFromInput(state.input, state.intake, state.businessContext),
        steps: ["detect_post_need"],
      };
    }
  }

  return {
    intent: heuristic,
    intake: heuristic === "general_help" ? state.intake : seedIntakeFromInput(state.input, state.intake, state.businessContext),
    steps: ["detect_post_need"],
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
          [
            "Create a Facebook Page photo post draft from the collected intake.",
            "Return a realistic-image prompt, one caption, and focused hashtags.",
            "The image prompt must ask for a realistic visual, no text overlays, no logos unless provided, and no ad/campaign framing.",
            "Keep the caption natural and ready for human review.",
          ].join(" "),
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
    "draft_post",
  );

  return {
    draftCampaign: modelDraft ? mergeDraftWithFallback(modelDraft, fallback) : fallback,
    revisionFeedback: undefined,
    steps: ["draft_post"],
  };
}

function askImageChoiceNode(state: AgentState) {
  return {
    imageChoice: state.imageChoice ?? "yes",
    pendingAction: undefined,
    steps: ["image_required"],
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
  const imagePrompt = draft.imagePrompt || buildImagePrompt(draft, state.businessContext, state.intake);
  if (state.draftCampaign?.image?.status === "generated" && state.regenerationScope !== "image" && state.regenerationScope !== "all") {
    return {
      imagePrompt: state.draftCampaign.image.prompt ?? imagePrompt,
      imageUrl: state.draftCampaign.image.url,
      steps: ["maybe_generate_image"],
    };
  }

  const image = await generateImageWithTelemetry(model, imagePrompt);
  if (image?.url && onEvent) {
    await onEvent({ type: "image", url: image.url, prompt: image.prompt ?? imagePrompt });
  }

  return {
    draftCampaign: {
      ...draft,
      image: image ?? {
        requested: true,
        prompt: imagePrompt,
        status: "unavailable" as const,
      },
    },
    imagePrompt: image?.prompt ?? imagePrompt,
    imageUrl: image?.url ?? undefined,
    steps: ["maybe_generate_image"],
  };
}

function previewCampaignNode(state: AgentState) {
  const draft = state.draftCampaign ?? buildFallbackDraft(state);
  const preview = buildCampaignPreview(state, draft);
  return {
    campaignPreview: preview,
    approvalRequest: {
      action: "publish_facebook_post" as const,
      summary: `Review this Facebook post before I publish it to your connected Page.`,
      draftPost: { ...draft, requiresApproval: true },
      preview,
    },
    executionResult: {
      status: "pending_approval" as const,
      detail: "Waiting for review before publishing the Facebook post.",
    },
    steps: ["preview_post"],
  };
}

function humanReviewNode(state: AgentState) {
  const approvalRequest = state.approvalRequest;
  if (!approvalRequest) {
    return new Command({
      update: {
        executionResult: {
          status: "skipped",
          detail: "No Facebook post preview was ready for review.",
        },
        steps: ["human_review"],
      },
      goto: "summarize_report",
    });
  }

  const payload = {
    kind: "post_preview",
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
      revisionFeedback: feedback?.trim() || "Please improve the Facebook post preview before approval.",
      regenerationScope: decision.regenerationScope ?? inferRegenerationScope(feedback ?? ""),
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
  const regenerationScope = state.regenerationScope ?? inferRegenerationScope(feedback);
  const modelDraft = await invokeStructuredWithTelemetry(
    model,
    [
      {
        role: "system",
        content:
          [
            "Revise this Facebook Page post draft using the reviewer's feedback.",
            "Respect the regeneration scope exactly: if scope is image, keep caption and hashtags unchanged; if caption, keep image prompt and hashtags unchanged; if hashtags, keep image prompt and caption unchanged.",
          ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({ feedback, regenerationScope, intake: state.intake, draft }),
      },
    ],
    draftCampaignSchema,
    "revise_post",
  );

  const revised = modelDraft
    ? mergeDraftWithFallback(modelDraft, draft, regenerationScope)
    : reviseDraftFallback(draft, feedback, regenerationScope);
  return {
    draftCampaign: revised,
    campaignPreview: undefined,
    approvalRequest: undefined,
    executionResult: {
      status: "pending_approval" as const,
      detail: "Revised Facebook post preview is ready for review.",
    },
    steps: ["revise_post"],
  };
}

async function executeActionNode(state: AgentState, prisma: PrismaClient) {
  if (!state.draftCampaign) {
    return {
      executionResult: {
        status: "skipped" as const,
        detail: "No Facebook post draft was available to publish.",
      },
      steps: ["execute_action"],
    };
  }

  const result = await publishFacebookPost(state.draftCampaign, state.campaignPreview ?? buildCampaignPreview(state, state.draftCampaign), {
    userId: state.userId,
    prisma,
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
    case "create_post":
    case "publish_post":
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
  return intakeFields.find((field) => field === "postTopic" && !fieldIsAnswered(field, intake[field]));
}

function fieldIsAnswered(field: CampaignIntakeField, value: CampaignIntake[CampaignIntakeField]) {
  return typeof value === "string" && value.trim().length > 0;
}

function questionForField(field: CampaignIntakeField, state: AgentState) {
  const business = state.businessContext.productName ?? state.intake.businessName ?? "your business";
  const questions: Record<CampaignIntakeField, string> = {
    postTopic: `What type of Facebook post should I create for ${business}?`,
    businessName: "What business, product, or offer should this post represent?",
    audience: "Who should this Facebook post speak to?",
    goal: "What should this post accomplish: awareness, engagement, leads, or sales?",
    tone: "What tone should the caption use?",
    keyMessage: "What key message or offer must the post include?",
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
  return value;
}

function seedIntakeFromContext(
  current: CampaignIntake,
  context: BusinessContext,
  _metaSettings: MetaSettingsContext,
): CampaignIntake {
  return {
    ...current,
    businessName: current.businessName ?? context.productName,
    audience: current.audience ?? context.audience,
    goal: current.goal ?? context.goals,
    tone: current.tone ?? context.brandVoice,
  };
}

function seedIntakeFromInput(input: string, current: CampaignIntake, context: BusinessContext): CampaignIntake {
  const product = inferProductName(input, context);
  return {
    ...current,
    postTopic: current.postTopic ?? inferPostTopic(input),
    businessName: current.businessName ?? (product === "your offer" ? context.productName : product),
    goal: current.goal ?? inferObjective(input, context, product),
    audience: current.audience ?? inferAudience(input, context),
    keyMessage: current.keyMessage ?? inferKeyMessage(input),
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
  if (/\b(approve|launch|publish|go live|post it|execute)\b/.test(lower)) return "publish_post";
  if (/\b(post|facebook|caption|hashtags?|image|photo|visual|creative|campaign|meta ad|facebook ad|instagram ad|ad set|targeting|budget|plan)\b/.test(lower)) {
    return "create_post";
  }
  if (/\b(copy|write|content|social)\b/.test(lower)) {
    return "create_post";
  }
  return "general_help";
}

function mergeDraftWithFallback(
  modelDraft: z.infer<typeof draftCampaignSchema>,
  fallback: DraftCampaign,
  scope: "image" | "caption" | "hashtags" | "all" = "all",
): DraftCampaign {
  return {
    topic: modelDraft.topic || fallback.topic,
    businessName: modelDraft.businessName && modelDraft.businessName.trim() !== "" ? modelDraft.businessName : fallback.businessName,
    audience: modelDraft.audience && modelDraft.audience.trim() !== "" ? modelDraft.audience : fallback.audience,
    goal: modelDraft.goal && modelDraft.goal.trim() !== "" ? modelDraft.goal : fallback.goal,
    caption: scope === "image" || scope === "hashtags" ? fallback.caption : modelDraft.caption || fallback.caption,
    hashtags: scope === "image" || scope === "caption"
      ? fallback.hashtags
      : normalizeHashtags(modelDraft.hashtags?.length ? modelDraft.hashtags : fallback.hashtags),
    imagePrompt: scope === "caption" || scope === "hashtags" ? fallback.imagePrompt : modelDraft.imagePrompt || fallback.imagePrompt,
    image: scope === "caption" || scope === "hashtags" ? fallback.image : undefined,
    requiresApproval: true,
  };
}

function reviseDraftFallback(
  draft: DraftCampaign,
  feedback: string,
  scope: "image" | "caption" | "hashtags" | "all",
): DraftCampaign {
  return {
    ...draft,
    caption: scope === "image" || scope === "hashtags"
      ? draft.caption
      : `${draft.caption}\n\nUpdated direction: ${feedback}`.trim(),
    hashtags: scope === "image" || scope === "caption"
      ? draft.hashtags
      : normalizeHashtags([...draft.hashtags, ...keywordsToHashtags(feedback)]).slice(0, 8),
    imagePrompt: scope === "caption" || scope === "hashtags"
      ? draft.imagePrompt
      : `${draft.imagePrompt} Revision requested: ${feedback}. Keep the visual realistic and Facebook-ready.`,
    image: scope === "caption" || scope === "hashtags" ? draft.image : undefined,
  };
}

function buildFallbackDraft(state: AgentState): DraftCampaign {
  const product = state.intake.businessName ?? inferProductName(state.input, state.businessContext);
  const audience = state.intake.audience ?? inferAudience(state.input, state.businessContext);
  const objective = state.intake.goal ?? inferObjective(state.input, state.businessContext, product);
  const topic = state.intake.postTopic ?? inferPostTopic(state.input);
  const keyMessage = state.intake.keyMessage ?? state.input;
  const tone = state.intake.tone ?? state.businessContext.brandVoice ?? "clear, helpful, and engaging";

  return {
    topic,
    businessName: product,
    audience,
    goal: objective,
    caption: `Bring ${product} to life with a ${topic.toLowerCase()} for ${audience}. ${keyMessage}`.trim(),
    hashtags: normalizeHashtags(keywordsToHashtags(`${product} ${topic} ${objective}`).slice(0, 6)),
    imagePrompt: buildFallbackImagePrompt(product, audience, topic, tone, keyMessage),
    requiresApproval: true,
  };
}

function buildCampaignPreview(state: AgentState, draft: DraftCampaign): CampaignPreview {
  const preview = {
    topic: draft.topic,
    businessName: draft.businessName ?? state.businessContext.productName ?? "Your business",
    audience: draft.audience ?? state.businessContext.audience ?? "Your audience",
    goal: draft.goal ?? state.businessContext.goals ?? "Engagement",
    caption: draft.caption,
    hashtags: normalizeHashtags(draft.hashtags),
    pageId: state.metaSettings.pageId,
    image: {
      requested: true,
      prompt: draft.image?.prompt ?? state.imagePrompt ?? draft.imagePrompt,
      revisedPrompt: draft.image?.revisedPrompt,
      url: draft.image?.url ?? state.imageUrl,
      base64: draft.image?.base64,
      mimeType: draft.image?.mimeType,
      status: draft.image?.url || draft.image?.base64 ? "generated" as const : "unavailable" as const,
    },
  };
  return campaignPreviewSchema.parse(preview);
}

function buildImagePrompt(draft: DraftCampaign, context: BusinessContext, intake: CampaignIntake): string {
  const product = context.productName ?? intake.businessName ?? draft.businessName ?? draft.topic;
  const audience = intake.audience ?? context.audience ?? draft.audience ?? "the target audience";
  const suffix = context.brandVoice || intake.tone ? " Style: " + (intake.tone ?? context.brandVoice) + "." : "";
  return buildFallbackImagePrompt(product, audience, draft.topic, suffix, intake.keyMessage ?? draft.caption);
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
    return state.executionResult.detail;
  }

  if (state.campaignPreview) {
    return "Here is the Facebook post preview. Approve it to publish, or request changes to regenerate the image, caption, hashtags, or all of it.";
  }

  return "I prepared the Facebook post draft and am ready for review.";
}

function formatGeneralHelpFallback(input: string) {
  const lower = input.toLowerCase().trim();

  if (/^(hi|hello|hey|yo|hiya)\b[!. ]*$/.test(lower)) {
    return "Hi, I’m your AI Marketing Agent. Tell me what type of Facebook post you want, and I’ll create a realistic image, caption, and hashtags for review.";
  }

  if (/\b(who are you|what are you|your name)\b/.test(lower)) {
    return "I’m the AI Marketing Agent for this workspace. I can draft Facebook posts with realistic images, captions, and hashtags, then wait for approval before publishing.";
  }

  if (/\b(thanks|thank you)\b/.test(lower)) {
    return "You’re welcome. Send me the post idea when you’re ready.";
  }

  return "I can help turn a post idea into a reviewed Facebook post with a realistic image, caption, and hashtags.";
}

function formatPendingActionMessage(action: AgentPendingAction) {
  switch (action.kind) {
    case "field_question":
      return action.question;
    case "post_preview":
      return "Here is the Facebook post preview. Review it, then approve it or choose what to regenerate.";
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
      field: z.enum(postIntakeFields as unknown as [CampaignIntakeField, ...CampaignIntakeField[]]),
      question: z.string(),
      progress: z.object({ answered: z.number(), total: z.number() }),
    })
    .safeParse(value);
  if (parsedField.success) return parsedField.data;

  const parsedPreview = z
    .object({
      kind: z.literal("post_preview"),
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
    draftPost: state.draftCampaign,
    postPreview: state.campaignPreview,
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
  if (lower.includes("engagement") || lower.includes("comment") || lower.includes("share")) return "Increase engagement";
  if (product !== "your offer") return `Promote ${product}`;
  return context.goals ?? "Create engagement";
}

function inferPostTopic(input: string) {
  const cleaned = input.replace(/\s+/g, " ").trim().replace(/[.?!]+$/g, "");
  const match = /\b(?:post|create|make|generate)\s+(?:a\s+|an\s+)?(.+?)(?:\s+for\b|$)/i.exec(cleaned);
  return match?.[1]?.trim() || cleaned || "Facebook brand post";
}

function inferKeyMessage(input: string) {
  const cleaned = input.replace(/\s+/g, " ").trim();
  return cleaned.length > 220 ? `${cleaned.slice(0, 217).trimEnd()}...` : cleaned;
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

function buildFallbackImagePrompt(
  product: string,
  audience: string,
  topic: string,
  tone: string,
  keyMessage: string,
) {
  return [
    `Create a realistic, high-quality photograph-style image for a Facebook Page post about ${topic}.`,
    `Brand or offer: ${product}.`,
    `Audience: ${audience}.`,
    `Message direction: ${keyMessage}.`,
    `Visual tone: ${tone}.`,
    "Use natural lighting, believable people or product context when appropriate, polished social-media composition, and no text overlays.",
  ].join(" ");
}

function normalizeHashtags(tags: string[]) {
  const seen = new Set<string>();
  return tags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
    .map((tag) => tag.replace(/[^\w#]/g, ""))
    .filter((tag) => tag.length > 1)
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 10);
}

function keywordsToHashtags(value: string) {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 2)
    .filter((part) => !/^(the|and|for|with|this|that|post|create|make|generate)$/i.test(part))
    .map((part) => `#${part.replace(/^./, (letter) => letter.toUpperCase())}`);
}

function inferRegenerationScope(feedback: string): "image" | "caption" | "hashtags" | "all" {
  const lower = feedback.toLowerCase();
  if (/\b(image|photo|visual|picture|graphic)\s+only\b/.test(lower)) return "image";
  if (/\b(caption|copy|text|wording)\s+only\b/.test(lower)) return "caption";
  if (/\b(hash\s*tag|hashtags?|tags?)\s+only\b/.test(lower)) return "hashtags";
  const mentionsImage = /\b(image|photo|visual|picture|graphic)\b/.test(lower);
  const mentionsCaption = /\b(caption|copy|text|wording)\b/.test(lower);
  const mentionsHashtags = /\b(hash\s*tag|hashtags?|tags?)\b/.test(lower);
  const count = [mentionsImage, mentionsCaption, mentionsHashtags].filter(Boolean).length;
  if (count !== 1) return "all";
  if (mentionsImage) return "image";
  if (mentionsCaption) return "caption";
  return "hashtags";
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
