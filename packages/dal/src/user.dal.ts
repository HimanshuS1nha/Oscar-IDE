import { eq } from "drizzle-orm";

import { db } from "@oscar/db";
import { userTable } from "@oscar/db/schema";

export class UserDal {
  // INTERNAL because it exposes user's passwordHash
  static async INTERNAL_getByEmail({ email }: { email: string }) {
    const data = await db
      .select({
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
        passwordHash: userTable.passwordHash,
      })
      .from(userTable)
      .where(eq(userTable.email, email))
      .limit(1);

    return data[0];
  }

  static async getById({ id }: { id: string }) {
    const data = await db
      .select({
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
      })
      .from(userTable)
      .where(eq(userTable.id, id))
      .limit(1);

    return data[0];
  }

  static async getByEmail({ email }: { email: string }) {
    const data = await db
      .select({
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
      })
      .from(userTable)
      .where(eq(userTable.email, email))
      .limit(1);

    return data[0];
  }

  static async create({
    name,
    email,
    passwordHash,
  }: {
    name: string;
    email: string;
    passwordHash: string;
  }) {
    const [inserted] = await db
      .insert(userTable)
      .values({ name, email, passwordHash })
      .$returningId();

    return { id: inserted!.id, name, email };
  }
}
