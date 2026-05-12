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

describe("guided Facebook post graph", () => {
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
      invoke: vi.fn(async () => "post"),
      invokeStructured: vi.fn(async (_messages, schema) => {
        if (schema instanceof z.ZodObject || schema instanceof z.ZodDefault) {
          return {
            topic: "Transformation story",
            businessName: "FitCoach Pro",
            audience: "people actively searching for fitness coaching online",
            goal: "Generate high-quality fitness coaching leads",
            caption: "Transform your fitness journey with FitCoach Pro.",
            hashtags: ["#FitCoachPro", "#OnlineCoaching", "#FitnessGoals"],
            imagePrompt: "A realistic fitness coaching scene with natural light and no text overlays.",
            requiresApproval: false,
          };
        }
        return {};
      }),
      generateImage: vi.fn(async () => ({
        requested: true,
        prompt: "A realistic fitness coaching scene",
        url: "data:image/png;base64,aW1hZ2U=",
        base64: "aW1hZ2U=",
        mimeType: "image/png",
        status: "generated",
      })),
    };
  });

  it("drafts a post preview directly when the post topic is clear", async () => {
    const graph = compileGraph(mockModel);

    const result = await graph.invoke(
      {
        userId: "user-test",
        threadId: "thread-test",
        input: "Create a Facebook transformation post for FitCoach Pro",
        steps: [],
      },
      {
        configurable: { thread_id: "thread-test" },
        recursionLimit: 10,
      },
    );

    expect(result.__interrupt__?.[0]?.value).toMatchObject({
      kind: "post_preview",
      preview: { topic: "Transformation story" },
    });
    expect(mockModel.invokeStructured).toHaveBeenCalled();
  });

  it("collects missing intake and produces a structured post preview", async () => {
    const graph = compileGraph(mockModel);
    const config = {
      configurable: { thread_id: "thread-intake" },
      recursionLimit: 60,
    };

    let result = await graph.invoke(
      {
        userId: "user-test",
        threadId: "thread-intake",
        input: "Create a post",
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

    expect(mockModel.invokeStructured).toHaveBeenCalled();
    expect(result.__interrupt__?.[0]?.value).toMatchObject({
      kind: "post_preview",
      preview: {
        topic: "Transformation story",
        image: { requested: true, status: "generated" },
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
        input: "Create a post",
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
      new Command({
        resume: { kind: "approval", approved: false, feedback: "Regenerate caption only. Make it more premium.", regenerationScope: "caption" } satisfies AgentResume,
      }),
      config,
    );

    expect(result.__interrupt__?.[0]?.value).toMatchObject({
      kind: "post_preview",
      preview: {
        topic: "post",
      },
    });
    expect(result.draftCampaign?.caption).toContain("Make it more premium");
  });
});

function answerForField(field: CampaignIntakeField, campaignName = "Spring Lead Push") {
  const answers: Record<CampaignIntakeField, string> = {
    postTopic: campaignName,
    businessName: "FitCoach Pro",
    goal: "Generate qualified leads",
    audience: "Busy professionals who want online coaching",
    tone: "Premium and motivating",
    keyMessage: "Online coaching for visible transformation",
  };
  return answers[field];
}
