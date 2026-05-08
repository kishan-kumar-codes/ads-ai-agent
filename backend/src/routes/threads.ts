import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { runMarketingAgent } from "../agent/graph.js";
import type { AgentStreamEvent } from "../agent/types.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";

const renameThreadSchema = z.object({
  title: z.string().trim().min(1).max(80),
});

const createMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
});

const DEFAULT_THREAD_TITLE = "New Chat";
const EMPTY_THREAD_PREVIEW = "Draft a new campaign question.";

const threadSelect = {
  id: true,
  title: true,
  createdAt: true,
  updatedAt: true,
  messages: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: {
      content: true,
      createdAt: true,
    },
  },
};

const messageSelect = {
  id: true,
  role: true,
  content: true,
  metadata: true,
  createdAt: true,
};

type ThreadRecord = {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messages: Array<{
    content: string;
    createdAt: Date;
  }>;
};

type MessageRecord = {
  id: string;
  role: string;
  content: string;
  metadata: unknown;
  createdAt: Date;
};

export const threadsRouter = Router();

threadsRouter.use(requireAuth);

threadsRouter.get("/", async (req: AuthedRequest, res) => {
  const threads = await prisma.thread.findMany({
    where: { userId: req.userId! },
    orderBy: { updatedAt: "desc" },
    select: threadSelect,
  });

  res.json({ threads: threads.map(toThreadDto) });
});

threadsRouter.post("/", async (req: AuthedRequest, res) => {
  const thread = await prisma.thread.create({
    data: {
      userId: req.userId!,
    },
    select: threadSelect,
  });

  res.status(201).json({ thread: toThreadDto(thread) });
});

threadsRouter.get("/:id/messages", async (req: AuthedRequest, res) => {
  const threadId = getThreadId(req);
  if (!threadId) {
    res.status(404).json({ error: "thread_not_found" });
    return;
  }

  const thread = await prisma.thread.findFirst({
    where: { id: threadId, userId: req.userId! },
    select: { id: true },
  });

  if (!thread) {
    res.status(404).json({ error: "thread_not_found" });
    return;
  }

  const messages = await prisma.message.findMany({
    where: { threadId: thread.id },
    orderBy: { createdAt: "asc" },
    select: messageSelect,
  });

  res.json({ messages: messages.map(toMessageDto) });
});

threadsRouter.post("/:id/messages", async (req: AuthedRequest, res) => {
  const threadId = getThreadId(req);
  if (!threadId) {
    res.status(404).json({ error: "thread_not_found" });
    return;
  }

  const parsed = createMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_message" });
    return;
  }

  const result = await createUserMessage(threadId, req.userId!, parsed.data.content);

  if (!result) {
    res.status(404).json({ error: "thread_not_found" });
    return;
  }

  const agentResult = await runMarketingAgent(
    {
      userId: req.userId!,
      threadId,
      input: parsed.data.content,
    },
    { prisma },
  );
  const assistantMessage = await createAssistantMessage(threadId, agentResult);
  const updatedThread = await touchThread(threadId);

  res.status(201).json({
    message: toMessageDto(result.message),
    assistantMessage: toMessageDto(assistantMessage),
    messages: [toMessageDto(result.message), toMessageDto(assistantMessage)],
    thread: toThreadDto(updatedThread),
  });
});

