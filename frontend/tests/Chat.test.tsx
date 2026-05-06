import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { App } from "../src/App";
import { ThemeProvider } from "../src/components/theme-provider";
import * as authClient from "../src/lib/auth-client";

const threadOne = {
  id: "thread-1",
  title: "Launch plan",
  preview: "Review pacing",
  createdAt: "2026-05-05T09:00:00.000Z",
  updatedAt: "2026-05-05T09:30:00.000Z",
  lastMessageAt: "2026-05-05T09:30:00.000Z",
};

const threadTwo = {
  id: "thread-2",
  title: "Creative scan",
  preview: "Check fatigued assets",
  createdAt: "2026-05-04T09:00:00.000Z",
  updatedAt: "2026-05-04T09:30:00.000Z",
  lastMessageAt: "2026-05-04T09:30:00.000Z",
};

function renderAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

function mockChatApi() {
  const requests: Array<{ method: string; pathname: string; body?: string }> = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(String(input));
      const method = init.method ?? "GET";
      const body = typeof init.body === "string" ? init.body : undefined;
      requests.push({ method, pathname: url.pathname, body });

      if (url.pathname === "/api/threads" && method === "GET") {
        return jsonResponse({ threads: [threadOne, threadTwo] });
      }

      if (url.pathname === "/api/threads" && method === "POST") {
        return jsonResponse(
          {
            thread: {
              id: "thread-3",
              title: "New Chat",
              preview: "Draft a new campaign question.",
              createdAt: "2026-05-05T10:00:00.000Z",
              updatedAt: "2026-05-05T10:00:00.000Z",
              lastMessageAt: "2026-05-05T10:00:00.000Z",
            },
          },
          201,
        );
      }

      if (url.pathname === "/api/threads/thread-1/messages" && method === "GET") {
        return jsonResponse({
          messages: [
            {
              id: "message-1",
              role: "user",
              content: "Audit launch pacing",
              metadata: null,
              createdAt: "2026-05-05T09:30:00.000Z",
            },
          ],
        });
      }

      if (url.pathname === "/api/threads/thread-1/messages/stream" && method === "POST") {
        return sseResponse([
          {
            event: "message",
            data: {
              message: {
                id: "message-2",
                role: "user",
                content: "Launch pacing looks risky",
                metadata: null,
                createdAt: "2026-05-05T10:05:00.000Z",
              },
            },
          },
          {
            event: "message",
            data: {
              message: {
                id: "message-3",
                role: "assistant",
                content: "Approval needed before launch.",
                metadata: null,
                createdAt: "2026-05-05T10:05:01.000Z",
              },
            },
          },
          {
            event: "done",
            data: {
              thread: {
                ...threadOne,
                preview: "Approval needed before launch.",
                updatedAt: "2026-05-05T10:05:00.000Z",
                lastMessageAt: "2026-05-05T10:05:00.000Z",
              },
            },
          },
        ]);
      }

      if (url.pathname === "/api/threads/thread-1/messages" && method === "POST") {
        return jsonResponse(
          {
            messages: [
              {
                id: "message-2",
                role: "user",
                content: "Launch pacing looks risky",
                metadata: null,
                createdAt: "2026-05-05T10:05:00.000Z",
              },
            ],
            message: {
              id: "message-2",
              role: "user",
              content: "Launch pacing looks risky",
              metadata: null,
              createdAt: "2026-05-05T10:05:00.000Z",
            },
            thread: {
              ...threadOne,
              preview: "Launch pacing looks risky",
              updatedAt: "2026-05-05T10:05:00.000Z",
              lastMessageAt: "2026-05-05T10:05:00.000Z",
            },
          },
          201,
        );
      }

      return jsonResponse({ error: "not_found" }, 404);
    }) as unknown as typeof fetch,
  );

  return requests;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sseResponse(events: Array<{ event: string; data: unknown }>) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(
          encoder.encode(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`),
        );
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("Chat threads", () => {
  beforeEach(() => {
    (authClient as any).__setSession({ id: "u1", email: "user@example.com", name: "User" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the active thread from the URL without mixing histories", async () => {
    const requests = mockChatApi();

    renderAt("/chat/thread-1");

    expect(await screen.findByText("Audit launch pacing")).toBeInTheDocument();
    expect(screen.getAllByText("Launch plan")[0]).toBeInTheDocument();
    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: "GET", pathname: "/api/threads" }),
        expect.objectContaining({ method: "GET", pathname: "/api/threads/thread-1/messages" }),
      ]),
    );
    expect(requests).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: "GET", pathname: "/api/threads/thread-2/messages" }),
      ]),
    );
  });

  it("creates a new chat from the sidebar", async () => {
    const requests = mockChatApi();
    const user = userEvent.setup();

    renderAt("/chat/thread-1");

    await screen.findByText("Audit launch pacing");
    await user.click(screen.getAllByRole("button", { name: /new chat/i })[0]);

    await waitFor(() =>
      expect(requests).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ method: "POST", pathname: "/api/threads" }),
        ]),
      ),
    );
  });

  it("persists sent messages to the active thread", async () => {
    const requests = mockChatApi();
    const user = userEvent.setup();

    renderAt("/chat/thread-1");

    await screen.findByText("Audit launch pacing");
    await user.type(screen.getByLabelText("Message"), "Launch pacing looks risky");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => expect(screen.getAllByText("Launch pacing looks risky").length).toBeGreaterThan(0));
    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "POST",
          pathname: "/api/threads/thread-1/messages/stream",
          body: JSON.stringify({ content: "Launch pacing looks risky" }),
        }),
      ]),
    );
  });
});
