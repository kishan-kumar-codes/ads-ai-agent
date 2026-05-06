import { cn } from "@/lib/utils";
import { ChatMessage } from "../../lib/chat-types";

export function Message({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

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
