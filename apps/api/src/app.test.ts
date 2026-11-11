import { describe, expect, it } from "vitest";

import { app } from "./app";

// Requests that are answered before any database call, so they run without MySQL.

describe("api", () => {
  it("lists the models of every provider", async () => {
    const res = await app.request("/api/ai/models");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.providers.map((p: { id: string }) => p.id)).toEqual([
      "openai",
      "anthropic",
      "gemini",
    ]);
    for (const provider of body.providers) {
      expect(provider.models.length).toBeGreaterThan(0);
    }
  });

  it("answers an invalid body with 400 and the validation message", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email", password: "secret" }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      message: "Email is required and must be valid",
    });
  });

  it("refuses a protected route without a token", async () => {
    const res = await app.request("/api/auth/me");

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ message: "Unauthorized" });
  });

  it("keeps the AI budget behind sign-in", async () => {
    const res = await app.request("/api/ai/usage");

    expect(res.status).toBe(401);
  });

  it("refuses a protected route with an invalid token", async () => {
    const res = await app.request("/api/ai/complete", {
      method: "POST",
      headers: { Authorization: "Bearer not-a-jwt" },
    });

    expect(res.status).toBe(401);
  });
});
