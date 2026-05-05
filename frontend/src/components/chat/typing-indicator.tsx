import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function TypingIndicator() {
  return (
    <div className="flex items-end gap-3">
      <Avatar className="size-8 border border-border bg-card">
        <AvatarFallback className="bg-primary/10 text-primary">AI</AvatarFallback>
      </Avatar>
      <div className="rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3 shadow-[0_16px_40px_-32px_rgba(0,0,0,0.45)]">
        <div className="flex items-center gap-1.5" aria-label="AI is typing">
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className="size-2 rounded-full bg-primary animate-typing-dot"
              style={{ animationDelay: `${dot * 140}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
