import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import OpenAI from "openai";
import { z } from "zod";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import type { GeneratedPostImage } from "./types.js";

type PromptMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string };

export interface MarketingChatModel {
  invoke(messages: PromptMessage[]): Promise<string>;
  invokeStructured<T>(messages: PromptMessage[], schema: z.ZodType<T>): Promise<T>;
  generateImage(prompt: string): Promise<GeneratedPostImage | null>;
}

class OpenAIMarketingChatModel implements MarketingChatModel {
  private readonly model = new ChatOpenAI({
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL,
    temperature: 0.2,
  });

  private readonly openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  async invoke(messages: PromptMessage[]) {
    const response = await this.model.invoke(messages.map(toLangChainMessage));
    return extractText(response.content);
  }

  async invokeStructured<T>(messages: PromptMessage[], schema: z.ZodType<T>): Promise<T> {
    const structuredModel = this.model.withStructuredOutput(schema);
    const response = await structuredModel.invoke(messages.map(toLangChainMessage));
    return response as T;
  }

  async generateImage(prompt: string): Promise<GeneratedPostImage | null> {
    const response = await this.openai.responses.create({
      model: "gpt-5.5",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                prompt,
                "The visual must be realistic, photograph-like, suitable for a Facebook Page post, and contain no text overlays.",
              ].join(" "),
            },
          ],
        },
      ],
      tools: [{ type: "image_generation", action: "generate", quality: "medium", size: "1024x1024" }],
    });
    const imageCall = response.output.find((output) => output.type === "image_generation_call");
    const imageBase64 = imageCall && "result" in imageCall && typeof imageCall.result === "string"
      ? imageCall.result
      : undefined;
    if (!imageBase64) return null;

    const revisedPrompt = imageCall && "revised_prompt" in imageCall && typeof imageCall.revised_prompt === "string"
      ? imageCall.revised_prompt
      : undefined;

    return {
      requested: true,
      prompt,
      revisedPrompt,
      base64: imageBase64,
      mimeType: "image/png",
      url: `data:image/png;base64,${imageBase64}`,
      status: "generated",
    };
  }
}

export function createMarketingChatModel(): MarketingChatModel | null {
  if (!env.OPENAI_API_KEY || env.NODE_ENV === "test") {
    return null;
  }

  return new OpenAIMarketingChatModel();
}

export async function invokeWithTelemetry(
  model: MarketingChatModel | null,
  messages: PromptMessage[],
  operation: string,
) {
  if (!model) return null;

  const startedAt = Date.now();
  try {
    const content = await model.invoke(messages);
    logger.info({ operation, durationMs: Date.now() - startedAt }, "agent model call completed");
    return content;
  } catch (error) {
    logger.warn({ operation, error }, "agent model call failed; using deterministic fallback");
    return null;
  }
}

export async function generateImageWithTelemetry(
  model: MarketingChatModel | null,
  prompt: string,
): Promise<GeneratedPostImage | null> {
  if (!model) return null;

  const startedAt = Date.now();
  try {
    const image = await model.generateImage(prompt);
    logger.info({ operation: "generate_image", durationMs: Date.now() - startedAt }, "image generation completed");
    return image;
  } catch (error) {
    logger.warn({ operation: "generate_image", error }, "image generation failed; skipping");
    return null;
  }
}

export async function invokeStructuredWithTelemetry<T>(
  model: MarketingChatModel | null,
  messages: PromptMessage[],
  schema: z.ZodType<T>,
  operation: string,
): Promise<T | null> {
  if (!model) return null;

  const startedAt = Date.now();
  try {
    const result = await model.invokeStructured(messages, schema);
    logger.info({ operation, durationMs: Date.now() - startedAt }, "agent structured model call completed");
    return result;
  } catch (error) {
    logger.warn({ operation, error }, "agent structured model call failed; using deterministic fallback");
    return null;
  }
}

function toLangChainMessage(message: PromptMessage) {
  if (message.role === "system") return new SystemMessage(message.content);
  if (message.role === "assistant") return new AIMessage(message.content);
  return new HumanMessage(message.content);
}

function extractText(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part === "object" && part && "text" in part && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}
