import { MemorySaver } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";

declare global {
  // eslint-disable-next-line no-var
  var __marketingMemorySaver: MemorySaver | undefined;
}

let checkpointerPromise: Promise<BaseCheckpointSaver> | null = null;

/** Vitest isolation: prevent LangGraph checkpoints from leaking across tests that reuse thread ids. */
export function resetMarketingCheckpointerForTests() {
  checkpointerPromise = null;
  globalThis.__marketingMemorySaver = undefined;
}

function shouldUseMemoryCheckpointer() {
  return process.env.VITEST === "true" || process.env.LANGGRAPH_CHECKPOINTER === "memory";
}

async function createMarketingCheckpointer(): Promise<BaseCheckpointSaver> {
  if (shouldUseMemoryCheckpointer()) {
    if (!globalThis.__marketingMemorySaver) {
      globalThis.__marketingMemorySaver = new MemorySaver();
    }
    logger.info({ mode: "memory" }, "LangGraph checkpointer");
    return globalThis.__marketingMemorySaver;
  }

  const { PostgresSaver } = await import("@langchain/langgraph-checkpoint-postgres");
  const saver = PostgresSaver.fromConnString(env.DATABASE_URL);
  await saver.setup();
  logger.info({ mode: "postgres" }, "LangGraph checkpointer");
  return saver;
}

/** Shared checkpointer for all marketing-agent runs (required for human-in-the-loop resume). */
export async function getMarketingCheckpointer(): Promise<BaseCheckpointSaver> {
  if (!checkpointerPromise) {
    checkpointerPromise = createMarketingCheckpointer();
  }
  return checkpointerPromise;
}

/** Eager initialization so Postgres setup failures surface at boot instead of first chat. */
export async function initMarketingCheckpointer(): Promise<void> {
  await getMarketingCheckpointer();
}
