import { QueryClient } from "@tanstack/react-query";

/** The app's one query client, shared with code outside React (e.g. saving files). */
export const queryClient = new QueryClient();
