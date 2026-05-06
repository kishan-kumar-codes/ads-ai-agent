import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ChatThread, formatRelativeTime } from "../../lib/chat-types";

export function ConversationList({
  threads,
  activeThreadId,
  onSelectThread,
  onNewChat,
  isLoading = false,
}: {
  threads: ChatThread[];
  activeThreadId?: string;
  onSelectThread: (threadId: string) => void;
  onNewChat: () => void;
  isLoading?: boolean;
}) {
  return (
    <aside className="flex h-full min-h-0 flex-col bg-muted/30 p-3">
      <div className="px-2 py-3">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Chats</p>
      </div>
      <Button
        type="button"
        onClick={onNewChat}
        className="h-10 rounded-full"
      >
        New chat
      </Button>
      <ScrollArea className="mt-4 min-h-0 flex-1">
        <div className="flex flex-col gap-2">
          {isLoading && (
            <div className="rounded-xl border border-border bg-background p-3 text-sm text-muted-foreground">
              Loading threads...
            </div>
          )}
          {!isLoading && threads.length === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-background p-4 text-sm leading-relaxed text-muted-foreground">
              No chats yet.
            </div>
          )}
          {threads.map((thread) => {
            const isActive = thread.id === activeThreadId;
            return (
              <button
                key={thread.id}
                type="button"
                onClick={() => onSelectThread(thread.id)}
                className={cn(
                  "flex w-full flex-col gap-2 rounded-xl border p-3 text-left transition-colors",
                  isActive
                    ? "border-border bg-background"
                    : "border-transparent bg-transparent hover:bg-background/70",
                )}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium">{thread.title}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {formatRelativeTime(thread.timestamp)}
                  </span>
                </span>
                <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {thread.preview}
                </span>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </aside>
  );
}
