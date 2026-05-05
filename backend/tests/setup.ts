process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/ads_ai_agent_test?schema=public";
process.env.PORT ??= "4001";
process.env.BETTER_AUTH_SECRET ??= "test-secret-please-replace-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:4001";
process.env.WEB_ORIGIN ??= "http://localhost:5173";
