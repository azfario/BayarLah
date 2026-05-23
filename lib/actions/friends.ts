"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { normalizeMalaysianPhone } from "@/lib/friends";
import { isProfileComplete } from "@/lib/profile";
import { ensureUserInDB } from "@/lib/actions/user";

export async function createFriend(formData: FormData) {
  const user = await ensureUserInDB();
  if (!isProfileComplete(user)) redirect("/profile?next=/friends");

  const name = getString(formData.get("name"));
  const phone = normalizeMalaysianPhone(getString(formData.get("phone")));

  if (!name || !phone) {
    redirectWithMessage("/friends", "Please enter your friend's name and phone.");
  }

  try {
    await prisma.friend.create({
      data: {
        ownerId: user.id,
        name,
        phone,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      redirectWithMessage("/friends", "This phone number is already in your friends list.");
    }

    throw error;
  }

  revalidatePath("/friends");
  revalidatePath("/expenses");
  redirect("/friends?success=Friend added.");
}

export async function deleteFriend(formData: FormData) {
  const user = await ensureUserInDB();
  if (!isProfileComplete(user)) redirect("/profile?next=/friends");

  const friendId = getString(formData.get("friendId"));
  if (!friendId) {
    redirectWithMessage("/friends", "Friend not found.");
  }

  const usedInExpenses = await prisma.expenseShare.count({
    where: {
      friendId,
      friend: { ownerId: user.id },
    },
  });

  if (usedInExpenses > 0) {
    redirectWithMessage(
      "/friends",
      "This friend is used in an expense, so keep them for history."
    );
  }

  const result = await prisma.friend.deleteMany({
    where: {
      id: friendId,
      ownerId: user.id,
    },
  });

  if (result.count === 0) {
    redirectWithMessage("/friends", "Friend not found.");
  }

  revalidatePath("/friends");
  revalidatePath("/expenses");
  redirect("/friends?success=Friend removed.");
}

function getString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function redirectWithMessage(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}
