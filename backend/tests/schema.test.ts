import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, "..", "prisma", "schema.prisma");
const schema = readFileSync(schemaPath, "utf-8");

describe("prisma schema", () => {
  it("declares Better Auth models", () => {
    for (const model of ["User", "Session", "Account", "Verification"]) {
      expect(schema).toMatch(new RegExp(`model\\s+${model}\\s*{`));
    }
  });

  it("declares core domain models for phases 1-3", () => {
    const required = [
      "BusinessProfile",
      "Thread",
      "Message",
      "AgentState",
      "Campaign",
      "AdGroup",
      "Ad",
      "Creative",
      "MetricSnapshot",
      "OptimizationLog",
      "PlatformConnection",
    ];
    for (const model of required) {
      expect(schema).toMatch(new RegExp(`model\\s+${model}\\s*{`));
    }
  });

  it("uses postgresql provider", () => {
    expect(schema).toMatch(/provider\s*=\s*"postgresql"/);
  });

  it("declares MessageRole and CampaignStatus enums", () => {
    expect(schema).toMatch(/enum\s+MessageRole/);
    expect(schema).toMatch(/enum\s+CampaignStatus/);
    expect(schema).toMatch(/enum\s+AdPlatform/);
  });

  it("makes (platform, externalId) unique on Campaign", () => {
    expect(schema).toMatch(/@@unique\(\[platform,\s*externalId\]\)/);
  });
});
