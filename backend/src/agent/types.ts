export const agentIntents = [
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
}

export const campaignIntakeFields = [
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
] as const;

export type CampaignIntakeField = (typeof campaignIntakeFields)[number];

export interface CampaignIntake {
  campaignName?: string;
  goal?: string;
  offer?: string;
  audience?: string;
  location?: string;
  ageRange?: string;
  gender?: string;
  interests?: string[];
  placements?: string[];
  budget?: string;
  schedule?: string;
  destinationUrl?: string;
  cta?: string;
  copyAngle?: string;
  conversionEvent?: string;
}

export interface DraftCampaign {
  platform: AgentPlatform;
  objective: string;
  budget?: string | undefined;
  audience?: string | undefined;
  headlines: string[];
  descriptions: string[];
  targetingNotes: string[];
  requiresApproval: boolean;
  imagePrompt?: string | undefined;
}

export interface ApprovalRequest {
  action: "launch_campaign";
  summary: string;
  draftCampaign: DraftCampaign;
  preview: CampaignPreview;
}

export interface ExecutionResult {
  status: "skipped" | "pending_approval" | "executed";
  detail: string;
}

export interface CampaignPreview {
  campaignName: string;
  goal: string;
  offer: string;
  audience: string;
  location: string;
  ageRange: string;
  gender: string;
  interests: string[];
  placements: string[];
  budget: string;
  schedule: string;
  destinationUrl: string;
  cta: string;
  copyAngle: string;
  conversionEvent: string;
  headlines: string[];
  descriptions: string[];
  targetingNotes: string[];
  image: {
    requested: boolean;
    prompt?: string;
    url?: string;
    status: "generated" | "declined" | "unavailable";
  };
}

export type AgentPendingAction =
  | {
      kind: "field_question";
      field: CampaignIntakeField;
      question: string;
      progress: { answered: number; total: number };
    }
  | {
      kind: "image_choice";
      question: string;
    }
  | {
      kind: "campaign_preview";
      preview: CampaignPreview;
      summary: string;
    };

export type AgentResume =
  | {
      kind: "field_answer";
      field: CampaignIntakeField;
      value: string;
    }
  | {
      kind: "image_choice";
      choice: "yes" | "no";
    }
  | {
      kind: "approval";
      approved: boolean;
      feedback?: string;
    };

export interface AgentCheckpoint {
  threadId: string;
  intent: AgentIntent;
  businessContext: BusinessContext;
  metaSettings?: MetaSettingsContext;
  intake?: CampaignIntake;
  draftCampaign?: DraftCampaign;
  campaignPreview?: CampaignPreview;
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
  | { type: "image"; url: string; prompt: string };
