# AGENTS.md

Project instructions for AI coding agents working in this repository. Keep this file concise and update it when repeated review feedback or setup mistakes appear.

## Project Snapshot

- Product: AI marketing agent for creating, previewing, launching, and optimizing Google + Meta ads through a chat UI.
- Layout: `backend/` is Node.js + TypeScript + Express + Prisma + Better Auth + LangChain/LangGraph. `frontend/` is React + Vite + TypeScript + Tailwind + shadcn/Radix UI.
- Current state: phases 1-5 in `TODO.md` are implemented. Phases 6+ describe future work.
- Main docs: read `README.md` for setup and `TODO.md` for roadmap/skill routing. Read `STRUCTURED_OUTPUT_CHANGES.md` before changing structured LLM output behavior.

## Setup And Commands

Backend:

```bash
cd backend
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

Frontend:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Validation:

```bash
cd backend && npm run build
cd backend && npm test
cd frontend && npm run build
cd frontend && npm test
```

Postgres for local development runs from the root with `docker compose up -d postgres` and listens on `localhost:5445`.

## Required Skills

Before writing code in these areas, load the matching skill listed in `TODO.md`:

- Better Auth, email/password auth, 2FA, or organizations.
- Prisma, Prisma CLI, Prisma queries, Postgres, or Prisma upgrades.
- LangChain, LangGraph, Deep Agents, structured output, persistence, or human-in-the-loop flows.
- Inngest events, durable functions, steps, middleware, or flow control.
- React/Vite frontend work, shadcn components, or UI design.
- Node.js backend/API work.

## Engineering Conventions

- Keep imports at the top of modules. Do not add inline imports unless a documented circular-dependency reason requires it.
- Use exhaustive `switch` handling for TypeScript unions and enums with a `never` check in the default branch.
- Prefer TypeScript types, Zod schemas, and framework APIs over ad hoc parsing or string manipulation.
- Keep edits scoped to the requested phase or feature. Do not refactor unrelated modules while fixing a narrow issue.
- Preserve user-owned work in the dirty tree. Never revert files unless the user explicitly asks.
- Do not commit secrets. Treat `backend/.env`, `frontend/.env`, OAuth tokens, Better Auth secrets, and API keys as local-only.

## Backend Guidance

- Express app setup lives in `backend/src/app.ts`. Better Auth must stay mounted before `express.json()`.
- Auth helpers live in `backend/src/lib/auth.ts`; route protection lives in `backend/src/middleware/requireAuth.ts`.
- Prisma schema is `backend/prisma/schema.prisma`; regenerate the client after schema changes.
- API routes should validate inputs, return stable JSON error codes, and keep auth checks close to route boundaries.
- LangGraph workflow code lives in `backend/src/agent/graph.ts`. Preserve per-thread isolation and checkpoint persistence through `AgentState`.
- For LLM structured output, use Zod schemas and `invokeStructuredWithTelemetry()` rather than parsing JSON out of model text.
- Ad platform integrations are stubbed in `backend/src/agent/adTools.ts`; real Google/Meta calls should be guarded by approval, retries, and audit logging.

## Frontend Guidance

- React routes and pages live under `frontend/src/pages`; shared UI lives under `frontend/src/components`.
- Use TanStack Query for server state and keep API access in `frontend/src/lib/*`.
- Use existing shadcn/Radix primitives and Tailwind tokens before introducing new UI patterns.
- Keep chat threads isolated by `threadId`; do not leak messages or cached state across conversations.
- Preserve accessibility basics: labels, `sr-only` text for icon buttons, keyboard-friendly controls, and semantic headings.

## Testing Expectations

- Backend changes should normally include or update Vitest tests in `backend/tests`.
- Frontend behavior changes should normally include or update Vitest/Testing Library tests in `frontend/tests`.
- Run the smallest relevant tests first, then the package-level test/build commands before claiming completion.
- If a verification command cannot run because env vars, database, or services are missing, report that clearly with the command attempted.

## Done Criteria

- The change matches the existing architecture and roadmap phase.
- Relevant tests and builds pass, or any blockers are documented.
- New instructions, env vars, scripts, or setup steps are reflected in `README.md`, `TODO.md`, or this file when they affect future agent work.
