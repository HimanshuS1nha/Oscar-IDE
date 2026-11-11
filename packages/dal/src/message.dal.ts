import { asc, eq, sql } from "drizzle-orm";

import type { ModelMessage } from "@oscar/ai";
import { db } from "@oscar/db";
import { conversationTable, messageTable } from "@oscar/db/schema";

export class MessageDal {
  /** The conversation's transcript, in order. Empty if it has none yet. */
  static async loadThread({
    conversationId,
  }: {
    conversationId: string;
  }): Promise<ModelMessage[]> {
    const rows = await db
      .select({ message: messageTable.message })
      .from(messageTable)
      .where(eq(messageTable.conversationId, conversationId))
      .orderBy(asc(messageTable.position));

    return rows.map((row) => row.message);
  }

  /**
   * Replaces the conversation's transcript with `messages`, and marks the
   * conversation as just used. `title` names it if it has no title yet.
   */
  static async replaceThread({
    conversationId,
    messages,
    title,
  }: {
    conversationId: string;
    messages: ReadonlyArray<ModelMessage>;
    title?: string;
  }) {
    await db.transaction(async (tx) => {
      await tx
        .delete(messageTable)
        .where(eq(messageTable.conversationId, conversationId));

      if (messages.length > 0) {
        await tx.insert(messageTable).values(
          messages.map((message, position) => ({
            conversationId,
            position,
            messageId: message.id ?? null,
            role: message.role,
            message,
          })),
        );
      }

      await tx
        .update(conversationTable)
        .set({
          updatedAt: sql`now()`,
          ...(title && {
            title: sql`coalesce(${conversationTable.title}, ${title})`,
          }),
        })
        .where(eq(conversationTable.id, conversationId));
    });
  }
}
