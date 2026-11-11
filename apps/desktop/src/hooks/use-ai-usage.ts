import { useQuery } from "@tanstack/react-query";

import { useUser } from "@/hooks/use-user";
import { aiUsageQuery } from "@/queries/ai-usage-query";

/** When the budget resets, in the user's own time, such as "5:30 AM". */
const localTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/**
 * The signed-in user's AI spending today, against their daily budget.
 * `usage` is undefined while signed out or still loading.
 */
export const useAiUsage = () => {
  const { user } = useUser();
  const { data } = useQuery({
    ...aiUsageQuery(user?.id ?? ""),
    enabled: !!user,
  });

  return {
    usage: data,
    isSpent: !!data && data.spentMicroUsd >= data.budgetMicroUsd,
    resetsAt: data ? localTime(data.resetsAt) : undefined,
  };
};
