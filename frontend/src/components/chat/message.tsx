import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChatMessage, formatRelativeTime } from "../../lib/dummy-chat-data";
import { MessageActions } from "./message-actions";

export function Message({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <article
      className={cn(
        "group/message flex animate-fade-up items-end gap-3",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      {!isUser && (
        <Avatar className="size-8 border border-border bg-card">
          <AvatarFallback className="bg-primary/10 text-primary">AI</AvatarFallback>
        </Avatar>
      )}
      <div className={cn("flex max-w-[78%] flex-col gap-2", isUser && "items-end")}>
        <div className="flex items-center gap-2">
          {!isUser && message.status === "streaming" && (
            <Badge variant="secondary" className="rounded-full">
              Streaming
            </Badge>
          )}
          <span className="font-mono text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover/message:opacity-100">
            {formatRelativeTime(message.timestamp)}
          </span>
          <MessageActions content={message.content} />
        </div>
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-[0_16px_40px_-34px_rgba(0,0,0,0.55)]",
            isUser
              ? "rounded-br-md bg-primary text-primary-foreground"
              : "rounded-bl-md border border-border bg-card text-card-foreground",
          )}
        >
          <MessageContent content={message.content} isUser={isUser} />
        </div>
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
