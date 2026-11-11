import {
  index,
  int,
  mysqlEnum,
  mysqlTable,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";
import { v7 } from "uuid";

import { userTable } from "./user.schema";

/**
 * One model call made for a user, and what it cost. A chat run that uses
 * tools makes one call per step. Each user's spending today is the sum of
 * `costMicroUsd` since midnight UTC.
 */
export const aiUsageTable = mysqlTable(
  "ai_usage",
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(v7),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    /** The feature that made the call. */
    feature: mysqlEnum(["chat", "completion", "commit-message"]).notNull(),
    provider: varchar({ length: 32 }).notNull(),
    model: varchar({ length: 128 }).notNull(),
    inputTokens: int().notNull(),
    /** Reasoning tokens included. */
    outputTokens: int().notNull(),
    /**
     * Millionths of a dollar, at the model's price when the call was made, so
     * later price changes don't rewrite past spending.
     */
    costMicroUsd: int().notNull(),
    // Set here rather than by MySQL's now(), so writes and the "since
    // midnight UTC" reads convert times the same way whatever the server's
    // time zone.
    createdAt: timestamp({ fsp: 3 })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  // A user's calls since a given time.
  (table) => [
    index("ai_usage_user_created_idx").on(table.userId, table.createdAt),
  ],
);
