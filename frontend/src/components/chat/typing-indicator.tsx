export function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl rounded-bl-md bg-muted px-4 py-3">
        <div className="flex items-center gap-1.5" aria-label="AI is typing">
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className="size-2 animate-typing-dot rounded-full bg-muted-foreground"
              style={{ animationDelay: `${dot * 140}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
