import { Command, MemorySaver } from "@langchain/langgraph";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { MarketingChatModel } from "../src/agent/model.js";
import { createMarketingAgentGraph } from "../src/agent/graph.js";
import type { AgentResume, CampaignIntakeField } from "../src/agent/types.js";

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

describe("guided Meta campaign graph", () => {
  let mockModel: MarketingChatModel;

  function compileGraph(model: MarketingChatModel | null) {
    return createMarketingAgentGraph({ prisma: mocks.prisma as never, model }, undefined, new MemorySaver());
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.businessProfile.findUnique.mockResolvedValue({
      productName: "FitCoach Pro",
      audience: "fitness enthusiasts",
      goals: "generate leads",
      defaultBudget: "500 daily",
      brandVoice: "energetic and motivating",
    });
    mocks.prisma.message.findMany.mockResolvedValue([]);
    mocks.prisma.agentState.upsert.mockResolvedValue({});

    mockModel = {
      invoke: vi.fn(async () => "campaign"),
      invokeStructured: vi.fn(async (_messages, schema) => {
        if (schema instanceof z.ZodObject || schema instanceof z.ZodDefault) {
          return {
            platform: "google",
            objective: "Generate high-quality fitness coaching leads",
            budget: "500 daily",
            audience: "people actively searching for fitness coaching online",
            headlines: [
              "Transform Your Fitness Journey Today",
              "Expert Online Coaching For Results",
              "Reach Your Fitness Goals Fast",
            ],
            descriptions: [
              "Join thousands who've transformed with FitCoach Pro through personalized online coaching.",
              "Get expert guidance, custom workout plans, and nutrition coaching online.",
            ],
            targetingNotes: [
              "Target online fitness coaching interests.",
              "Focus on conversion optimization.",
            ],
            requiresApproval: false,
          };
        }
        return {};
      }),
      generateImage: vi.fn(async () => "https://example.com/image.png"),
    };
  });

  it("asks one intake question before drafting campaign content", async () => {
    const graph = compileGraph(mockModel);

    const result = await graph.invoke(
      {
        userId: "user-test",
        threadId: "thread-test",
        input: "Create a Meta campaign for FitCoach Pro",
        steps: [],
      },
      {
        configurable: { thread_id: "thread-test" },
        recursionLimit: 10,
      },
    );

    expect(result.__interrupt__?.[0]?.value).toMatchObject({
      kind: "field_question",
      field: "campaignName",
    });
    expect(mockModel.invokeStructured).not.toHaveBeenCalled();
  });

  it("collects intake, asks image choice, and produces a structured preview", async () => {
    const graph = compileGraph(mockModel);
    const config = {
      configurable: { thread_id: "thread-intake" },
      recursionLimit: 60,
    };

    let result = await graph.invoke(
      {
        userId: "user-test",
        threadId: "thread-intake",
        input: "Create a Meta campaign for FitCoach Pro",
        steps: [],
      },
      config,
    );

    while (result.__interrupt__?.[0]?.value?.kind === "field_question") {
      const interrupt = result.__interrupt__?.[0]?.value as { field: CampaignIntakeField };
      result = await graph.invoke(
        new Command({ resume: { kind: "field_answer", field: interrupt.field, value: answerForField(interrupt.field) } satisfies AgentResume }),
        config,
      );
    }

    expect(result.__interrupt__?.[0]?.value).toMatchObject({ kind: "image_choice" });

    result = await graph.invoke(
      new Command({ resume: { kind: "image_choice", choice: "no" } satisfies AgentResume }),
      config,
    );

    expect(mockModel.invokeStructured).toHaveBeenCalled();
    expect(result.__interrupt__?.[0]?.value).toMatchObject({
      kind: "campaign_preview",
      preview: {
        campaignName: "Spring Lead Push",
        image: { requested: false, status: "declined" },
      },
    });
    expect(JSON.stringify(result.__interrupt__?.[0]?.value)).not.toContain("Intent:");
    expect(JSON.stringify(result.__interrupt__?.[0]?.value)).not.toContain("Platform:");
  });

  it("routes rejection feedback to a revised preview before approval", async () => {
    const graph = compileGraph(null);
    const config = {
      configurable: { thread_id: "thread-revise" },
      recursionLimit: 60,
    };

    let result = await graph.invoke(
      {
        userId: "user-test",
        threadId: "thread-revise",
        input: "Create a Meta campaign",
        steps: [],
      },
      config,
    );

    while (result.__interrupt__?.[0]?.value?.kind === "field_question") {
      const interrupt = result.__interrupt__?.[0]?.value as { field: CampaignIntakeField };
      result = await graph.invoke(
        new Command({ resume: { kind: "field_answer", field: interrupt.field, value: answerForField(interrupt.field, "Revision Campaign") } satisfies AgentResume }),
        config,
      );
    }

    result = await graph.invoke(
      new Command({ resume: { kind: "image_choice", choice: "no" } satisfies AgentResume }),
      config,
    );
    result = await graph.invoke(
      new Command({
        resume: { kind: "approval", approved: false, feedback: "Make it more premium." } satisfies AgentResume,
      }),
      config,
    );

    expect(result.__interrupt__?.[0]?.value).toMatchObject({
      kind: "campaign_preview",
      preview: {
        campaignName: "Revision Campaign",
      },
    });
    expect(result.draftCampaign?.descriptions.join(" ")).toContain("Make it more premium");
  });
});

function answerForField(field: CampaignIntakeField, campaignName = "Spring Lead Push") {
  const answers: Record<CampaignIntakeField, string> = {
    campaignName,
    goal: "Generate qualified leads",
    offer: "FitCoach Pro",
    audience: "Busy professionals who want online coaching",
    location: "United States",
    ageRange: "25-44",
    gender: "All genders",
    interests: "fitness coaching, weight training",
    placements: "Instagram Reels, Facebook Feed",
    budget: "$500 daily",
    schedule: "June 1 to June 30",
    destinationUrl: "https://fitcoach.example.com",
    cta: "Sign Up",
    copyAngle: "Lead with visible transformation",
    conversionEvent: "lead",
  };
  return answers[field];
}
