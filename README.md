# AI Marketing Agent

Two-app workspace:

- `backend/` — Node + TypeScript + Express + Prisma + Better Auth
- `frontend/` — React + Vite + TypeScript + Tailwind + React Router

## Getting started

### 1. Backend

```bash
cd backend
cp .env.example .env       # fill in DATABASE_URL + secrets
npm install
npm run prisma:generate
npm run prisma:migrate     # creates Postgres tables
npm run dev                # http://localhost:4000
```

### 2. Frontend

```bash
cd frontend
cp .env.example .env       # VITE_API_URL=http://localhost:4000
npm install
npm run dev                # http://localhost:5173
```

## Tests

```bash
cd backend  && npm test
cd frontend && npm test
```

## What is implemented (Phases 1-5 of TODO.md)

- **Phase 1 — Database**: Prisma schema covering Better Auth (`User`, `Session`,
  `Account`, `Verification`) plus the domain models (`BusinessProfile`, `Thread`,
  `Message`, `AgentState`, `Campaign`, `AdGroup`, `Ad`, `Creative`,
  `MetricSnapshot`, `OptimizationLog`, `PlatformConnection`).
- **Phase 2 — Auth**: Better Auth with email + password, Prisma adapter,
  protected `/api/me` endpoint, signup/signin pages, signout, protected route
  wrapper on the frontend.
- **Phase 3 — Frontend shell**: Vite + React + TS scaffold, Tailwind, React
  Router, light/dark theme store, auth-aware navigation, API client wrapper,
  TanStack Query provider, toast notifications.
- **Phase 4 — Chat threads**: Authenticated `/api/threads` CRUD, persisted
  per-thread user messages, deterministic first-message titles, `/chat/:threadId`
  routing, and a query-backed conversation sidebar that loads only the active
  thread history.
- **Phase 5 — AI workflow**: LangChain + LangGraph backend workflow with
  intent classification, context gathering, draft ad content, campaign planning,
  human approval interrupts for launches, ad platform tool stubs, per-thread
  `AgentState` checkpoints, and streamed chat responses over SSE.

Phases 6+ live in `TODO.md`.
