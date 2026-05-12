import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Express } from "express";

const mocks = vi.hoisted(() => {
  const prisma = {
    thread: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    message: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    businessProfile: {
      findUnique: vi.fn(),
    },
    agentState: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
    socialPost: {
      create: vi.fn(),
      update: vi.fn(),
    },
    platformConnection: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  return {
    sessionUserId: "user-1" as string | null,
    prisma,
  };
});

vi.mock("../src/lib/auth.js", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () =>
        mocks.sessionUserId
          ? { user: { id: mocks.sessionUserId }, session: { id: "session-1" } }
          : null,
      ),
    },
  },
}));

vi.mock("../src/lib/prisma.js", () => ({
  prisma: mocks.prisma,
}));

let app: Express;

beforeAll(async () => {
  const { createApp } = await import("../src/app.js");
  app = createApp();
});

beforeEach(async () => {
  const { resetMarketingCheckpointerForTests } = await import("../src/agent/checkpointer.js");
  resetMarketingCheckpointerForTests();
  vi.clearAllMocks();
  mocks.sessionUserId = "user-1";
  mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
  mocks.prisma.businessProfile.findUnique.mockResolvedValue(null);
  mocks.prisma.agentState.upsert.mockResolvedValue({});
  mocks.prisma.agentState.findUnique.mockResolvedValue(null);
  mocks.prisma.socialPost.create.mockResolvedValue({ id: "social-post-1" });
  mocks.prisma.socialPost.update.mockResolvedValue({});
  mocks.prisma.platformConnection.findUnique.mockResolvedValue(null);
  mocks.prisma.message.findFirst.mockResolvedValue(null);
});

