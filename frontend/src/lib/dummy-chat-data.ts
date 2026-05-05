export type MessageRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  status?: "sent" | "streaming";
}

export interface ChatThread {
  id: string;
  title: string;
  preview: string;
  timestamp: string;
  unread?: number;
  pinned?: boolean;
  messages: ChatMessage[];
}

export const chatThreads: ChatThread[] = [
  {
    id: "launch-readiness",
    title: "Q2 launch readiness",
    preview: "Audience overlap is low enough to split the prospecting sets.",
    timestamp: "2026-05-05T09:21:00.000Z",
    unread: 2,
    pinned: true,
    messages: [
      {
        id: "launch-1",
        role: "user",
        content:
          "Audit the Q2 launch plan before I send it to paid social. Focus on budget pacing and where we might overfit the creative.",
        timestamp: "2026-05-05T09:12:00.000Z",
      },
      {
        id: "launch-2",
        role: "assistant",
        content:
          "The plan is close. I would tighten three areas:\n\n- Move 18% of the retargeting budget into broad prospecting for the first 72 hours.\n- Keep creative set B out of Advantage placements until the first quality score lands.\n- Add a holdout segment for the high-intent landing page cohort so lift is measurable.",
        timestamp: "2026-05-05T09:13:00.000Z",
      },
      {
        id: "launch-3",
        role: "user",
        content:
          "Give me the budget reallocation in a clean payload I can hand to the backend later.",
        timestamp: "2026-05-05T09:18:00.000Z",
      },
      {
        id: "launch-4",
        role: "assistant",
        content:
          "Use this shape for the launch adjustment:\n\n```ts\nconst budgetShift = {\n  source: \"retargeting-core\",\n  target: \"broad-prospecting-us\",\n  percent: 18,\n  durationHours: 72,\n  guardrail: \"pause if CPA rises above 42.8\"\n};\n```\n\nThis keeps the first wave broad enough to learn without starving the warmer audience.",
        timestamp: "2026-05-05T09:20:00.000Z",
        status: "streaming",
      },
    ],
  },
  {
    id: "creative-fatigue",
    title: "Creative fatigue scan",
    preview: "Three image sets are flattening after 11.6k impressions.",
    timestamp: "2026-05-04T18:44:00.000Z",
    messages: [
      {
        id: "fatigue-1",
        role: "user",
        content: "Which ads are likely fatigued from yesterday's export?",
        timestamp: "2026-05-04T18:31:00.000Z",
      },
      {
        id: "fatigue-2",
        role: "assistant",
        content:
          "The likely fatigue cluster is `still-life-03`, `demo-cut-vertical`, and `founder-proof-short`. Frequency climbed from 2.1 to 3.8 while click-through fell 31.4%. Rotate in the product-in-use set first because its save rate is still stable.",
        timestamp: "2026-05-04T18:33:00.000Z",
      },
    ],
  },
  {
    id: "landing-page-brief",
    title: "Landing page brief",
    preview: "Lead with proof, then move pricing friction below the fold.",
    timestamp: "2026-05-03T14:05:00.000Z",
    pinned: true,
    messages: [
      {
        id: "brief-1",
        role: "user",
        content: "Rewrite the landing page brief for a more technical buyer.",
        timestamp: "2026-05-03T13:55:00.000Z",
      },
      {
        id: "brief-2",
        role: "assistant",
        content:
          "Lead with the operational proof: ingestion speed, attribution coverage, and audit trail. Keep pricing visible, but place it after the workflow diagram so the value stack is already concrete.",
        timestamp: "2026-05-03T14:05:00.000Z",
      },
    ],
  },
  {
    id: "keyword-expansion",
    title: "Search keyword expansion",
    preview: "The long-tail set is small, but intent density is strong.",
    timestamp: "2026-05-01T11:27:00.000Z",
    messages: [
      {
        id: "keyword-1",
        role: "user",
        content: "Find low-risk search expansion angles for the analytics segment.",
        timestamp: "2026-05-01T11:20:00.000Z",
      },
      {
        id: "keyword-2",
        role: "assistant",
        content:
          "Start with comparison and migration language. The cleanest candidates are \"replace manual ad reporting\", \"warehouse marketing metrics\", and \"paid media anomaly detection\". Keep broad match off until exact terms produce at least 38 qualified clicks.",
        timestamp: "2026-05-01T11:27:00.000Z",
      },
    ],
  },
];

export function formatRelativeTime(timestamp: string) {
  const now = new Date("2026-05-05T10:00:00.000Z").getTime();
  const then = new Date(timestamp).getTime();
  const diffMinutes = Math.max(1, Math.round((now - then) / 60000));

  if (diffMinutes < 60) return `${diffMinutes}m`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;

  return `${Math.round(diffHours / 24)}d`;
}
