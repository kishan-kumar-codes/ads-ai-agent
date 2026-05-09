import { initMarketingCheckpointer } from "./agent/checkpointer.js";
import { createApp } from "./app.js";
import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";

const app = createApp();

try {
  await initMarketingCheckpointer();
} catch (err) {
  logger.error({ err }, "failed to initialize LangGraph checkpointer");
  process.exit(1);
}

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "backend listening");
});
