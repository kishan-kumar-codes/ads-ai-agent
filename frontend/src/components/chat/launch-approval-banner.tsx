import { Button } from "@/components/ui/button";

export function LaunchApprovalBanner({
  onApprove,
  onReject,
  disabled,
  title = "Meta launch waiting for your approval.",
  detail = "Approve to run the launch step (creates a campaign in Ads Manager when your backend is connected to Meta), or cancel to dismiss.",
  approveLabel = "Approve launch",
  rejectLabel = "Cancel",
}: {
  onApprove: () => void;
  onReject: () => void;
  disabled?: boolean;
  title?: string;
  detail?: string;
  approveLabel?: string;
  rejectLabel?: string;
}) {
  return (
    <div
      className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-foreground"
      role="region"
      aria-label="Meta launch approval"
    >
      <p className="mb-3 leading-relaxed">
        <span className="font-medium">{title}</span> {detail}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={onApprove} disabled={disabled}>
          {approveLabel}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onReject} disabled={disabled}>
          {rejectLabel}
        </Button>
      </div>
    </div>
  );
}
