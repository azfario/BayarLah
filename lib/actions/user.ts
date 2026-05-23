"use server";

import { Prisma } from "@prisma/client";
import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export async function ensureUserInDB() {
  const user = await currentUser();
  if (!user) throw new Error("Not authenticated");

  const email = user.emailAddresses[0]?.emailAddress ?? "";

  try {
    return await prisma.user.upsert({
      where: { clerkId: user.id },
      update: { email },
      create: { clerkId: user.id, email },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P1001"
    ) {
      throw new Error(
        "Unable to reach the Supabase database. Check DATABASE_URL in .env.local and make sure it uses the pooled Supabase connection string on port 6543 with sslmode=require.",
      );
    }

    throw error;
  }
}
