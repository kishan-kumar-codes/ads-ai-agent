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
  `MetricSnapshot`, `OptimizationLog`, `SocialPost`, `PlatformConnection`).
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
  intent classification, context gathering, Facebook post drafting, realistic
  image/video generation, preview approval/regeneration, Page publishing, per-thread
  `AgentState` checkpoints, and streamed chat responses over SSE.

Meta/Facebook publishing requires a connected Page with `pages_show_list`,
`pages_read_engagement`, and `pages_manage_posts` permissions. For current
Meta apps, create a Facebook Login for Business configuration with those
permissions and set `META_LOGIN_CONFIG_ID` in `backend/.env` so the OAuth flow
uses `config_id` instead of raw `scope` parameters. For local Graph API testing,
you can set `META_GRAPH_ACCESS_TOKEN` to a User access token from Graph API
Explorer; the backend will exchange it for a Page access token via `/me/accounts`
before publishing to `/{page-id}/photos`.

Video generation uses Google Veo through the Gemini API. Set `GOOGLE_API_KEY`
in `backend/.env` to enable `veo-3.1-generate-preview`; generated MP4 previews
are stored under `GENERATED_MEDIA_DIR` and served from `GENERATED_MEDIA_PUBLIC_PATH`
for review before publishing to Facebook Page video posts.

Phases 6+ live in `TODO.md`.
