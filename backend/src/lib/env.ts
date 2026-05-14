import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  BETTER_AUTH_SECRET: z.string().min(16),
  BETTER_AUTH_URL: z.string().url(),
  WEB_ORIGIN: z.string().url(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o"),
  GOOGLE_API_KEY: z.string().optional(),
  GENERATED_MEDIA_DIR: z.string().default("generated-media"),
  GENERATED_MEDIA_PUBLIC_PATH: z.string().default("/api/media"),
  VIDEO_GENERATION_TIMEOUT_MS: z.coerce.number().int().positive().default(180_000),
  VIDEO_GENERATION_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(10_000),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_GRAPH_API_VERSION: z.string().default("v21.0"),
  META_REDIRECT_URI: z.string().optional(),
  META_LOGIN_CONFIG_ID: z.string().optional(),
  META_GRAPH_ACCESS_TOKEN: z.string().optional(),
  META_DEFAULT_AD_ACCOUNT_ID: z.string().optional(),
});

export const env = schema.parse(process.env);
export type Env = typeof env;
