# 0001. Facebook Post Flow

## Status

Accepted

## Context

The app was originally centered on paid ad campaigns, ad sets, creatives, and launch approval. The new product direction asks the agent to create Facebook Page posts instead: a realistic image, caption, hashtags, preview, regeneration, and publish-after-approval.

Changing every campaign-oriented model and route at once would touch persistence, tests, integrations, and roadmap language beyond the immediate user-facing flow.

## Decision

Ship a post-based chat flow now while leaving unrelated campaign infrastructure in place. The active agent workflow drafts and previews Facebook Posts, publishes approved previews as Page photo posts, and persists them as `SocialPost` records.

## Consequences

The user-facing flow no longer creates campaigns. Some legacy campaign services and routes remain for compatibility and can be removed or renamed in a later cleanup.
