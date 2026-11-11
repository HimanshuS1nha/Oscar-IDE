import { queryOptions } from "@tanstack/react-query";

import type { AiModelsResponseType } from "@oscar/validators";

import { axios } from "@/lib/axios";

import { API_ROUTES } from "@/constants/api-routes";

/** Each provider's chat models, from the API. */
export const aiModelsQuery = () =>
  queryOptions({
    queryKey: ["ai-models"],
    queryFn: async () => {
      const { data } = await axios.get<AiModelsResponseType>(
        API_ROUTES.ai.models,
      );
      return data.providers;
    },
    // The list only changes with a server deploy.
    staleTime: 60 * 60 * 1000,
  });
