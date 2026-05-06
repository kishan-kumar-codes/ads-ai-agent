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

export interface DraftCampaign {
  platform: AgentPlatform;
  objective: string;
  budget?: string | undefined;
  audience?: string | undefined;
  headlines: string[];
  descriptions: string[];
  targetingNotes: string[];
  requiresApproval: boolean;
}

export interface ApprovalRequest {
  action: "launch_campaign";
  summary: string;
  draftCampaign: DraftCampaign;
}

export interface ExecutionResult {
  status: "skipped" | "pending_approval" | "executed";
  detail: string;
}

export interface AgentCheckpoint {
  threadId: string;
  intent: AgentIntent;
  businessContext: BusinessContext;
  draftCampaign?: DraftCampaign;
  approvalRequest?: ApprovalRequest;
  executionResult?: ExecutionResult;
  report: string;
  steps: string[];
  updatedAt: string;
}

export interface RunAgentOptions {
  userId: string;
  threadId: string;
  input: string;
  onEvent?: (event: AgentStreamEvent) => void | Promise<void>;
}

export type AgentStreamEvent =
  | { type: "step"; name: string; detail: string }
  | { type: "checkpoint"; checkpoint: AgentCheckpoint }
  | { type: "message"; content: string };
