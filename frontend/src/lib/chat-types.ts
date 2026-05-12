export type MessageRole = "user" | "assistant" | "system" | "tool";

export type CampaignIntakeField =
  | "postTopic"
  | "businessName"
  | "audience"
  | "goal"
  | "tone"
  | "keyMessage";

export type RegenerationScope = "image" | "caption" | "hashtags" | "all";

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
  image: {
    requested: boolean;
    prompt?: string;
    revisedPrompt?: string;
    url?: string;
    base64?: string;
    mimeType?: string;
    status: "generated" | "unavailable";
  };
}

export type CampaignPreview = PostPreview;

export type AgentPendingAction =
  | {
      kind: "field_question";
      field: CampaignIntakeField;
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
      field: CampaignIntakeField;
      value: string;
    }
  | {
      kind: "approval";
      approved: boolean;
      feedback?: string;
      regenerationScope?: RegenerationScope;
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
  return getAgentPendingAction(metadata)?.kind === "post_preview";
}

export function getAgentPendingAction(metadata: unknown): AgentPendingAction | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const agent = (metadata as { agent?: { pendingAction?: unknown } }).agent;
  const action = agent?.pendingAction;
  if (!action || typeof action !== "object" || !("kind" in action)) return undefined;
  return action as AgentPendingAction;
}
