import { queryOptions } from "@tanstack/react-query";

import type { AiUsageResponseType } from "@oscar/validators";

import { axios } from "@/lib/axios";
import { queryClient } from "@/lib/query-client";

import { API_ROUTES } from "@/constants/api-routes";
import { QUERY_KEYS } from "@/constants/query-keys";

/** What the signed-in user's AI calls cost today, against their daily budget. */
export const aiUsageQuery = (userId: string) =>
  queryOptions({
    queryKey: [QUERY_KEYS.aiUsage, userId],
    queryFn: async () => {
      const { data } = await axios.get<AiUsageResponseType>(
        API_ROUTES.ai.usage,
      );
      return data;
    },
    // Inline completions spend in the background, with nothing to refetch
    // after; this keeps the meter close. Chat replies and commit messages
    // refresh it as they finish.
    refetchInterval: 60 * 1000,
  });

/** Refetches today's spending, after a request that cost something. */
export const refreshAiUsage = () =>
  void queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.aiUsage] });