describe("thread routes", () => {
  it("requires authentication", async () => {
    mocks.sessionUserId = null;

    const res = await request(app).get("/api/threads");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unauthorized");
  });

  it("lists only the authenticated user's threads", async () => {
    const updatedAt = new Date("2026-05-05T10:00:00.000Z");
    mocks.prisma.thread.findMany.mockResolvedValue([
      {
        id: "thread-1",
        title: "Launch plan",
        createdAt: updatedAt,
        updatedAt,
        messages: [{ content: "Latest note", createdAt: updatedAt }],
      },
    ]);

    const res = await request(app).get("/api/threads");

    expect(res.status).toBe(200);
    expect(mocks.prisma.thread.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        orderBy: { updatedAt: "desc" },
      }),
    );
    expect(res.body.threads[0]).toMatchObject({
      id: "thread-1",
      title: "Launch plan",
      preview: "Latest note",
      updatedAt: "2026-05-05T10:00:00.000Z",
    });
  });

  it("creates a thread for the authenticated user", async () => {
    const createdAt = new Date("2026-05-05T10:01:00.000Z");
    mocks.prisma.thread.create.mockResolvedValue({
      id: "thread-2",
      title: "New Chat",
      createdAt,
      updatedAt: createdAt,
      messages: [],
    });

    const res = await request(app).post("/api/threads").send({});

    expect(res.status).toBe(201);
    expect(mocks.prisma.thread.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { userId: "user-1" } }),
    );
    expect(res.body.thread).toMatchObject({
      id: "thread-2",
      title: "New Chat",
      preview: "Draft a new campaign question.",
    });
  });

  it("returns messages only after an ownership check", async () => {
    const createdAt = new Date("2026-05-05T10:02:00.000Z");
    mocks.prisma.thread.findFirst.mockResolvedValue({ id: "thread-1" });
    mocks.prisma.message.findMany.mockResolvedValue([
      {
        id: "message-1",
        role: "user",
        content: "Audit this launch",
        metadata: null,
        createdAt,
      },
    ]);

    const res = await request(app).get("/api/threads/thread-1/messages");

    expect(res.status).toBe(200);
    expect(mocks.prisma.thread.findFirst).toHaveBeenCalledWith({
      where: { id: "thread-1", userId: "user-1" },
      select: { id: true },
    });
    expect(res.body.messages[0]).toMatchObject({
      id: "message-1",
      role: "user",
      content: "Audit this launch",
      createdAt: "2026-05-05T10:02:00.000Z",
    });
  });

  it("stores the first user message and derives the thread title", async () => {
    const createdAt = new Date("2026-05-05T10:03:00.000Z");
    mocks.prisma.thread.findFirst.mockResolvedValue({
      id: "thread-1",
      title: "New Chat",
    });
    mocks.prisma.message.findFirst.mockResolvedValue(null);
    mocks.prisma.message.create.mockResolvedValueOnce({
      id: "message-2",
      role: "user",
      content: "Audit the launch pacing for this campaign",
      metadata: null,
      createdAt,
    });
    mocks.prisma.message.create.mockResolvedValueOnce({
      id: "message-3",
      role: "assistant",
      content: "Intent: plan campaign\nPlatform: google",
      metadata: { agent: { interrupted: false } },
      createdAt,
    });
    mocks.prisma.message.findMany.mockResolvedValue([
      {
        role: "user",
        content: "Audit the launch pacing for this campaign",
      },
    ]);
    mocks.prisma.thread.update.mockResolvedValue({
      id: "thread-1",
      title: "Audit the launch pacing for this campaign",
      createdAt,
      updatedAt: createdAt,
      messages: [
        {
          content: "Audit the launch pacing for this campaign",
          createdAt,
        },
      ],
    });

    const res = await request(app)
      .post("/api/threads/thread-1/messages")
      .send({ content: "Audit the launch pacing for this campaign" });

    expect(res.status).toBe(201);
    expect(mocks.prisma.message.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: {
          threadId: "thread-1",
          role: "user",
          content: "Audit the launch pacing for this campaign",
        },
      }),
    );
    expect(mocks.prisma.message.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          threadId: "thread-1",
          role: "assistant",
        }),
      }),
    );
    expect(mocks.prisma.agentState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { threadId: "thread-1" },
      }),
    );
    expect(mocks.prisma.thread.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "thread-1" },
        data: { title: "Audit the launch pacing for this campaign" },
      }),
    );
    expect(res.body.thread.title).toBe("Audit the launch pacing for this campaign");
    expect(res.body.messages).toHaveLength(2);
    expect(res.body.assistantMessage.role).toBe("assistant");
  });

  it("runs a Facebook post preview through revision and approval metadata", async () => {
    const createdAt = new Date("2026-05-05T10:08:00.000Z");
    const storedCheckpoint: { value: unknown } = { value: null };
    mocks.prisma.thread.findFirst.mockResolvedValue({
      id: "thread-1",
      title: "New Chat",
    });
    mocks.prisma.message.findFirst.mockResolvedValue(null);
    mocks.prisma.message.findMany.mockResolvedValue([]);
    mocks.prisma.agentState.findUnique.mockImplementation(async () => ({
      checkpoint: storedCheckpoint.value,
    }));
    mocks.prisma.agentState.upsert.mockImplementation(async ({ create, update }: any) => {
      storedCheckpoint.value = update?.checkpoint ?? create?.checkpoint;
      return {};
    });
    mocks.prisma.message.create.mockImplementation(async ({ data }: any) => ({
      id: `${data.role}-${mocks.prisma.message.create.mock.calls.length}`,
      role: data.role,
      content: data.content,
      metadata: data.metadata ?? null,
      createdAt,
    }));
    mocks.prisma.thread.update.mockResolvedValue({
      id: "thread-1",
      title: "Meta launch for FitCoach Pro",
      createdAt,
      updatedAt: createdAt,
      messages: [{ content: "Meta campaign setup", createdAt }],
    });

    let res = await request(app)
      .post("/api/threads/thread-1/messages")
      .send({ content: "Create a Meta campaign for FitCoach Pro" });

    expect(res.status).toBe(201);
    expect(res.body.assistantMessage.content).toContain("Facebook post preview");
    expect(res.body.assistantMessage.metadata.agent.pendingAction).toMatchObject({
      kind: "post_preview",
      preview: {
        businessName: "FitCoach Pro",
      },
    });
    expect(res.body.assistantMessage.content).not.toContain("Intent:");
    expect(res.body.assistantMessage.content).not.toContain("Platform:");

    res = await request(app)
      .post("/api/threads/thread-1/messages")
      .send({
        content: "Regenerate caption: make it more premium",
        resume: { kind: "approval", approved: false, feedback: "Make it more premium", regenerationScope: "caption" },
      });

    expect(res.status).toBe(201);
    expect(res.body.assistantMessage.metadata.agent.pendingAction.kind).toBe("post_preview");

    res = await request(app)
      .post("/api/threads/thread-1/messages")
      .send({
        content: "Approved Facebook post preview.",
        resume: { kind: "approval", approved: true },
      });

    expect(res.status).toBe(201);
    expect(res.body.assistantMessage.content).toContain("could not publish");
    expect(res.body.assistantMessage.metadata.agent.checkpoint.postPreview.businessName).toBe("FitCoach Pro");
  });

  it("returns Spanish agent text and Spanish post metadata for Spanish post requests", async () => {
    const createdAt = new Date("2026-05-05T10:09:00.000Z");
    const storedCheckpoint: { value: unknown } = { value: null };
    mocks.prisma.thread.findFirst.mockResolvedValue({
      id: "thread-1",
      title: "New Chat",
    });
    mocks.prisma.message.findFirst.mockResolvedValue(null);
    mocks.prisma.message.findMany.mockResolvedValue([]);
    mocks.prisma.agentState.findUnique.mockImplementation(async () => ({
      checkpoint: storedCheckpoint.value,
    }));
    mocks.prisma.agentState.upsert.mockImplementation(async ({ create, update }: any) => {
      storedCheckpoint.value = update?.checkpoint ?? create?.checkpoint;
      return {};
    });
    mocks.prisma.message.create.mockImplementation(async ({ data }: any) => ({
      id: `${data.role}-${mocks.prisma.message.create.mock.calls.length}`,
      role: data.role,
      content: data.content,
      metadata: data.metadata ?? null,
      createdAt,
    }));
    mocks.prisma.thread.update.mockResolvedValue({
      id: "thread-1",
      title: "Crea una publicación de Facebook",
      createdAt,
      updatedAt: createdAt,
      messages: [{ content: "Crea una publicación de Facebook", createdAt }],
    });

    const res = await request(app)
      .post("/api/threads/thread-1/messages")
      .send({ content: "Crea una publicación de Facebook sobre transformación para FitCoach Pro" });

    expect(res.status).toBe(201);
    expect(res.body.assistantMessage.content).toContain("vista previa");
    expect(res.body.assistantMessage.metadata.agent.pendingAction).toMatchObject({
      kind: "post_preview",
      preview: {
        language: "Spanish",
        caption: expect.stringContaining("Da vida"),
      },
    });
    expect(res.body.assistantMessage.metadata.agent.checkpoint).toMatchObject({
      postLanguage: "Spanish",
      replyLanguage: "Spanish",
    });
  });

  it("streams user and assistant messages with agent events", async () => {
    const createdAt = new Date("2026-05-05T10:05:00.000Z");
    mocks.prisma.thread.findFirst.mockResolvedValue({
      id: "thread-1",
      title: "New Chat",
    });
    mocks.prisma.message.findFirst.mockResolvedValue(null);
    mocks.prisma.message.create.mockResolvedValueOnce({
      id: "message-4",
      role: "user",
      content: "Write three Google headlines",
      metadata: null,
      createdAt,
    });
    mocks.prisma.message.create.mockResolvedValueOnce({
      id: "message-5",
      role: "assistant",
      content: "Intent: generate ad content\nPlatform: google",
      metadata: { agent: { interrupted: false } },
      createdAt,
    });
    mocks.prisma.message.findMany.mockResolvedValue([
      {
        role: "user",
        content: "Write three Google headlines",
      },
    ]);
    mocks.prisma.thread.update.mockResolvedValue({
      id: "thread-1",
      title: "Write three Google headlines",
      createdAt,
      updatedAt: createdAt,
      messages: [{ content: "Intent: generate ad content", createdAt }],
    });

    const res = await request(app)
      .post("/api/threads/thread-1/messages/stream")
      .send({ content: "Write three Google headlines" });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.text).toContain("event: agent_step");
    expect(res.text).toContain("event: message");
    expect(res.text).toContain("event: done");
  });

  it("responds naturally to general chat instead of asking for campaign details", async () => {
    const createdAt = new Date("2026-05-05T10:06:00.000Z");
    mocks.prisma.thread.findFirst.mockResolvedValue({
      id: "thread-1",
      title: "New Chat",
    });
    mocks.prisma.message.findFirst.mockResolvedValue(null);
    mocks.prisma.message.create.mockImplementation(async ({ data }: any) => ({
      id: data.role === "assistant" ? "message-7" : "message-6",
      role: data.role,
      content: data.content,
      metadata: data.metadata ?? null,
      createdAt,
    }));
    mocks.prisma.message.findMany.mockResolvedValue([
      {
        role: "user",
        content: "who are you",
      },
    ]);
    mocks.prisma.thread.update.mockResolvedValue({
      id: "thread-1",
      title: "who are you",
      createdAt,
      updatedAt: createdAt,
      messages: [{ content: "who are you", createdAt }],
    });

    const res = await request(app)
      .post("/api/threads/thread-1/messages")
      .send({ content: "who are you" });

    expect(res.status).toBe(201);
    expect(res.body.assistantMessage.content).toContain("AI Marketing Agent");
    expect(res.body.assistantMessage.content).not.toContain("Tell me the platform");
  });

  it("routes plural headline requests to Facebook post generation", async () => {
    const createdAt = new Date("2026-05-05T10:07:00.000Z");
    mocks.prisma.thread.findFirst.mockResolvedValue({
      id: "thread-1",
      title: "New Chat",
    });
    mocks.prisma.message.findFirst.mockResolvedValue(null);
    mocks.prisma.message.create.mockImplementation(async ({ data }: any) => ({
      id: data.role === "assistant" ? "message-9" : "message-8",
      role: data.role,
      content: data.content,
      metadata: data.metadata ?? null,
      createdAt,
    }));
    mocks.prisma.message.findMany.mockResolvedValue([
      {
        role: "user",
        content: "Write three Google ad headlines for an online fitness coaching product.",
      },
    ]);
    mocks.prisma.thread.update.mockResolvedValue({
      id: "thread-1",
      title: "Write three Google ad headlines for an online...",
      createdAt,
      updatedAt: createdAt,
      messages: [{ content: "Write three Google ad headlines", createdAt }],
    });

    const res = await request(app)
      .post("/api/threads/thread-1/messages")
      .send({ content: "Write three Google ad headlines for an online fitness coaching product." });

    expect(res.status).toBe(201);
    expect(res.body.assistantMessage.content).toContain("Facebook post preview");
    expect(res.body.assistantMessage.metadata.agent.pendingAction).toMatchObject({
      kind: "post_preview",
    });
    expect(res.body.assistantMessage.content).not.toContain("Intent:");
    expect(res.body.assistantMessage.content).not.toContain("Platform:");
    expect(res.body.assistantMessage.content).not.toContain("I’m here to help with marketing work");
  });

  it("renames and deletes only owned threads", async () => {
    const updatedAt = new Date("2026-05-05T10:04:00.000Z");
    mocks.prisma.thread.findFirst.mockResolvedValue({ id: "thread-1" });
    mocks.prisma.thread.update.mockResolvedValue({
      id: "thread-1",
      title: "Renamed thread",
      createdAt: updatedAt,
      updatedAt,
      messages: [],
    });

    const renameRes = await request(app)
      .patch("/api/threads/thread-1")
      .send({ title: "Renamed thread" });

    expect(renameRes.status).toBe(200);
    expect(mocks.prisma.thread.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "thread-1" },
        data: { title: "Renamed thread" },
      }),
    );

    const deleteRes = await request(app).delete("/api/threads/thread-1");

    expect(deleteRes.status).toBe(204);
    expect(mocks.prisma.thread.delete).toHaveBeenCalledWith({ where: { id: "thread-1" } });
  });
});

function answerForField(field: string) {
  const answers: Record<string, string> = {
    campaignName: "Spring Lead Push",
    goal: "Generate qualified leads",
    offer: "FitCoach Pro",
    audience: "Busy professionals",
    location: "United States",
    ageRange: "25-44",
    gender: "All genders",
    interests: "fitness coaching, strength training",
    placements: "Instagram Reels, Facebook Feed",
    budget: "$500 daily",
    schedule: "June 1 to June 30",
    destinationUrl: "https://fitcoach.example.com",
    cta: "Sign Up",
    copyAngle: "Transformation proof",
    conversionEvent: "lead",
  };
  return answers[field] ?? "Confirmed";
}
