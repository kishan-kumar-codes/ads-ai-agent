import { API_URL, api } from "./api";
import type { AgentResume, ChatMessage, ChatThread, MessageRole } from "./chat-types";

interface ThreadDto {
  id: string;
  title: string;
  preview: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
}

interface MessageDto {
  id: string;
  role: MessageRole;
  content: string;
  metadata: unknown;
  createdAt: string;
}

function toChatThread(thread: ThreadDto): ChatThread {
  return {
    ...thread,
    timestamp: thread.lastMessageAt,
  };
}

function toChatMessage(message: MessageDto): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: message.createdAt,
    metadata: message.metadata,
  };
}

export async function listThreads() {
  const data = await api<{ threads: ThreadDto[] }>("/api/threads");
  return data.threads.map(toChatThread);
}

export async function createThread() {
  const data = await api<{ thread: ThreadDto }>("/api/threads", {
    method: "POST",
    body: JSON.stringify({}),
  });
  return toChatThread(data.thread);
}

export async function listThreadMessages(threadId: string) {
  const data = await api<{ messages: MessageDto[] }>(`/api/threads/${threadId}/messages`);
  return data.messages.map(toChatMessage);
}

export async function createThreadMessage(threadId: string, content: string) {
  const data = await api<{ messages?: MessageDto[]; message: MessageDto; assistantMessage?: MessageDto; thread: ThreadDto }>(
    `/api/threads/${threadId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({ content }),
    },
  );

  return {
    message: toChatMessage(data.message),
    messages: (data.messages ?? [data.message, data.assistantMessage].filter(Boolean)).map((message) =>
      toChatMessage(message as MessageDto),
    ),
    thread: toChatThread(data.thread),
  };
}

export async function streamThreadMessage(
  threadId: string,
  content: string,
  handlers: {
    onMessage?: (message: ChatMessage) => void;
    onThread?: (thread: ChatThread) => void;
    onAgentStep?: (step: { name: string; detail: string }) => void;
    onImage?: (img: { url: string; prompt: string }) => void;
  } = {},
  options: { resume?: AgentResume; resumeLaunch?: { approved: boolean; feedback?: string } } = {},
) {
  const body: Record<string, unknown> = { content };
  if (options.resume) {
    body.resume = options.resume;
  }
  if (options.resumeLaunch) {
    body.resumeLaunch = options.resumeLaunch;
  }

  const res = await fetch(`${API_URL}/api/threads/${threadId}/messages/stream`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${body || res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    buffer = consumeSseBuffer(buffer, handlers);
  }

  consumeSseBuffer(`${buffer}\n\n`, handlers);
}

export async function renameThread(threadId: string, title: string) {
  const data = await api<{ thread: ThreadDto }>(`/api/threads/${threadId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
  return toChatThread(data.thread);
}

export async function deleteThread(threadId: string) {
  await api<void>(`/api/threads/${threadId}`, {
    method: "DELETE",
  });
}

function consumeSseBuffer(
  buffer: string,
  handlers: {
    onMessage?: (message: ChatMessage) => void;
    onThread?: (thread: ChatThread) => void;
    onAgentStep?: (step: { name: string; detail: string }) => void;
    onImage?: (img: { url: string; prompt: string }) => void;
  },
) {
  const chunks = buffer.split("\n\n");
  const remaining = chunks.pop() ?? "";

  for (const chunk of chunks) {
    const event = parseSseEvent(chunk);
    if (!event) continue;

    if (event.event === "message") {
      const data = event.data as { message?: MessageDto };
      if (data.message) handlers.onMessage?.(toChatMessage(data.message));
    }

    if (event.event === "agent_step") {
      const data = event.data as { name?: string; detail?: string };
      if (data.name && data.detail) handlers.onAgentStep?.({ name: data.name, detail: data.detail });
    }

    if (event.event === "agent_image") {
      const data = event.data as { url?: string; prompt?: string };
      if (data.url && data.prompt) handlers.onImage?.({ url: data.url, prompt: data.prompt });
    }

    if (event.event === "done") {
      const data = event.data as { thread?: ThreadDto };
      if (data.thread) handlers.onThread?.(toChatThread(data.thread));
    }
  }

  return remaining;
}

function parseSseEvent(chunk: string) {
  const lines = chunk.split("\n");
  const eventLine = lines.find((line) => line.startsWith("event: "));
  const dataLine = lines.find((line) => line.startsWith("data: "));
  if (!eventLine || !dataLine) return null;

  return {
    event: eventLine.slice("event: ".length),
    data: JSON.parse(dataLine.slice("data: ".length)) as unknown,
  };
}
