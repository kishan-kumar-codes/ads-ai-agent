import { useEffect, useMemo, useRef, useState } from "react";
import { PanelLeftIcon, RadarIcon, SparklesIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ConversationList } from "../components/chat/conversation-list";
import { Message } from "../components/chat/message";
import { MessageInput } from "../components/chat/message-input";
import { TypingIndicator } from "../components/chat/typing-indicator";
import { ChatMessage, ChatThread, chatThreads } from "../lib/dummy-chat-data";

export function ChatPage() {
  const [threads, setThreads] = useState<ChatThread[]>(chatThreads);
  const [activeThreadId, setActiveThreadId] = useState(chatThreads[0].id);
  const [isTyping, setIsTyping] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const responseTimerRef = useRef<number | null>(null);
  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? threads[0],
    [activeThreadId, threads],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeThread.messages.length, isTyping]);

  useEffect(() => {
    setIsTyping(activeThread.id === "launch-readiness");
  }, [activeThread.id]);

  useEffect(() => {
    return () => {
      if (responseTimerRef.current) {
        window.clearTimeout(responseTimerRef.current);
      }
    };
  }, []);

  function newChat() {
    const id = `thread-${Date.now()}`;
    const thread: ChatThread = {
      id,
      title: "Untitled launch review",
      preview: "Draft a new campaign question.",
      timestamp: new Date().toISOString(),
      messages: [],
    };
    setThreads((current) => [thread, ...current]);
    setActiveThreadId(id);
    setIsTyping(false);
  }

  function sendMessage(content: string) {
    const targetThreadId = activeThread.id;
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };

    setThreads((current) =>
      current.map((thread) =>
        thread.id === targetThreadId
          ? {
              ...thread,
              preview: content,
              timestamp: userMessage.timestamp,
              messages: [...thread.messages, userMessage],
            }
          : thread,
      ),
    );
    setIsTyping(true);

    if (responseTimerRef.current) {
      window.clearTimeout(responseTimerRef.current);
    }

    responseTimerRef.current = window.setTimeout(() => {
      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now()}-assistant`,
        role: "assistant",
        content:
          "I would start by checking spend variance, audience overlap, and whether the creative has enough fresh angles to support the next learning window. Share the export shape and I can turn it into a launch checklist.",
        timestamp: new Date().toISOString(),
      };

      setThreads((current) =>
        current.map((thread) =>
          thread.id === targetThreadId
            ? {
                ...thread,
                preview: assistantMessage.content,
                timestamp: assistantMessage.timestamp,
                messages: [...thread.messages, assistantMessage],
              }
            : thread,
        ),
      );
      setIsTyping(false);
      responseTimerRef.current = null;
    }, 1200);
  }

  return (
    <section className="relative -m-6 min-h-[calc(100dvh-3.5rem)] overflow-hidden bg-background p-3 text-foreground md:p-6">
      <div className="surface-grid absolute inset-0 text-foreground/20 [mask-image:linear-gradient(180deg,black,transparent_75%)]" />
      <div className="absolute right-[-9rem] top-12 size-[24rem] rounded-full bg-primary/10 blur-3xl dark:bg-primary/20" />
      <div className="relative mx-auto grid h-[calc(100dvh-6.5rem)] max-w-[1500px] grid-cols-1 gap-4 lg:grid-cols-[300px_1fr_260px]">
        <div className="hidden min-h-0 lg:block">
          <ConversationList
            threads={threads}
            activeThreadId={activeThread.id}
            onSelectThread={setActiveThreadId}
            onNewChat={newChat}
          />
        </div>

        <main className="flex min-h-0 flex-col rounded-[2rem] border border-border bg-card/72 shadow-[0_24px_80px_-56px_rgba(0,0,0,0.65)] backdrop-blur">
          <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <Sheet>
                <SheetTrigger asChild>
                  <Button type="button" variant="outline" size="icon" className="rounded-full lg:hidden">
                    <PanelLeftIcon />
                    <span className="sr-only">Open conversations</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[320px] p-3" aria-describedby="mobile-chat-description">
                  <SheetHeader className="sr-only">
                    <SheetTitle>Conversations</SheetTitle>
                    <SheetDescription id="mobile-chat-description">
                      Choose a saved campaign conversation.
                    </SheetDescription>
                  </SheetHeader>
                  <ConversationList
                    threads={threads}
                    activeThreadId={activeThread.id}
                    onSelectThread={setActiveThreadId}
                    onNewChat={newChat}
                  />
                </SheetContent>
              </Sheet>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="truncate font-heading text-lg font-semibold tracking-tight">
                    {activeThread.title}
                  </h1>
                  {activeThread.pinned && (
                    <Badge variant="secondary" className="rounded-full">
                      Pinned
                    </Badge>
                  )}
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {activeThread.preview}
                </p>
              </div>
            </div>
            <Badge variant="outline" className="hidden rounded-full border-primary/30 text-primary sm:inline-flex">
              <RadarIcon data-icon="inline-start" />
              Monitoring
            </Badge>
          </header>

          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-5 px-4 py-5 md:px-8">
              {activeThread.messages.length === 0 ? (
                <EmptyThread />
              ) : (
                activeThread.messages.map((message) => (
                  <Message key={message.id} message={message} />
                ))
              )}
              {isTyping && <TypingIndicator />}
              <div ref={endRef} />
            </div>
          </ScrollArea>

          <div className="border-t border-border p-3 md:p-4">
            <MessageInput onSend={sendMessage} />
          </div>
        </main>

        <aside className="hidden rounded-[1.75rem] border border-border bg-card/65 p-4 shadow-[0_24px_60px_-48px_rgba(0,0,0,0.55)] backdrop-blur xl:block">
          <div className="flex items-center gap-2">
            <SparklesIcon className="text-primary" />
            <h2 className="font-heading text-sm font-semibold">Launch signals</h2>
          </div>
          <Separator className="my-4" />
          <div className="flex flex-col gap-4">
            <Signal label="Pacing variance" value="6.8%" detail="Inside guardrail" />
            <Signal label="Creative freshness" value="14" detail="Active angles" />
            <Signal label="Overlap risk" value="Low" detail="Prospecting split is clean" />
          </div>
        </aside>
      </div>
    </section>
  );
}

function EmptyThread() {
  return (
    <div className="mx-auto flex min-h-[42vh] max-w-md flex-col items-center justify-center text-center">
      <div className="mb-5 rounded-full border border-border bg-muted p-5">
        <SparklesIcon className="text-primary" />
      </div>
      <h2 className="font-heading text-2xl font-semibold tracking-tight">
        Start with a launch question
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Ask about budget allocation, creative fatigue, audience overlap, or the next campaign
        checklist.
      </p>
    </div>
  );
}

function Signal({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background/60 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className="mt-3 font-mono text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
