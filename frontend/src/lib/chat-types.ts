export type MessageRole = "user" | "assistant" | "system" | "tool";

export type CampaignIntakeField =
  | "campaignName"
  | "goal"
  | "offer"
  | "audience"
  | "location"
  | "ageRange"
  | "gender"
  | "interests"
  | "placements"
  | "budget"
  | "schedule"
  | "destinationUrl"
  | "cta"
  | "copyAngle"
  | "conversionEvent";

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

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  status?: "sent" | "streaming";
  metadata?: unknown;
  imageUrl?: string;
  imagePrompt?: string;
}

export interface ChatThread {
  id: string;
  title: string;
  preview: string;
  timestamp: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  unread?: number;
  pinned?: boolean;
}

export function formatRelativeTime(timestamp: string) {
  const then = new Date(timestamp).getTime();
  if (Number.isNaN(then)) return "now";

  const diffMinutes = Math.max(1, Math.round((Date.now() - then) / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;

  return `${Math.round(diffHours / 24)}d`;
}

export function isAssistantAwaitingLaunchApproval(metadata: unknown): boolean {
  return getAgentPendingAction(metadata)?.kind === "campaign_preview";
}

export function getAgentPendingAction(metadata: unknown): AgentPendingAction | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const agent = (metadata as { agent?: { pendingAction?: unknown } }).agent;
  const action = agent?.pendingAction;
  if (!action || typeof action !== "object" || !("kind" in action)) return undefined;
  return action as AgentPendingAction;
}
