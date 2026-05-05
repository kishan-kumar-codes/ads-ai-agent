import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { PaperclipIcon, SendHorizonalIcon, SlidersHorizontalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function MessageInput({ onSend }: { onSend: (content: string) => void }) {
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
    if (!trimmed || overLimit) return;

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
      className="rounded-[1.75rem] border border-border bg-card/90 p-3 shadow-[0_26px_70px_-46px_rgba(0,0,0,0.65)] backdrop-blur"
      aria-label="Chat message composer"
    >
      <div className="flex items-end gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="rounded-full">
              <PaperclipIcon />
              <span className="sr-only">Attach file</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Attach a brief or export</p>
          </TooltipContent>
        </Tooltip>
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask about pacing, creative, audiences, or launch risks..."
          className="max-h-40 min-h-11 resize-none rounded-2xl border-0 bg-muted/65 px-4 py-3 shadow-none focus-visible:ring-1"
          aria-label="Message"
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="rounded-full">
              <SlidersHorizontalIcon />
              <span className="sr-only">Open controls</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Adjust model controls</p>
          </TooltipContent>
        </Tooltip>
        <Button
          type="submit"
          size="icon"
          disabled={!value.trim() || overLimit}
          aria-label="Send message"
          className="rounded-full transition-transform duration-300 hover:-translate-y-0.5 active:translate-y-px"
        >
          <SendHorizonalIcon />
        </Button>
      </div>
      <div className="mt-2 flex items-center justify-between px-2 text-[11px] text-muted-foreground">
        <span>Enter sends. Shift Enter adds a line.</span>
        <span className={overLimit ? "text-destructive" : ""}>{value.length}/280</span>
      </div>
    </form>
  );
}
