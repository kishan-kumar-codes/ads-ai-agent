import { useState } from "react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AgentResume, CampaignPreview } from "../../lib/chat-types";

export function CampaignPreviewCard({
  preview,
  disabled,
  onResume,
}: {
  preview: CampaignPreview;
  disabled?: boolean;
  onResume: (resume: AgentResume, content: string) => void;
}) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState("");

  function approve() {
    onResume({ kind: "approval", approved: true }, "Approved campaign preview.");
  }

  function reject() {
    const trimmed = feedback.trim();
    if (!trimmed) return;
    onResume(
      { kind: "approval", approved: false, feedback: trimmed },
      `Revise campaign preview: ${trimmed}`,
    );
    setFeedback("");
    setShowFeedback(false);
  }

  return (
    <section
      className="mt-3 overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
      aria-label="Campaign preview"
    >
      <div className="border-b border-border bg-muted/40 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold tracking-tight">{preview.campaignName}</h3>
          <Badge variant="secondary">Preview</Badge>
          <Badge variant={preview.image.status === "generated" ? "default" : "outline"}>
            {imageStatusLabel(preview.image.status)}
          </Badge>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{preview.goal}</p>
      </div>

      <div className="grid gap-4 p-4 text-sm md:grid-cols-2">
        <PreviewSection title="Campaign Setup">
          <PreviewRow label="Offer" value={preview.offer} />
          <PreviewRow label="Audience" value={preview.audience} />
          <PreviewRow label="Location" value={preview.location} />
          <PreviewRow label="Age" value={preview.ageRange} />
          <PreviewRow label="Gender" value={preview.gender} />
        </PreviewSection>

        <PreviewSection title="Delivery">
          <PreviewRow label="Budget" value={preview.budget} />
          <PreviewRow label="Schedule" value={preview.schedule} />
          <PreviewRow label="CTA" value={preview.cta} />
          <PreviewRow label="Conversion" value={preview.conversionEvent} />
          <PreviewRow label="URL" value={preview.destinationUrl || "Not provided"} />
        </PreviewSection>

        <PreviewSection title="Targeting">
          <PillList items={preview.interests} empty="No interests provided" />
          <PillList items={preview.placements} empty="No placements provided" />
          {preview.targetingNotes.map((note) => (
            <p key={note} className="text-xs leading-relaxed text-muted-foreground">{note}</p>
          ))}
        </PreviewSection>

        <PreviewSection title="Creative">
          <p className="text-xs leading-relaxed text-muted-foreground">{preview.copyAngle}</p>
          {preview.headlines.map((headline) => (
            <p key={headline} className="rounded-lg bg-muted px-3 py-2 font-medium">{headline}</p>
          ))}
          {preview.descriptions.map((description) => (
            <p key={description} className="text-xs leading-relaxed text-muted-foreground">{description}</p>
          ))}
        </PreviewSection>
      </div>

      {preview.image.url ? (
        <div className="border-t border-border px-4 pb-4">
          <img
            src={preview.image.url}
            alt={preview.image.prompt ?? "Generated ad creative"}
            className="mt-4 max-h-72 w-full rounded-xl object-cover"
          />
        </div>
      ) : null}

      <div className="border-t border-border bg-muted/30 px-4 py-3">
        {showFeedback ? (
          <div className="space-y-2">
            <Textarea
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder="What should I change before approval?"
              aria-label="Preview feedback"
              className="min-h-20"
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={reject} disabled={disabled || !feedback.trim()}>
                Send feedback
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowFeedback(false)} disabled={disabled}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={approve} disabled={disabled}>
              Approve preview
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setShowFeedback(true)} disabled={disabled}>
              Request changes
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

function PreviewSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</h4>
      {children}
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/60 py-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[65%] text-right font-medium">{value}</span>
    </div>
  );
}

function PillList({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <p className="text-xs text-muted-foreground">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <Badge key={item} variant="outline">{item}</Badge>
      ))}
    </div>
  );
}

function imageStatusLabel(status: CampaignPreview["image"]["status"]) {
  switch (status) {
    case "generated":
      return "Image generated";
    case "declined":
      return "Copy only";
    case "unavailable":
      return "Image unavailable";
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}
