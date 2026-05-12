import { cn } from "@/lib/utils";
import { ChatMessage, getAgentPendingAction, type AgentResume } from "../../lib/chat-types";
import { FacebookPostPreviewCard } from "./facebook-post-preview-card";

export function Message({
  message,
  onResume,
  disabled,
}: {
  message: ChatMessage;
  onResume?: (resume: AgentResume, content: string) => void;
  disabled?: boolean;
}) {
  const isUser = message.role === "user";
  const pendingAction = getAgentPendingAction(message.metadata);

  if (message.imageUrl) {
    return (
      <article className="flex animate-fade-up justify-start">
        <div className="flex max-w-[82%] flex-col gap-2">
          <div className="overflow-hidden rounded-2xl rounded-bl-md border border-border bg-muted">
            <img
              src={message.imageUrl}
              alt={message.imagePrompt ?? "Generated Facebook post visual"}
              className="w-full object-cover"
            />
            {message.imagePrompt && (
              <p className="px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                {message.imagePrompt}
              </p>
            )}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      className={cn(
        "flex animate-fade-up",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      <div className={cn("flex max-w-[82%] flex-col", isUser && "items-end")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-sm leading-relaxed",
            isUser
              ? "rounded-br-md bg-primary text-primary-foreground"
              : "rounded-bl-md bg-muted text-foreground",
          )}
        >
          <MessageContent content={message.content} isUser={isUser} />
        </div>
        {!isUser && pendingAction?.kind === "post_preview" && onResume ? (
          <FacebookPostPreviewCard
            preview={pendingAction.preview}
            onResume={onResume}
            disabled={disabled}
          />
        ) : null}
      </div>
    </article>
  );
}

function MessageContent({ content, isUser }: { content: string; isUser: boolean }) {
  const blocks = content.split(/```/g);

  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, index) => {
        const isCode = index % 2 === 1;
        if (isCode) {
          const code = block.replace(/^ts\n/, "").trim();
          return (
            <pre
              key={`${index}-${code.slice(0, 12)}`}
              className="overflow-x-auto rounded-xl bg-black/90 p-4 text-xs text-white"
            >
              <code>{code}</code>
            </pre>
          );
        }

        return (
          <div key={`${index}-${block.slice(0, 12)}`} className="flex flex-col gap-2">
            {block
              .trim()
              .split("\n")
              .filter(Boolean)
              .map((line) => (
                <p
                  key={line}
                  className={cn(
                    "whitespace-pre-wrap",
                    line.startsWith("- ") && "pl-3 before:mr-2 before:content-['-']",
                    isUser && "text-primary-foreground",
                  )}
                >
                  {line.startsWith("- ") ? line.slice(2) : line}
                </p>
              ))}
          </div>
        );
      })}
    </div>
  );
}
