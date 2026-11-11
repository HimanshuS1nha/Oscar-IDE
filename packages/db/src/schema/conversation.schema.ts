import { index, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";
import { v7 } from "uuid";

import { userTable } from "./user.schema";

/** A chat between a user and the AI. Its messages are in `messageTable`. */
export const conversationTable = mysqlTable(
  "conversation",
  {
    id: varchar({ length: 36 }).primaryKey().$defaultFn(v7),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    /** Null until one is given or generated from the first messages. */
    title: varchar({ length: 255 }),
    createdAt: timestamp().defaultNow().notNull(),
    updatedAt: timestamp().defaultNow().notNull().onUpdateNow(),
  },
  // A user's conversations, most recent first.
  (table) => [
    index("conversation_user_updated_idx").on(table.userId, table.updatedAt),
  ],
);
