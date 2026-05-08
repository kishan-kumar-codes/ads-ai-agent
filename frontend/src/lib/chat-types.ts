export type MessageRole = "user" | "assistant" | "system" | "tool";

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
