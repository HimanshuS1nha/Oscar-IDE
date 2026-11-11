import { mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
import { v7 } from "uuid";

export const userTable = mysqlTable("user", {
  id: varchar({ length: 36 }).primaryKey().$defaultFn(v7),
  name: varchar({ length: 255 }).notNull(),
  email: varchar({ length: 255 }).unique().notNull(),
  passwordHash: text().notNull(),
  createdAt: timestamp().defaultNow().notNull(),
  updatedAt: timestamp().defaultNow().notNull().onUpdateNow(),
});
