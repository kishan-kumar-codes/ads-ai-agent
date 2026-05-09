import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquareTextIcon, PanelLeftIcon } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ConversationList } from "../components/chat/conversation-list";
import { LaunchApprovalBanner } from "../components/chat/launch-approval-banner";
import { Message } from "../components/chat/message";
import { MessageInput } from "../components/chat/message-input";
import { TypingIndicator } from "../components/chat/typing-indicator";
import { AgentResume, ChatMessage, ChatThread, getAgentPendingAction } from "../lib/chat-types";
import {
  createThread,
  listThreadMessages,
  listThreads,
  streamThreadMessage,
} from "../lib/threads-api";

const threadsQueryKey = ["threads"] as const;

function threadMessagesQueryKey(threadId: string) {
  return ["threads", threadId, "messages"] as const;
}

function lastAssistantPendingAction(messages: ChatMessage[]) {
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  return lastAssistant ? getAgentPendingAction(lastAssistant.metadata) : undefined;
}

export function ChatPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const endRef = useRef<HTMLDivElement>(null);
  const autoCreateAttemptedRef = useRef(false);
  const [imageMessages, setImageMessages] = useState<Record<string, ChatMessage[]>>({});
  const threadsQuery = useQuery({
    queryKey: threadsQueryKey,
    queryFn: listThreads,
  });
  const threads = threadsQuery.data ?? [];
  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === threadId),
    [threadId, threads],
  );
  const messagesQuery = useQuery({
    queryKey: threadMessagesQueryKey(threadId ?? "idle"),
    queryFn: () => listThreadMessages(threadId!),
    enabled: Boolean(threadId),
  });
  const serverMessages = messagesQuery.data ?? [];
  const threadImageMessages = (threadId ? imageMessages[threadId] : undefined) ?? [];
  const messages = useMemo(() => {
    if (threadImageMessages.length === 0) return serverMessages;
    const merged = [...serverMessages];
    for (const img of threadImageMessages) {
      if (!merged.some((m) => m.id === img.id)) merged.push(img);
    }
    return merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [serverMessages, threadImageMessages]);

  const createThreadMutation = useMutation({
    mutationFn: createThread,
    onSuccess: (thread) => {
      queryClient.setQueryData<ChatThread[]>(threadsQueryKey, (current = []) => [
        thread,
        ...current.filter((item) => item.id !== thread.id),
      ]);
      navigate(`/chat/${thread.id}`);
    },
  });
  const startThread = createThreadMutation.mutate;
  const isCreatingThread = createThreadMutation.isPending;

  const pendingAction = useMemo(
    () => lastAssistantPendingAction(messages),
    [messages],
  );

  const sendMessageMutation = useMutation({
    mutationFn: (vars: { content: string; resume?: AgentResume }) => {
      if (!threadId) throw new Error("thread_required");
      return streamThreadMessage(
        threadId,
        vars.content,
        {
          onMessage: (message) => {
            queryClient.setQueryData<ChatMessage[]>(
              threadMessagesQueryKey(threadId),
              (current = []) => appendMessage(current, message),
            );
          },
          onThread: (thread) => {
            queryClient.setQueryData<ChatThread[]>(threadsQueryKey, (current = []) => [
              thread,
              ...current.filter((item) => item.id !== thread.id),
            ]);
          },
          onImage: (img) => {
            const imageMsg: ChatMessage = {
              id: `img-${Date.now()}`,
              role: "assistant",
              content: "",
              timestamp: new Date().toISOString(),
              imageUrl: img.url,
              imagePrompt: img.prompt,
            };
            setImageMessages((prev) => ({
              ...prev,
              [threadId]: [...(prev[threadId] ?? []), imageMsg],
            }));
          },
        },
        vars.resume ? { resume: vars.resume } : {},
      );
    },
  });

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [messages.length, sendMessageMutation.isPending]);

  useEffect(() => {
    if (threadId || threadsQuery.isPending || isCreatingThread) return;

    const firstThread = threads[0];
    if (firstThread) {
      navigate(`/chat/${firstThread.id}`, { replace: true });
      return;
    }

    if (!autoCreateAttemptedRef.current) {
      autoCreateAttemptedRef.current = true;
      startThread();
    }
  }, [isCreatingThread, navigate, startThread, threadId, threads, threadsQuery.isPending]);

  function newChat() {
    if (!isCreatingThread) {
      startThread();
    }
  }

  function selectThread(nextThreadId: string) {
    navigate(`/chat/${nextThreadId}`);
  }

  function sendMessage(content: string) {
    if (!threadId || sendMessageMutation.isPending) return;
    sendMessageMutation.reset();
    if (pendingAction?.kind === "field_question") {
      sendMessageMutation.mutate({
        content,
        resume: { kind: "field_answer", field: pendingAction.field, value: content },
      });
      return;
    }
    if (pendingAction?.kind === "image_choice") {
      const choice = parseImageChoice(content);
      if (choice) {
        sendMessageMutation.mutate({
          content,
          resume: { kind: "image_choice", choice },
        });
        return;
      }
    }
    sendMessageMutation.mutate({ content });
  }

  function sendResume(resume: AgentResume, content: string) {
    if (!threadId || sendMessageMutation.isPending) return;
    sendMessageMutation.reset();
    sendMessageMutation.mutate({
      content,
      resume,
    });
  }

  return (
    <section className="-m-6 min-h-[calc(100dvh-3.5rem)] bg-background text-foreground">
      <div className="mx-auto grid h-[calc(100dvh-3.5rem)] max-w-[1320px] grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="hidden min-h-0 lg:block">
          <ConversationList
            threads={threads}
            activeThreadId={threadId}
            onSelectThread={selectThread}
            onNewChat={newChat}
            isLoading={threadsQuery.isPending}
          />
        </div>

        <main className="flex min-h-0 flex-col border-l border-border bg-background">
          <header className="flex h-16 items-center gap-3 border-b border-border px-4 md:px-8">
            <Sheet>
              <SheetTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="rounded-full lg:hidden">
                  <PanelLeftIcon />
                  <span className="sr-only">Open conversations</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[300px] p-0" aria-describedby="mobile-chat-description">
                <SheetHeader className="sr-only">
                  <SheetTitle>Conversations</SheetTitle>
                  <SheetDescription id="mobile-chat-description">
                    Choose a saved conversation.
                  </SheetDescription>
                </SheetHeader>
                <ConversationList
                  threads={threads}
                  activeThreadId={threadId}
                  onSelectThread={selectThread}
                  onNewChat={newChat}
                  isLoading={threadsQuery.isPending}
                />
              </SheetContent>
            </Sheet>
            <div className="min-w-0">
              <h1 className="truncate text-base font-medium tracking-tight">
                {activeThread?.title ?? "New chat"}
              </h1>
              <p className="truncate text-sm text-muted-foreground">
                {activeThread?.preview ?? "Send a message to begin."}
              </p>
            </div>
          </header>

          <ScrollArea className="min-h-0 flex-1">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 md:px-6">
              {messagesQuery.isPending || isCreatingThread ? (
                <ThreadNotice title="Loading conversation" detail="Preparing your messages." />
              ) : messagesQuery.isError ? (
                <ThreadNotice title="Could not load messages" detail="Try switching threads or starting a new chat." />
              ) : threadId && !activeThread && !threadsQuery.isPending ? (
                <ThreadNotice title="Thread not found" detail="This chat may have been deleted." />
              ) : messages.length === 0 ? (
                <EmptyThread />
              ) : (
                messages.map((message) => (
                  <Message
                    key={message.id}
                    message={message}
                    onResume={sendResume}
                    disabled={!threadId || sendMessageMutation.isPending}
                  />
                ))
              )}
              {sendMessageMutation.isPending && <TypingIndicator />}
              <div ref={endRef} />
            </div>
          </ScrollArea>

          <div className="border-t border-border px-4 py-3 md:px-6">
            <div className="mx-auto w-full max-w-3xl">
              {sendMessageMutation.isError ? (
                <p className="mb-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {sendMessageMutation.error instanceof Error
                    ? sendMessageMutation.error.message
                    : "Something went wrong sending your message."}
                </p>
              ) : null}
              {pendingAction?.kind === "image_choice" ? (
                <div className="mb-3">
                  <LaunchApprovalBanner
                    onApprove={() => sendResume({ kind: "image_choice", choice: "yes" }, "Yes, generate an image.")}
                    onReject={() => sendResume({ kind: "image_choice", choice: "no" }, "No image needed.")}
                    disabled={!threadId || sendMessageMutation.isPending}
                    title="Generate an image?"
                    detail="Choose whether to generate an image before I build the campaign preview."
                    approveLabel="Generate image"
                    rejectLabel="Skip image"
                  />
                </div>
              ) : null}
              <MessageInput onSend={sendMessage} disabled={!threadId || sendMessageMutation.isPending} />
            </div>
          </div>
        </main>
      </div>
    </section>
  );
}

