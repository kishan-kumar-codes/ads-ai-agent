import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { SendHorizonalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function MessageInput({
  onSend,
  disabled = false,
}: {
  onSend: (content: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overLimit = value.length > 280;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [value]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || overLimit || disabled) return;

    onSend(trimmed);
    setValue("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      submit(e);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-border bg-card p-2"
      aria-label="Chat message composer"
    >
      <div className="flex items-end gap-2">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          placeholder="Type a message..."
          className="max-h-40 min-h-11 resize-none border-0 bg-transparent px-3 py-3 shadow-none focus-visible:ring-0"
          aria-label="Message"
        />
        <Button
          type="submit"
          size="icon"
          disabled={disabled || !value.trim() || overLimit}
          aria-label="Send message"
          className="rounded-full"
        >
          <SendHorizonalIcon />
        </Button>
      </div>
      <div className="flex items-center justify-between px-2 pb-1 text-[11px] text-muted-foreground">
        <span>Enter sends. Shift Enter adds a line.</span>
        <span className={overLimit ? "text-destructive" : ""}>{value.length}/280</span>
      </div>
    </form>
  );
}
