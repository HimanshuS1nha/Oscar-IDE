import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";

import { axios } from "@/lib/axios";

import { QUERY_KEYS } from "@/constants/query-keys";
import { API_ROUTES } from "@/constants/api-routes";

import type { UserType } from "@/types";

/** The signed-in user, or null when signed out. */
export const useUser = () => {
  const { data, isPending, error } = useQuery({
    queryKey: [QUERY_KEYS.getUser],
    queryFn: async () => {
      // Signed out: don't ask the server.
      if (!(await window.electron.auth.getToken())) return null;

      try {
        const { data } = await axios.get<{ user: UserType }>(
          API_ROUTES.auth.me,
        );
        return data.user;
      } catch (error) {
        // Expired, or the account is gone: forget the token.
        if (isAxiosError(error) && error.response?.status === 401) {
          await window.electron.auth.clearToken();
          return null;
        }
        throw error;
      }
    },
    // Signing in or out refetches it.
    staleTime: Infinity,
  });

  return { user: data ?? null, isPending, error };
};
