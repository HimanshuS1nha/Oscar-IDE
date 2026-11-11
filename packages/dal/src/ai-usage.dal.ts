import { and, eq, gte, sql } from "drizzle-orm";

import { db } from "@oscar/db";
import { aiUsageTable } from "@oscar/db/schema";

export class AiUsageDal {
  /** Saves one model call and its cost. */
  static async record(usage: {
    userId: string;
    feature: "chat" | "completion" | "commit-message";
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    costMicroUsd: number;
  }) {
    await db.insert(aiUsageTable).values(usage);
  }

  /** What the user's model calls since `since` cost, in micro-dollars. */
  static async costSince({ userId, since }: { userId: string; since: Date }) {
    const [row] = await db
      .select({
        total:
          sql<number>`coalesce(sum(${aiUsageTable.costMicroUsd}), 0)`.mapWith(
            Number,
          ),
      })
      .from(aiUsageTable)
      .where(
        and(
          eq(aiUsageTable.userId, userId),
          gte(aiUsageTable.createdAt, since),
        ),
      );

    return row?.total ?? 0;
  }
}
