export const agentIntents = [
  "create_post",
  "publish_post",
  "generate_ad_content",
  "plan_campaign",
  "launch_campaign",
  "report_metrics",
  "general_help",
] as const;

export type AgentIntent = (typeof agentIntents)[number];

export type AgentPlatform = "google" | "meta" | "both";

export interface AgentChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
}

export interface BusinessContext {
  productName?: string;
  audience?: string;
  goals?: string;
  defaultBudget?: string;
  brandVoice?: string;
}

export interface MetaSettingsContext {
  adAccountId?: string;
  pageId?: string;
  pixelId?: string;
  conversionEvent?: string;
  scopes?: string[];
}

export const postIntakeFields = [
  "postTopic",
  "businessName",
  "audience",
  "goal",
  "tone",
  "keyMessage",
] as const;

export type PostIntakeField = (typeof postIntakeFields)[number];

export type PostMediaType = "image" | "video";

export interface PostIntake {
  postTopic?: string;
  businessName?: string;
  audience?: string;
  goal?: string;
  tone?: string;
  keyMessage?: string;
  postLanguage?: string;
  mediaType?: PostMediaType;
}

export type RegenerationScope = "media" | "image" | "caption" | "hashtags" | "all";

export interface GeneratedPostMedia {
  mediaType: PostMediaType;
  requested: boolean;
  prompt?: string;
  revisedPrompt?: string;
  url?: string;
  path?: string;
  base64?: string;
  mimeType?: string;
  status: "generated" | "unavailable";
}

export type GeneratedPostImage = GeneratedPostMedia;

export interface DraftPost {
  topic: string;
  businessName?: string | undefined;
  audience?: string | undefined;
  goal?: string | undefined;
  language?: string | undefined;
  caption: string;
  hashtags: string[];
  mediaType: PostMediaType;
  imagePrompt: string;
  videoPrompt?: string | undefined;
  media?: GeneratedPostMedia | undefined;
  image?: GeneratedPostMedia | undefined;
  requiresApproval: boolean;
}

export interface ApprovalRequest {
  action: "publish_facebook_post";
  summary: string;
  draftPost: DraftPost;
  preview: PostPreview;
}

export interface ExecutionResult {
  status: "skipped" | "pending_approval" | "executed";
  detail: string;
}

export interface PostPreview {
  topic: string;
  businessName: string;
  audience: string;
  goal: string;
  language?: string;
  caption: string;
  hashtags: string[];
  pageId?: string;
  pageName?: string;
  mediaType: PostMediaType;
  media: GeneratedPostMedia;
  image: GeneratedPostMedia;
}

export type AgentPendingAction =
  | {
      kind: "field_question";
      field: PostIntakeField;
      question: string;
      progress: { answered: number; total: number };
    }
  | {
      kind: "post_preview";
      preview: PostPreview;
      summary: string;
    };

export type AgentResume =
  | {
      kind: "field_answer";
      field: PostIntakeField;
      value: string;
    }
  | {
      kind: "approval";
      approved: boolean;
      feedback?: string;
      regenerationScope?: RegenerationScope;
    };

export interface AgentCheckpoint {
  threadId: string;
  intent: AgentIntent;
  postLanguage?: string;
  replyLanguage?: string;
  businessContext: BusinessContext;
  metaSettings?: MetaSettingsContext;
  intake?: PostIntake;
  draftPost?: DraftPost;
  postPreview?: PostPreview;
  approvalRequest?: ApprovalRequest;
  executionResult?: ExecutionResult;
  report: string;
  pendingAction?: AgentPendingAction;
  steps: string[];
  updatedAt: string;
}

export interface RunAgentOptions {
  userId: string;
  threadId: string;
  input: string;
  /** When set, resumes the paused LangGraph interrupt instead of starting a new run from input. */
  resume?: AgentResume;
  onEvent?: (event: AgentStreamEvent) => void | Promise<void>;
}

export type AgentStreamEvent =
  | { type: "step"; name: string; detail: string }
  | { type: "checkpoint"; checkpoint: AgentCheckpoint }
  | { type: "message"; content: string }
  | { type: "image"; url: string; prompt: string }
  | { type: "media"; mediaType: PostMediaType; url: string; prompt: string };

export const campaignIntakeFields = postIntakeFields;
export type CampaignIntakeField = PostIntakeField;
export type CampaignIntake = PostIntake;
export type DraftCampaign = DraftPost;
export type CampaignPreview = PostPreview;
