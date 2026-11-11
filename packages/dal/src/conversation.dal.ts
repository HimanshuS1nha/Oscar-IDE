import { eq } from "drizzle-orm";

import { db } from "@oscar/db";
import { conversationTable } from "@oscar/db/schema";

export class ConversationDal {
  static async getById({ id }: { id: string }) {
    const data = await db
      .select({
        id: conversationTable.id,
        userId: conversationTable.userId,
        title: conversationTable.title,
      })
      .from(conversationTable)
      .where(eq(conversationTable.id, id))
      .limit(1);

    return data[0];
  }

  /**
   * Creates the conversation unless one with this id already exists (made by
   * a concurrent request, or another user's). Check the owner afterwards.
   */
  static async createIfMissing({ id, userId }: { id: string; userId: string }) {
    await db.insert(conversationTable).ignore().values({ id, userId });
  }
}
