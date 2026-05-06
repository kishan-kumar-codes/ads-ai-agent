#!/usr/bin/env tsx
import { createMarketingChatModel } from "../src/agent/model.js";
import { z } from "zod";

const draftCampaignSchema = z.object({
  platform: z.enum(["google", "meta", "both"]).default("google"),
  objective: z.string().min(1),
  budget: z.string().default(""),
  audience: z.string().default(""),
  headlines: z.array(z.string()).default([]),
  descriptions: z.array(z.string()).default([]),
  targetingNotes: z.array(z.string()).default([]),
  requiresApproval: z.boolean().default(false),
});

async function testStructuredOutput() {
  console.log("🧪 Testing Structured Output Implementation\n");

  const model = createMarketingChatModel();

  if (!model) {
    console.log("❌ No model available (OPENAI_API_KEY not configured or NODE_ENV=test)");
    process.exit(1);
  }

  console.log("✅ Model initialized successfully\n");

  console.log("📝 Test 1: Generate ad content with structured output");
  console.log("Request: Write three Google ad headlines for an online fitness coaching product\n");

  try {
    const result = await model.invokeStructured(
      [
        {
          role: "system",
          content:
            "Create an ad draft with platform, objective, budget, audience, headlines, descriptions, and targetingNotes based on the user's request.",
        },
        {
          role: "user",
          content: JSON.stringify({
            request: "Write three Google ad headlines for an online fitness coaching product",
            businessContext: {
              productName: "FitCoach Pro",
              audience: "fitness enthusiasts",
              goals: "generate leads",
              defaultBudget: "500",
              brandVoice: "energetic and motivating",
            },
            history: [],
          }),
        },
      ],
      draftCampaignSchema,
    );

    console.log("✅ Structured output received successfully!\n");
    console.log("📊 Result:");
    console.log(JSON.stringify(result, null, 2));
    console.log("\n");

    if (!result.objective) {
      console.log("❌ Missing objective field");
      process.exit(1);
    }

    if (!result.headlines || result.headlines.length === 0) {
      console.log("❌ No headlines generated");
      process.exit(1);
    }

    if (!result.descriptions || result.descriptions.length === 0) {
      console.log("❌ No descriptions generated");
      process.exit(1);
    }

    console.log("✅ All required fields are present and populated");
    console.log(`   - Platform: ${result.platform}`);
    console.log(`   - Objective: ${result.objective}`);
    console.log(`   - Headlines: ${result.headlines.length} generated`);
    console.log(`   - Descriptions: ${result.descriptions.length} generated`);
    console.log(`   - Targeting notes: ${result.targetingNotes.length} generated`);
    console.log("\n");

    console.log("📝 Test 2: Plan campaign with structured output");
    console.log("Request: Improve the campaign plan\n");

    const improvedResult = await model.invokeStructured(
      [
        {
          role: "system",
          content:
            "Improve this campaign plan. Enhance the objective, headlines, descriptions, and targeting notes while preserving the platform.",
        },
        {
          role: "user",
          content: JSON.stringify({
            request: "Improve this campaign to better target high-intent users",
            draft: result,
          }),
        },
      ],
      draftCampaignSchema,
    );

    console.log("✅ Improved campaign received successfully!\n");
    console.log("📊 Improved Result:");
    console.log(JSON.stringify(improvedResult, null, 2));
    console.log("\n");

    console.log("🎉 All tests passed! Structured output is working correctly.");
  } catch (error) {
    console.error("❌ Test failed with error:", error);
    process.exit(1);
  }
}

testStructuredOutput().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
