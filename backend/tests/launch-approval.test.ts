import { describe, expect, it } from "vitest";
import {
  checkpointAwaitingLaunchApproval,
  launchApprovalHeuristic,
  resolveAgentResume,
  resolveLaunchResume,
  type LaunchApprovalGate,
} from "../src/agent/launch-approval.js";

describe("launch approval helpers", () => {
  it("detects pending approval in saved checkpoints", () => {
    expect(checkpointAwaitingLaunchApproval(null)).toBe(false);
    expect(checkpointAwaitingLaunchApproval({})).toBe(false);
    expect(
      checkpointAwaitingLaunchApproval({
        executionResult: { status: "pending_approval", detail: "Waiting" },
      }),
    ).toBe(true);
    expect(
      checkpointAwaitingLaunchApproval({
        executionResult: { status: "executed", detail: "ok" },
      }),
    ).toBe(false);
  });

  it("classifies short approval and reject phrases", () => {
    expect(launchApprovalHeuristic("ok now launch it")).toBe("approve");
    expect(launchApprovalHeuristic("approve")).toBe("approve");
    expect(launchApprovalHeuristic("yes go ahead")).toBe("approve");
    expect(launchApprovalHeuristic("cancel")).toBe("reject");
    expect(launchApprovalHeuristic("don't launch yet")).toBe("reject");
    expect(launchApprovalHeuristic("rewrite all copy first")).toBe(null);
  });

  it("resolves resume only when the gate matches", () => {
    const open: LaunchApprovalGate = { kind: "open" };
    expect(resolveLaunchResume(open, "hello", undefined).ok).toBe(true);
    expect(resolveLaunchResume(open, "hello", { approved: true }).ok).toBe(false);

    const awaiting: LaunchApprovalGate = { kind: "awaiting" };
    expect(resolveLaunchResume(awaiting, "approve", undefined)).toEqual({
      ok: true,
      resume: { kind: "approval", approved: true },
    });
    expect(resolveLaunchResume(awaiting, "long unrelated essay", undefined).ok).toBe(false);

    const notFound: LaunchApprovalGate = { kind: "not_found" };
    expect(resolveLaunchResume(notFound, "approve", undefined).ok).toBe(false);
  });

  it("resolves field and image pending actions from chat content", () => {
    expect(
      resolveAgentResume(
        {
          kind: "awaiting",
          pendingAction: {
            kind: "field_question",
            field: "budget",
            question: "Budget?",
            progress: { answered: 9, total: 15 },
          },
        },
        "$500 daily",
        undefined,
      ),
    ).toEqual({
      ok: true,
      resume: { kind: "field_answer", field: "budget", value: "$500 daily" },
    });

    expect(
      resolveAgentResume(
        { kind: "awaiting", pendingAction: { kind: "image_choice", question: "Generate image?" } },
        "skip image",
        undefined,
      ),
    ).toEqual({
      ok: true,
      resume: { kind: "image_choice", choice: "no" },
    });
  });
});
