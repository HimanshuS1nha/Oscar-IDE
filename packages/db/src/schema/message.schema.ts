import {
  int,
  json,
  mysqlEnum,
  mysqlTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { v7 } from "uuid";

import type { ModelMessage } from "@oscar/ai";

import { conversationTable } from "./conversation.schema";

/**
 * One message of a conversation's transcript, as TanStack AI's persistence
 * saves it: a `ModelMessage`, kept whole in `message` so it reads back exactly
 * as it was saved. Tool results are messages of their own (role `tool`).
 * The transcript is rewritten as a whole after each answer.
 */
export const messageTable = mysqlTable(
  "message",
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(v7),
    conversationId: varchar({ length: 36 })
      .notNull()
      .references(() => conversationTable.id, { onDelete: "cascade" }),
    /** The message's place in the conversation, from 0. */
    position: int().notNull(),
    /** `ModelMessage.id`, when it has one: the id the app shows it under. */
    messageId: varchar({ length: 255 }),
    role: mysqlEnum(["user", "assistant", "tool"]).notNull(),
    message: json().$type<ModelMessage>().notNull(),
    // Milliseconds, so messages saved in the same second keep their order.
    createdAt: timestamp({ fsp: 3 })
      .default(sql`(now(3))`)
      .notNull(),
  },
  (table) => [
    uniqueIndex("message_conversation_position_idx").on(
      table.conversationId,
      table.position,
    ),
  ],
);
