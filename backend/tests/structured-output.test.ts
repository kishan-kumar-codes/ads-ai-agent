import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { MarketingChatModel } from "../src/agent/model.js";
import { createMarketingAgentGraph } from "../src/agent/graph.js";

const mocks = vi.hoisted(() => ({
  prisma: {
    businessProfile: {
      findUnique: vi.fn(),
    },
    message: {
      findMany: vi.fn(),
    },
    agentState: {
      upsert: vi.fn(),
    },
  },
}));

vi.mock("../src/lib/prisma.js", () => ({
  prisma: mocks.prisma,
}));

describe("structured output for ad generation", () => {
  let mockModel: MarketingChatModel;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.businessProfile.findUnique.mockResolvedValue({
      productName: "FitCoach Pro",
      audience: "fitness enthusiasts",
      goals: "generate leads",
      defaultBudget: "500",
      brandVoice: "energetic and motivating",
    });
    mocks.prisma.message.findMany.mockResolvedValue([]);
    mocks.prisma.agentState.upsert.mockResolvedValue({});

    mockModel = {
      invoke: vi.fn(async () => "generate_ad_content"),
      invokeStructured: vi.fn(async (_messages, schema) => {
        if (schema instanceof z.ZodObject || schema instanceof z.ZodDefault) {
          return {
            platform: "google",
            objective: "Generate high-quality fitness coaching leads",
            budget: "500",
            audience: "people actively searching for fitness coaching online",
            headlines: [
              "Transform Your Fitness Journey Today",
              "Expert Online Coaching For Results",
              "Reach Your Fitness Goals Fast",
            ],
            descriptions: [
              "Join thousands who've transformed with FitCoach Pro - personalized online fitness coaching that fits your schedule and delivers real results.",
              "Get expert guidance, custom workout plans, and nutrition coaching online. Start your transformation today.",
            ],
            targetingNotes: [
              "Target people searching for 'online fitness coach', 'personal trainer online', 'fitness coaching'",
              "Focus on high-intent keywords and exclude broad fitness terms",
            ],
            requiresApproval: false,
          };
        }
        return {};
      }),
    };
  });

  it("generates ad content using structured output", async () => {
    const graph = createMarketingAgentGraph({
      prisma: mocks.prisma as any,
      model: mockModel,
    });

    const result = await graph.invoke(
      {
        userId: "user-test",
        threadId: "thread-test",
        input: "Write three Google ad headlines for FitCoach Pro",
        steps: [],
      },
      {
        configurable: { thread_id: "thread-test" },
        recursionLimit: 10,
      },
    );

    expect(mockModel.invokeStructured).toHaveBeenCalled();
    expect(result.draftCampaign).toBeDefined();
    expect(result.draftCampaign?.platform).toBe("google");
    expect(result.draftCampaign?.objective).toBe("Generate high-quality fitness coaching leads");
    expect(result.draftCampaign?.headlines).toHaveLength(3);
    expect(result.draftCampaign?.headlines[0]).toBe("Transform Your Fitness Journey Today");
    expect(result.draftCampaign?.descriptions).toHaveLength(2);
    expect(result.draftCampaign?.targetingNotes).toHaveLength(2);
    expect(result.report).toContain("Intent: generate ad content");
    expect(result.report).toContain("Transform Your Fitness Journey Today");
  });

  it("handles structured output with empty arrays gracefully", async () => {
    (mockModel.invokeStructured as any).mockResolvedValueOnce({
      platform: "meta",
      objective: "Build brand awareness",
      headlines: [],
      descriptions: [],
      targetingNotes: [],
      requiresApproval: false,
    });

    const graph = createMarketingAgentGraph({
      prisma: mocks.prisma as any,
      model: mockModel,
    });

    const result = await graph.invoke(
      {
        userId: "user-test",
        threadId: "thread-test",
        input: "Create a Meta campaign",
        steps: [],
      },
      {
        configurable: { thread_id: "thread-test" },
        recursionLimit: 10,
      },
    );

    expect(result.draftCampaign).toBeDefined();
    expect(result.draftCampaign?.headlines.length).toBeGreaterThan(0);
    expect(result.draftCampaign?.descriptions.length).toBeGreaterThan(0);
  });

  it("falls back to deterministic draft when model returns null", async () => {
    (mockModel.invokeStructured as any).mockResolvedValueOnce(null);

    const graph = createMarketingAgentGraph({
      prisma: mocks.prisma as any,
      model: mockModel,
    });

    const result = await graph.invoke(
      {
        userId: "user-test",
        threadId: "thread-test",
        input: "Write Google ads for my product",
        steps: [],
      },
      {
        configurable: { thread_id: "thread-test" },
        recursionLimit: 10,
      },
    );

    expect(result.draftCampaign).toBeDefined();
    expect(result.draftCampaign?.platform).toBe("google");
    expect(result.draftCampaign?.headlines.length).toBeGreaterThan(0);
  });

  it("preserves model-generated content in plan_campaign node", async () => {
    (mockModel.invokeStructured as any).mockResolvedValueOnce({
      platform: "google",
      objective: "Initial objective",
      headlines: ["Headline A", "Headline B"],
      descriptions: ["Description A"],
      targetingNotes: ["Target note A"],
      requiresApproval: false,
    });

    (mockModel.invokeStructured as any).mockResolvedValueOnce({
      platform: "google",
      objective: "Improved objective with better clarity",
      headlines: ["Enhanced Headline 1", "Enhanced Headline 2", "Enhanced Headline 3"],
      descriptions: ["Better description with clear value prop", "Improved call to action"],
      targetingNotes: ["Refined targeting strategy", "Focus on conversion optimization"],
      requiresApproval: false,
    });

    const graph = createMarketingAgentGraph({
      prisma: mocks.prisma as any,
      model: mockModel,
    });

    const result = await graph.invoke(
      {
        userId: "user-test",
        threadId: "thread-test",
        input: "Plan a Google Ads campaign",
        steps: [],
      },
      {
        configurable: { thread_id: "thread-test" },
        recursionLimit: 10,
      },
    );

    expect(mockModel.invokeStructured).toHaveBeenCalledTimes(2);
    expect(result.draftCampaign?.objective).toBe("Improved objective with better clarity");
    expect(result.draftCampaign?.headlines).toEqual([
      "Enhanced Headline 1",
      "Enhanced Headline 2",
      "Enhanced Headline 3",
    ]);
    expect(result.draftCampaign?.descriptions).toEqual([
      "Better description with clear value prop",
      "Improved call to action",
    ]);
  });

  it("works without a model in test mode", async () => {
    const graph = createMarketingAgentGraph({
      prisma: mocks.prisma as any,
      model: null,
    });

    const result = await graph.invoke(
      {
        userId: "user-test",
        threadId: "thread-test",
        input: "Write headlines for my fitness coaching service",
        steps: [],
      },
      {
        configurable: { thread_id: "thread-test" },
        recursionLimit: 10,
      },
    );

    expect(result.draftCampaign).toBeDefined();
    expect(result.draftCampaign?.platform).toBe("google");
    expect(result.draftCampaign?.headlines.length).toBeGreaterThan(0);
    expect(result.report).toContain("Intent:");
  });
});
