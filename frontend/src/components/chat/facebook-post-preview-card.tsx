import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AgentResume, PostPreview, RegenerationScope } from "../../lib/chat-types";

export function FacebookPostPreviewCard({
  preview,
  disabled,
  onResume,
}: {
  preview: PostPreview;
  disabled?: boolean;
  onResume?: (resume: AgentResume, content: string) => void;
}) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState("");

  function approve() {
    if (!onResume) return;
    onResume({ kind: "approval", approved: true }, "Approved Facebook post preview.");
  }

  function regenerate(scope: RegenerationScope) {
    if (!onResume) return;
    const trimmed = feedback.trim();
    const label = regenerationLabel(scope);
    onResume(
      {
        kind: "approval",
        approved: false,
        feedback: trimmed || label.defaultFeedback,
        regenerationScope: scope,
      },
      trimmed ? `Regenerate ${label.name}: ${trimmed}` : `Regenerate ${label.name}.`,
    );
    setFeedback("");
    setShowFeedback(false);
  }

  return (
    <section
      className="mt-3 overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
      aria-label="Facebook post preview"
    >
      <div className="border-b border-border bg-muted/40 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold tracking-tight">Facebook Post Preview</h3>
          <Badge variant="secondary">{preview.topic}</Badge>
          <Badge variant={preview.image.status === "generated" ? "default" : "outline"}>
            {preview.image.status === "generated" ? "Image generated" : "Image unavailable"}
          </Badge>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {preview.pageName || preview.pageId ? `Ready for ${preview.pageName ?? preview.pageId}` : "Ready for your connected Facebook Page"}
        </p>
      </div>

      <div className="p-4">
        <div className="overflow-hidden rounded-2xl border border-border bg-background">
          {preview.image.url ? (
            <img
              src={preview.image.url}
              alt={preview.image.prompt ?? "Generated Facebook post visual"}
              className="max-h-[420px] w-full object-cover"
            />
          ) : (
            <div className="flex min-h-56 items-center justify-center bg-muted px-4 text-center text-sm text-muted-foreground">
              Image generation was unavailable. Regenerate the image before publishing.
            </div>
          )}
          <div className="flex flex-col gap-3 p-4">
            <div>
              <p className="text-sm font-medium">{preview.businessName}</p>
              <p className="text-xs text-muted-foreground">{preview.audience} · {preview.goal}</p>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{preview.caption}</p>
            <div className="flex flex-wrap gap-1.5">
              {preview.hashtags.map((tag) => (
                <Badge key={tag} variant="outline">{tag}</Badge>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-border bg-muted/30 px-4 py-3">
        {!onResume ? (
          <p className="text-sm text-muted-foreground">This preview is no longer waiting for review.</p>
        ) : showFeedback ? (
          <div className="flex flex-col gap-2">
            <Textarea
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder="Optional: describe what should change."
              aria-label="Post preview feedback"
              className="min-h-20"
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => regenerate("image")} disabled={disabled}>
                Regenerate image
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => regenerate("caption")} disabled={disabled}>
                Regenerate caption
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => regenerate("hashtags")} disabled={disabled}>
                Regenerate hashtags
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => regenerate("all")} disabled={disabled}>
                Regenerate all
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowFeedback(false)} disabled={disabled}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={approve} disabled={disabled || preview.image.status !== "generated"}>
              Approve and publish
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

function regenerationLabel(scope: RegenerationScope) {
  switch (scope) {
    case "image":
      return { name: "image", defaultFeedback: "Regenerate the image only. Keep the existing caption and hashtags unchanged." };
    case "caption":
      return { name: "caption", defaultFeedback: "Regenerate the caption only. Keep the existing image and hashtags unchanged." };
    case "hashtags":
      return { name: "hashtags", defaultFeedback: "Regenerate the hashtags only. Keep the existing image and caption unchanged." };
    case "all":
      return { name: "image, caption, and hashtags", defaultFeedback: "Regenerate the full post preview." };
    default: {
      const exhaustive: never = scope;
      return exhaustive;
    }
  }
}
