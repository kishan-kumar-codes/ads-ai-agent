import express from "express";
import cors from "cors";
import { auth } from "./lib/auth.js";
import { env } from "./lib/env.js";
import { healthRouter } from "./routes/health.js";
import { meRouter } from "./routes/me.js";
import { threadsRouter } from "./routes/threads.js";
import { metaRouter } from "./routes/meta.js";
import { toNodeHandler } from "better-auth/node";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
    }),
  );

  // Better Auth must be mounted BEFORE express.json() — it parses its own bodies.
  // Use a regex matcher so this works on both Express 4 (no `*splat`) and Express 5.
  app.all(/^\/api\/auth\/.*/, toNodeHandler(auth));

  app.use(express.json({ limit: "1mb" }));

  app.use("/api/health", healthRouter);
  app.use("/api/me", meRouter);
  app.use("/api/threads", threadsRouter);
  app.use("/api/meta", metaRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  return app;
}
