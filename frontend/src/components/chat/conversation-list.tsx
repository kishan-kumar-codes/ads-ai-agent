import { MoreHorizontalIcon, PinIcon, SearchIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ChatThread, formatRelativeTime } from "../../lib/dummy-chat-data";

export function ConversationList({
  threads,
  activeThreadId,
  onSelectThread,
  onNewChat,
}: {
  threads: ChatThread[];
  activeThreadId: string;
  onSelectThread: (threadId: string) => void;
  onNewChat: () => void;
}) {
  return (
    <aside className="flex h-full min-h-0 flex-col rounded-[1.75rem] border border-border bg-card/70 p-3 shadow-[0_24px_60px_-48px_rgba(0,0,0,0.55)] backdrop-blur">
      <Button
        type="button"
        onClick={onNewChat}
        className="h-11 rounded-full transition-transform duration-300 hover:-translate-y-0.5 active:translate-y-px"
      >
        New chat
      </Button>
      <div className="relative mt-4">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Search conversations"
          placeholder="Search threads"
          className="h-10 rounded-full pl-9"
        />
      </div>
      <ScrollArea className="mt-4 min-h-0 flex-1 pr-1">
        <div className="flex flex-col gap-2">
          {threads.map((thread) => {
            const isActive = thread.id === activeThreadId;
            return (
              <button
                key={thread.id}
                type="button"
                onClick={() => onSelectThread(thread.id)}
                className={cn(
                  "group flex w-full flex-col gap-2 rounded-2xl border p-3 text-left transition-all duration-300 hover:-translate-y-0.5",
                  isActive
                    ? "border-primary/35 bg-primary/10 shadow-[0_18px_50px_-38px_rgba(19,118,255,0.65)]"
                    : "border-transparent bg-transparent hover:border-border hover:bg-muted/55",
                )}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    {thread.pinned && <PinIcon className="text-primary" />}
                    <span className="truncate text-sm font-medium">{thread.title}</span>
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {formatRelativeTime(thread.timestamp)}
                  </span>
                </span>
                <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {thread.preview}
                </span>
                <span className="flex items-center justify-between">
                  {thread.unread ? (
                    <Badge className="rounded-full">{thread.unread} new</Badge>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">Synced</span>
                  )}
                  <MoreHorizontalIcon className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </aside>
  );
}
