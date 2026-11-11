import { formatMicroUsd } from "@oscar/ai/pricing";

import { useAiUsage } from "@/hooks/use-ai-usage";
import { cn } from "@/lib/utils";

/** Today's AI spending against the daily budget, in the chat's header. */
const UsageMeter = () => {
  const { usage, isSpent, resetsAt } = useAiUsage();
  if (!usage) return null;

  const { spentMicroUsd, budgetMicroUsd } = usage;
  const fraction =
    budgetMicroUsd > 0 ? Math.min(spentMicroUsd / budgetMicroUsd, 1) : 1;

  return (
    <div
      className="flex items-center gap-1.5 px-1.5"
      title={`AI spending today, counted from each request's tokens at the model's price. Resets at ${resetsAt}.`}
    >
      <div
        className="h-1 w-10 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label="AI budget used today"
        aria-valuemin={0}
        aria-valuemax={budgetMicroUsd}
        aria-valuenow={Math.min(spentMicroUsd, budgetMicroUsd)}
      >
        <div
          className={cn(
            "h-full rounded-full",
            isSpent
              ? "bg-destructive"
              : fraction >= 0.8
                ? "bg-amber-500"
                : "bg-primary",
          )}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
      <span
        className={cn(
          "text-xs tabular-nums",
          isSpent ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {formatMicroUsd(spentMicroUsd)} / {formatMicroUsd(budgetMicroUsd)}
      </span>
    </div>
  );
};

export default UsageMeter;
