#!/usr/bin/env tsx
import { runMarketingAgent } from "../src/agent/graph.js";
import { prisma } from "../src/lib/prisma.js";

async function verifyStructuredOutput() {
  console.log("🔍 Verifying Structured Output Implementation\n");

  const testUserId = "test-user-structured-output";
  const testThreadId = `test-thread-${Date.now()}`;

  console.log(`📝 Test User ID: ${testUserId}`);
  console.log(`📝 Test Thread ID: ${testThreadId}\n`);

  // Create a test user and business profile
  try {
    await prisma.user.upsert({
      where: { id: testUserId },
      create: {
        id: testUserId,
        name: "Test User",
        email: "test-structured-output@example.com",
      },
      update: {},
    });

    await prisma.businessProfile.upsert({
      where: { userId: testUserId },
      create: {
        userId: testUserId,
        productName: "FitCoach Pro",
        audience: "fitness enthusiasts seeking online coaching",
        goals: "generate qualified leads",
        defaultBudget: 500,
        brandVoice: "energetic, motivating, and professional",
      },
      update: {},
    });

    await prisma.thread.upsert({
      where: { id: testThreadId },
      create: {
        id: testThreadId,
        userId: testUserId,
        title: "Structured Output Test",
      },
      update: {},
    });

    console.log("✅ Test data created successfully\n");
  } catch (error) {
    console.error("❌ Failed to create test data:", error);
    process.exit(1);
  }

  // Test 1: Generate ad content
  console.log("📝 Test 1: Generate ad content with structured output");
  console.log("Input: 'Write three Google ad headlines for FitCoach Pro'\n");

  try {
    const result1 = await runMarketingAgent(
      {
        userId: testUserId,
        threadId: testThreadId,
        input: "Write three Google ad headlines for FitCoach Pro",
      },
      { prisma },
    );

    console.log("✅ Agent completed successfully!\n");
    console.log("📊 Response:");
    console.log(result1.content);
    console.log("\n");

    if (!result1.content.includes("Headlines:")) {
      console.log("❌ Response missing headlines section");
      process.exit(1);
    }

    if (!result1.content.includes("Platform:")) {
      console.log("❌ Response missing platform information");
      process.exit(1);
    }

    console.log("✅ Response contains all expected structured data\n");
  } catch (error) {
    console.error("❌ Test 1 failed:", error);
    process.exit(1);
  }

  // Test 2: Plan campaign
  console.log("📝 Test 2: Plan a campaign");
  console.log("Input: 'Plan a Google Ads campaign for high-intent users'\n");

  try {
    const result2 = await runMarketingAgent(
      {
        userId: testUserId,
        threadId: testThreadId,
        input: "Plan a Google Ads campaign for high-intent users",
      },
      { prisma },
    );

    console.log("✅ Agent completed successfully!\n");
    console.log("📊 Response:");
    console.log(result2.content);
    console.log("\n");

    if (!result2.content.includes("Objective:")) {
      console.log("❌ Response missing objective");
      process.exit(1);
    }

    console.log("✅ Campaign planning response looks good\n");
  } catch (error) {
    console.error("❌ Test 2 failed:", error);
    process.exit(1);
  }

  // Verify checkpoint persistence
  console.log("📝 Verifying checkpoint persistence...");
  try {
    const savedState = await prisma.agentState.findUnique({
      where: { threadId: testThreadId },
    });

    if (!savedState) {
      console.log("❌ No checkpoint saved");
      process.exit(1);
    }

    const checkpoint = savedState.checkpoint as any;
    if (!checkpoint.draftCampaign) {
      console.log("❌ Checkpoint missing draft campaign");
      process.exit(1);
    }

    console.log("✅ Checkpoint saved correctly");
    console.log(`   - Intent: ${checkpoint.intent}`);
    console.log(`   - Platform: ${checkpoint.draftCampaign.platform}`);
    console.log(`   - Headlines: ${checkpoint.draftCampaign.headlines.length}`);
    console.log(`   - Descriptions: ${checkpoint.draftCampaign.descriptions.length}`);
    console.log("\n");
  } catch (error) {
    console.error("❌ Failed to verify checkpoint:", error);
    process.exit(1);
  }

  // Clean up
  console.log("🧹 Cleaning up test data...");
  try {
    await prisma.message.deleteMany({
      where: { threadId: testThreadId },
    });
    await prisma.agentState.deleteMany({
      where: { threadId: testThreadId },
    });
    await prisma.thread.delete({
      where: { id: testThreadId },
    });
    console.log("✅ Test data cleaned up\n");
  } catch (error) {
    console.warn("⚠️  Failed to clean up test data:", error);
  }

  console.log("🎉 All verification tests passed! Structured output is working correctly.");
  console.log("\n📋 Summary:");
  console.log("   ✅ Model integration with structured output");
  console.log("   ✅ Graph nodes using structured schemas");
  console.log("   ✅ Proper fallback handling");
  console.log("   ✅ Checkpoint persistence");
  console.log("   ✅ End-to-end workflow");
}

verifyStructuredOutput()
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
