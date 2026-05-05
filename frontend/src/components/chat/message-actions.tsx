import { ClipboardIcon, RefreshCcwIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const actions = [
  { label: "Copy", icon: ClipboardIcon },
  { label: "Regenerate", icon: RefreshCcwIcon },
  { label: "Delete", icon: Trash2Icon },
];

export function MessageActions({ content }: { content: string }) {
  async function copyMessage() {
    await navigator.clipboard?.writeText(content);
  }

  return (
    <div className="flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover/message:opacity-100">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <Tooltip key={action.label}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={action.label === "Copy" ? copyMessage : undefined}
                aria-label={action.label}
                className="rounded-full"
              >
                <Icon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{action.label}</p>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
