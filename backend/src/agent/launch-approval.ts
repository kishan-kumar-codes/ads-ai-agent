import type { PrismaClient } from "@prisma/client";
import { campaignIntakeFields, type AgentCheckpoint, type AgentPendingAction, type AgentResume, type CampaignIntakeField } from "./types.js";

export function checkpointAwaitingAgentAction(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const checkpoint = raw as AgentCheckpoint;
  return Boolean(checkpoint.pendingAction) || checkpoint.executionResult?.status === "pending_approval";
}

export function checkpointAwaitingLaunchApproval(raw: unknown): boolean {
  return checkpointAwaitingAgentAction(raw);
}

export function lastAssistantMessageInterrupted(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  const agent = (metadata as { agent?: { interrupted?: boolean } }).agent;
  return Boolean(agent?.interrupted);
}

/** Approve / reject short chat replies while a launch interrupt is pending. */
export function launchApprovalHeuristic(content: string): "approve" | "reject" | null {
  const t = content.trim().toLowerCase();
  if (!t) return null;

  if (
    /\b(reject|rejected|cancel|cancelled|canceled|abort|don't\s+launch|do\s+not\s+launch|stop(\s+launch)?)\b/.test(t)
  ) {
    return "reject";
  }

  if (
    /\b(approve|approved|confirmation|confirm|yes|go\s+ahead|publish|go\s+live)\b/.test(t) ||
    /\b(launch\s+it|launch\s+now|ok\s+now\s+launch)\b/.test(t)
  ) {
    return "approve";
  }

  return null;
}

export type LaunchApprovalGate =
  | { kind: "not_found" }
  | { kind: "open" }
  | { kind: "awaiting"; pendingAction?: AgentPendingAction };

export async function getLaunchApprovalGate(
  prisma: PrismaClient,
  threadId: string,
  userId: string,
): Promise<LaunchApprovalGate> {
  const thread = await prisma.thread.findFirst({
    where: { id: threadId, userId },
    select: { id: true },
  });
  if (!thread) return { kind: "not_found" };

  const agentRow = await prisma.agentState.findUnique({
    where: { threadId },
    select: { checkpoint: true },
  });
  if (checkpointAwaitingAgentAction(agentRow?.checkpoint)) {
    return {
      kind: "awaiting",
      pendingAction: extractPendingAction(agentRow?.checkpoint),
    };
  }

  const lastAssistant = await prisma.message.findFirst({
    where: { threadId, role: "assistant" },
    orderBy: { createdAt: "desc" },
    select: { metadata: true },
  });
  if (lastAssistantMessageInterrupted(lastAssistant?.metadata)) {
    return { kind: "awaiting" };
  }

  return { kind: "open" };
}

export type ThreadAgentPrepareResult =
  | { ok: true; resume?: AgentResume }
  | { ok: false; status: 400 | 404 | 409; body: Record<string, unknown> };

export function resolveAgentResume(
  gate: LaunchApprovalGate,
  content: string,
  resumeFromBody: AgentResume | undefined,
): ThreadAgentPrepareResult {
  if (gate.kind === "not_found") {
    return { ok: false, status: 404, body: { error: "thread_not_found" } };
  }

  let resume = resumeFromBody;
  if (gate.kind === "awaiting") {
    if (resume === undefined) {
      resume = inferResumeFromContent(gate.pendingAction, content);
      if (!resume) {
        const h = launchApprovalHeuristic(content);
        if (h === "approve") resume = { kind: "approval", approved: true };
        else if (h === "reject") resume = { kind: "approval", approved: false };
      }
      if (!resume) {
        return {
          ok: false,
          status: 409,
          body: {
            error: "agent_pending_action",
            message:
              "This chat is waiting for the next campaign setup answer or review decision. Answer the current question or use the review buttons on the preview card.",
          },
        };
      }
    }
  } else if (resume !== undefined) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "invalid_agent_resume",
        message: "There is no pending agent action for this thread.",
      },
    };
  }

  return { ok: true, resume };
}

export function resolveLaunchResume(
  gate: LaunchApprovalGate,
  content: string,
  resumeLaunchFromBody: { approved: boolean; feedback?: string } | undefined,
): ThreadAgentPrepareResult {
  return resolveAgentResume(
    gate,
    content,
    resumeLaunchFromBody
      ? { kind: "approval", approved: resumeLaunchFromBody.approved, feedback: resumeLaunchFromBody.feedback }
      : undefined,
  );
}

function extractPendingAction(raw: unknown): AgentPendingAction | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  return (raw as AgentCheckpoint).pendingAction;
}

function inferResumeFromContent(action: AgentPendingAction | undefined, content: string): AgentResume | undefined {
  if (!action) return undefined;
  const trimmed = content.trim();
  if (!trimmed) return undefined;

  switch (action.kind) {
    case "field_question":
      return { kind: "field_answer", field: action.field, value: trimmed };
    case "image_choice": {
      const lower = trimmed.toLowerCase();
      if (/\b(no|skip|copy only|without image)\b/.test(lower)) return { kind: "image_choice", choice: "no" };
      if (/\b(yes|generate|create|image|visual|photo)\b/.test(lower)) return { kind: "image_choice", choice: "yes" };
      return undefined;
    }
    case "campaign_preview": {
      const h = launchApprovalHeuristic(trimmed);
      if (h === "approve") return { kind: "approval", approved: true };
      if (h === "reject") return { kind: "approval", approved: false };
      return undefined;
    }
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

export function parseAgentResume(raw: unknown): AgentResume | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  if (value.kind === "field_answer") {
    const field = value.field;
    const answer = value.value;
    if (typeof field === "string" && campaignIntakeFields.includes(field as CampaignIntakeField) && typeof answer === "string") {
      return { kind: "field_answer", field: field as CampaignIntakeField, value: answer };
    }
  }
  if (value.kind === "image_choice" && (value.choice === "yes" || value.choice === "no")) {
    return { kind: "image_choice", choice: value.choice };
  }
  if (value.kind === "approval" && typeof value.approved === "boolean") {
    return {
      kind: "approval",
      approved: value.approved,
      feedback: typeof value.feedback === "string" ? value.feedback : undefined,
    };
  }
  return undefined;
}