threadsRouter.post("/:id/messages/stream", async (req: AuthedRequest, res) => {
  const threadId = getThreadId(req);
  if (!threadId) {
    res.status(404).json({ error: "thread_not_found" });
    return;
  }

  const parsed = createMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_message" });
    return;
  }

  const result = await createUserMessage(threadId, req.userId!, parsed.data.content);
  if (!result) {
    res.status(404).json({ error: "thread_not_found" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  writeSse(res, "message", { message: toMessageDto(result.message), role: "user" });

  try {
    const agentResult = await runMarketingAgent(
      {
        userId: req.userId!,
        threadId,
        input: parsed.data.content,
        onEvent: (event) => writeAgentEvent(res, event),
      },
      { prisma },
    );
    const assistantMessage = await createAssistantMessage(threadId, agentResult);
    const updatedThread = await touchThread(threadId);

    writeSse(res, "message", {
      message: toMessageDto(assistantMessage),
      role: "assistant",
    });
    writeSse(res, "done", {
      thread: toThreadDto(updatedThread),
      messages: [toMessageDto(result.message), toMessageDto(assistantMessage)],
    });
    res.end();
  } catch {
    writeSse(res, "error", { error: "agent_failed" });
    res.end();
  }
});

threadsRouter.patch("/:id", async (req: AuthedRequest, res) => {
  const threadId = getThreadId(req);
  if (!threadId) {
    res.status(404).json({ error: "thread_not_found" });
    return;
  }

  const parsed = renameThreadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_thread_title" });
    return;
  }

  const thread = await prisma.thread.findFirst({
    where: { id: threadId, userId: req.userId! },
    select: { id: true },
  });

  if (!thread) {
    res.status(404).json({ error: "thread_not_found" });
    return;
  }

  const updatedThread = await prisma.thread.update({
    where: { id: thread.id },
    data: { title: parsed.data.title },
    select: threadSelect,
  });

  res.json({ thread: toThreadDto(updatedThread) });
});

threadsRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const threadId = getThreadId(req);
  if (!threadId) {
    res.status(404).json({ error: "thread_not_found" });
    return;
  }

  const thread = await prisma.thread.findFirst({
    where: { id: threadId, userId: req.userId! },
    select: { id: true },
  });

  if (!thread) {
    res.status(404).json({ error: "thread_not_found" });
    return;
  }

  await prisma.thread.delete({ where: { id: thread.id } });
  res.status(204).send();
});

function toThreadDto(thread: ThreadRecord) {
  const latestMessage = thread.messages[0];
  return {
    id: thread.id,
    title: thread.title,
    preview: latestMessage?.content ?? EMPTY_THREAD_PREVIEW,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
    lastMessageAt: latestMessage?.createdAt.toISOString() ?? thread.updatedAt.toISOString(),
  };
}

function toMessageDto(message: MessageRecord) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    metadata: message.metadata,
    createdAt: message.createdAt.toISOString(),
  };
}

function getThreadId(req: AuthedRequest) {
  return typeof req.params.id === "string" ? req.params.id : undefined;
}

function generateThreadTitle(content: string) {
  const collapsed = content.replace(/\s+/g, " ").trim();
  if (collapsed.length <= 48) return collapsed;
  return `${collapsed.slice(0, 45).trimEnd()}...`;
}

async function createUserMessage(threadId: string, userId: string, content: string) {
  return prisma.$transaction(async (tx) => {
    const thread = await tx.thread.findFirst({
      where: { id: threadId, userId },
      select: {
        id: true,
        title: true,
      },
    });

    if (!thread) return null;

    const existingMessage = await tx.message.findFirst({
      where: { threadId: thread.id },
      select: { id: true },
    });

    const message = await tx.message.create({
      data: {
        threadId: thread.id,
        role: "user",
        content,
      },
      select: messageSelect,
    });

    const title =
      thread.title === DEFAULT_THREAD_TITLE && !existingMessage
        ? generateThreadTitle(content)
        : thread.title;

    const updatedThread = await tx.thread.update({
      where: { id: thread.id },
      data: { title },
      select: threadSelect,
    });

    return { message, thread: updatedThread };
  });
}

async function createAssistantMessage(
  threadId: string,
  agentResult: Awaited<ReturnType<typeof runMarketingAgent>>,
) {
  return prisma.message.create({
    data: {
      threadId,
      role: "assistant",
      content: agentResult.content,
      metadata: {
        agent: {
          interrupted: agentResult.interrupted,
          checkpoint: toJsonValue(agentResult.checkpoint),
        },
      },
    },
    select: messageSelect,
  });
}

async function touchThread(threadId: string) {
  return prisma.thread.update({
    where: { id: threadId },
    data: { updatedAt: new Date() },
    select: threadSelect,
  });
}

function writeAgentEvent(res: Parameters<typeof writeSse>[0], event: AgentStreamEvent) {
  if (event.type === "step") {
    writeSse(res, "agent_step", event);
    return;
  }
  if (event.type === "checkpoint") {
    writeSse(res, "agent_checkpoint", event);
    return;
  }
  if (event.type === "image") {
    writeSse(res, "agent_image", event);
    return;
  }
  writeSse(res, "agent_message", event);
}

function writeSse(res: { write: (chunk: string) => void }, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
