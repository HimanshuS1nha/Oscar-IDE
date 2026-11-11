export const API_ROUTES = {
  auth: {
    login: "/auth/login",
    register: "/auth/register",
    me: "/auth/me",
  },
  ai: {
    models: "/ai/models",
    chat: "/ai/chat",
    complete: "/ai/complete",
    commitMessage: "/ai/commit-message",
    usage: "/ai/usage",
  },
} as const;