function ThreadNotice({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mx-auto flex min-h-[42vh] max-w-md flex-col items-center justify-center text-center">
      <div className="mb-4 flex size-11 items-center justify-center rounded-full border border-border bg-muted">
        <MessageSquareTextIcon className="text-muted-foreground" />
      </div>
      <h2 className="text-xl font-medium tracking-tight">{title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  );
}

function EmptyThread() {
  return (
    <div className="mx-auto flex min-h-[42vh] max-w-md flex-col items-center justify-center text-center">
      <div className="mb-4 flex size-11 items-center justify-center rounded-full border border-border bg-muted">
        <MessageSquareTextIcon className="text-muted-foreground" />
      </div>
      <h2 className="text-xl font-medium tracking-tight">Start a conversation</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Send a message below. Replies will appear here.
      </p>
    </div>
  );
}

function appendMessage(messages: ChatMessage[], message: ChatMessage) {
  if (messages.some((item) => item.id === message.id)) return messages;
  return [...messages, message];
}

function parseImageChoice(content: string): "yes" | "no" | undefined {
  const lower = content.toLowerCase();
  if (/\b(no|skip|copy only|without image)\b/.test(lower)) return "no";
  if (/\b(yes|generate|create|image|visual|photo)\b/.test(lower)) return "yes";
  return undefined;
}
