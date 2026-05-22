"use server";

import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export async function ensureUserInDB() {
  const user = await currentUser();
  if (!user) throw new Error("Not authenticated");

  const email = user.emailAddresses[0]?.emailAddress ?? "";

  await prisma.user.upsert({
    where: { clerkId: user.id },
    update: { email },
    create: { clerkId: user.id, email },
  });
}
