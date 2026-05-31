"use server";

import { Prisma, type ExpenseSplitMode } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { normalizeMalaysianPhone } from "@/lib/friends";
import {
  centsToMoneyString,
  formatMoney,
  parseMoneyToCents,
} from "@/lib/money";
import { sendOpenWaText } from "@/lib/openwa";
import { isProfileComplete } from "@/lib/profile";
import { parseReminderScheduleFromFormData } from "@/lib/reminders";
import { getNextReminderAtFromCadence, toOpenWaChatId } from "@/lib/whatsapp";
import { ensureUserInDB } from "@/lib/actions/user";

type InlineFriendInput = {
  key: string;
  name: string;
  phone: string;
  owedCents: number | null;
};

export async function createExpense(formData: FormData) {
  const user = await ensureUserInDB();
  if (!isProfileComplete(user)) redirect("/profile?next=/expenses");

  const description = getString(formData.get("description"));
  const splitMode = getSplitMode(formData.get("splitMode"));
  const totalCents = parseMoneyToCents(formData.get("totalAmount"));
  const selectedFriendIds = getStringList(formData.getAll("friendIds"));

  if (!description || !splitMode || totalCents === null || totalCents <= 0) {
    redirectWithMessage("/expenses", "Please enter a description and total paid amount.");
  }

  const inlineFriendInputs = getInlineFriendInputs(formData, splitMode);

  if (selectedFriendIds.length === 0 && inlineFriendInputs.length === 0) {
    redirectWithMessage("/expenses", "Please select or add at least one friend.");
  }

  const reminderSchedule = getReminderScheduleOrRedirect(formData);

  const friends = await prisma.friend.findMany({
    where: {
      ownerId: user.id,
      id: { in: selectedFriendIds },
    },
    select: { id: true, phone: true },
  });
  const ownedFriendIds = friends.map((friend) => friend.id);

  if (ownedFriendIds.length !== selectedFriendIds.length) {
    redirectWithMessage("/expenses", "Please choose friends from your own list.");
  }

  const selectedPhones = new Set(friends.map((friend) => friend.phone));
  if (inlineFriendInputs.some((friend) => selectedPhones.has(friend.phone))) {
    redirectWithMessage(
      "/expenses",
      "One inline friend is already selected from your saved friends."
    );
  }

  const inlineFriends = await Promise.all(
    inlineFriendInputs.map((friend) => getOrCreateInlineFriend(friend, user.id))
  );
  const debtorIds = new Set(ownedFriendIds);
  for (const friend of inlineFriends) debtorIds.add(friend.id);

  const finalFriendIds = Array.from(debtorIds);
  const amounts = getShareAmounts(
    formData,
    splitMode,
    finalFriendIds,
    totalCents,
    inlineFriendInputs.map((input, index) => ({
      friendId: inlineFriends[index].id,
      owedCents: input.owedCents,
    }))
  );

  await prisma.expense.create({
    data: {
      collectorId: user.id,
      description,
      totalAmount: centsToMoneyString(totalCents),
      splitMode,
      collectorAmount: centsToMoneyString(amounts.collectorCents),
      shares: {
        create: finalFriendIds.map((friendId) => ({
          friendId,
          owedAmount: centsToMoneyString(amounts.friendCentsById.get(friendId) ?? 0),
          ...reminderSchedule,
        })),
      },
    },
  });

  revalidatePath("/expenses");
  redirect("/expenses?success=Expense recorded.");
}

export async function deleteExpense(formData: FormData) {
  const user = await ensureUserInDB();
  if (!isProfileComplete(user)) redirect("/profile?next=/expenses");

  const expenseId = getString(formData.get("expenseId"));
  if (!expenseId) {
    redirectWithMessage("/expenses", "Expense not found.");
  }

  const deleted = await prisma.$transaction(async (tx) => {
    const expense = await tx.expense.findFirst({
      where: {
        id: expenseId,
        collectorId: user.id,
      },
      select: {
        id: true,
        shares: { select: { id: true } },
        receiptItems: { select: { id: true } },
      },
    });

    if (!expense) return false;

    const shareIds = expense.shares.map((share) => share.id);
    if (shareIds.length > 0) {
      await tx.whatsappReminderAttempt.deleteMany({
        where: { expenseShareId: { in: shareIds } },
      });
      await tx.expenseShare.deleteMany({
        where: { id: { in: shareIds } },
      });
    }

    const receiptItemIds = expense.receiptItems.map((item) => item.id);
    if (receiptItemIds.length > 0) {
      await tx.receiptItemAllocation.deleteMany({
        where: { receiptItemId: { in: receiptItemIds } },
      });
      await tx.receiptItem.deleteMany({
        where: { id: { in: receiptItemIds } },
      });
    }

    const result = await tx.expense.deleteMany({
      where: {
        id: expense.id,
        collectorId: user.id,
      },
    });

    return result.count > 0;
  });

  if (!deleted) {
    redirectWithMessage("/expenses", "Expense not found.");
  }

  revalidatePath("/expenses");
  redirect("/expenses?success=Expense removed.");
}

export async function queueExpenseShareReminderNow(formData: FormData) {
  const user = await ensureUserInDB();
  if (!isProfileComplete(user)) redirect("/profile?next=/expenses");

  const shareId = getString(formData.get("shareId"));
  if (!shareId) {
    redirectWithMessage("/expenses", "Reminder share not found.");
  }

  const share = await prisma.expenseShare.findFirst({
    where: {
      id: shareId,
      expense: { collectorId: user.id },
    },
    select: {
      id: true,
      reminderFrequencyValue: true,
      reminderFrequencyUnit: true,
      reminderStatus: true,
    },
  });

  if (!share) {
    redirectWithMessage("/expenses", "Reminder share not found.");
  }

  if (await getExpenseSharePaidAt(share.id)) {
    redirectWithMessage("/expenses", "This share is already marked paid.");
  }

  if (await hasPendingPaymentProofForShare(share.id)) {
    redirectWithMessage("/expenses", "This share has a payment proof pending review.");
  }

  if (
    share.reminderStatus !== "ACTIVE" ||
    !share.reminderFrequencyValue ||
    !share.reminderFrequencyUnit
  ) {
    redirectWithMessage("/expenses", "This share does not have an active reminder.");
  }

  await prisma.expenseShare.update({
    where: { id: share.id },
    data: { nextReminderAt: new Date() },
  });

  revalidatePath("/expenses");
  redirect("/expenses?success=Reminder queued for WhatsApp worker.");
}

export async function markExpenseSharePaid(formData: FormData) {
  const user = await ensureUserInDB();
  if (!isProfileComplete(user)) redirect("/profile?next=/expenses");

  const shareId = getString(formData.get("shareId"));
  if (!shareId) {
    redirectWithMessage("/expenses", "Expense share not found.");
  }

  const paidAt = new Date();
  const result = await prisma.$executeRaw`
    UPDATE "ExpenseShare" AS es
    SET
      "paidAt" = ${paidAt},
      "reminderStatus" = 'PAUSED'::"ReminderStatus",
      "nextReminderAt" = NULL,
      "updatedAt" = ${paidAt}
    FROM "Expense" AS e
    WHERE es."id" = ${shareId}
      AND es."expenseId" = e."id"
      AND e."collectorId" = ${user.id}
  `;

  if (result === 0) {
    redirectWithMessage("/expenses", "Expense share not found.");
  }

  revalidatePath("/expenses");
  redirect("/expenses?success=Friend marked paid.");
}

export async function markExpenseShareUnpaid(formData: FormData) {
  const user = await ensureUserInDB();
  if (!isProfileComplete(user)) redirect("/profile?next=/expenses");

  const shareId = getString(formData.get("shareId"));
  if (!shareId) {
    redirectWithMessage("/expenses", "Expense share not found.");
  }

  const share = await prisma.expenseShare.findFirst({
    where: {
      id: shareId,
      expense: { collectorId: user.id },
    },
    select: {
      id: true,
      reminderFrequencyValue: true,
      reminderFrequencyUnit: true,
    },
  });

  if (!share) {
    redirectWithMessage("/expenses", "Expense share not found.");
  }

  const now = new Date();
  const hasReminderCadence =
    Boolean(share.reminderFrequencyValue) && Boolean(share.reminderFrequencyUnit);
  const reminderStatus = hasReminderCadence
    ? Prisma.sql`'ACTIVE'::"ReminderStatus"`
    : Prisma.sql`'NOT_SCHEDULED'::"ReminderStatus"`;
  const nextReminderAt =
    hasReminderCadence && share.reminderFrequencyValue && share.reminderFrequencyUnit
      ? getNextReminderAtFromCadence(
          share.reminderFrequencyValue,
          share.reminderFrequencyUnit,
          now
        )
      : null;

  await prisma.$executeRaw`
    UPDATE "ExpenseShare"
    SET
      "paidAt" = NULL,
      "reminderStatus" = ${reminderStatus},
      "nextReminderAt" = ${nextReminderAt},
      "updatedAt" = ${now}
    WHERE "id" = ${share.id}
  `;

  revalidatePath("/expenses");
  redirect("/expenses?success=Friend marked unpaid.");
}

export async function confirmPaymentProof(formData: FormData) {
  const user = await ensureUserInDB();
  if (!isProfileComplete(user)) redirect("/profile?next=/expenses");

  const proofId = getString(formData.get("paymentProofId"));
  const shareId = getString(formData.get("shareId"));
  if (!proofId || !shareId) {
    redirectWithMessage("/expenses", "Payment proof review data is missing.");
  }

  const paidAt = new Date();
  const confirmed = await prisma.$transaction(async (tx) => {
    const proof = await tx.paymentProof.findFirst({
      where: {
        id: proofId,
        collectorId: user.id,
        status: "PENDING_REVIEW",
      },
      select: {
        id: true,
        debtorFriendId: true,
      },
    });

    if (!proof) return false;

    const share = await tx.expenseShare.findFirst({
      where: {
        id: shareId,
        paidAt: null,
        expense: { collectorId: user.id },
        ...(proof.debtorFriendId ? { friendId: proof.debtorFriendId } : {}),
      },
      select: {
        id: true,
        owedAmount: true,
        friend: { select: { name: true, phone: true } },
        expense: { select: { description: true } },
      },
    });

    if (!share) return false;

    await tx.expenseShare.update({
      where: { id: share.id },
      data: {
        paidAt,
        reminderStatus: "PAUSED",
        nextReminderAt: null,
      },
    });

    await tx.paymentProof.update({
      where: { id: proof.id },
      data: {
        status: "CONFIRMED",
        expenseShareId: share.id,
        reviewedAt: paidAt,
        rejectedReason: null,
      },
    });

    return {
      debtorPhone: share.friend.phone,
      expenseDescription: share.expense.description,
      amountLabel: formatMoney(share.owedAmount),
    };
  });

  if (!confirmed) {
    redirectWithMessage("/expenses", "Payment proof or selected debt is no longer reviewable.");
  }

  await notifyDebtorPaymentProofReviewed({
    sessionId: user.whatsappSessionId,
    debtorPhone: confirmed.debtorPhone,
    text: [
      "Payment confirmed.",
      `You're squared up for ${confirmed.expenseDescription} (${confirmed.amountLabel}).`,
    ].join("\n"),
    context: `confirmed proof ${proofId}`,
  });

  revalidatePath("/expenses");
  redirect("/expenses?success=Payment proof confirmed.");
}

export async function rejectPaymentProof(formData: FormData) {
  const user = await ensureUserInDB();
  if (!isProfileComplete(user)) redirect("/profile?next=/expenses");

  const proofId = getString(formData.get("paymentProofId"));
  if (!proofId) {
    redirectWithMessage("/expenses", "Payment proof review data is missing.");
  }

  const reviewedAt = new Date();
  const rejected = await prisma.$transaction(async (tx) => {
    const proof = await tx.paymentProof.findFirst({
      where: {
        id: proofId,
        collectorId: user.id,
        status: "PENDING_REVIEW",
      },
      select: {
        id: true,
        parsedAmount: true,
        debtorFriend: { select: { phone: true } },
        expenseShare: {
          select: {
            expense: { select: { description: true } },
            friend: { select: { phone: true } },
          },
        },
      },
    });

    if (!proof) return null;

    await tx.paymentProof.update({
      where: { id: proof.id },
      data: {
        status: "REJECTED",
        reviewedAt,
        rejectedReason: "Rejected by collector.",
      },
    });

    return {
      debtorPhone: proof.debtorFriend?.phone ?? proof.expenseShare?.friend.phone ?? null,
      expenseDescription: proof.expenseShare?.expense.description ?? "the submitted proof",
      amountLabel: proof.parsedAmount ? formatMoney(proof.parsedAmount) : null,
    };
  });

  if (!rejected) {
    redirectWithMessage("/expenses", "Payment proof is no longer reviewable.");
  }

  await notifyDebtorPaymentProofReviewed({
    sessionId: user.whatsappSessionId,
    debtorPhone: rejected.debtorPhone,
    text: [
      "Payment proof rejected.",
      `Please check and resend the correct receipt for ${rejected.expenseDescription}${
        rejected.amountLabel ? ` (${rejected.amountLabel})` : ""
      }.`,
    ].join("\n"),
    context: `rejected proof ${proofId}`,
  });

  revalidatePath("/expenses");
  redirect("/expenses?success=Payment proof rejected.");
}

async function notifyDebtorPaymentProofReviewed(input: {
  sessionId: string | null;
  debtorPhone: string | null;
  text: string;
  context: string;
}) {
  if (!input.sessionId || !input.debtorPhone) return;

  try {
    await sendOpenWaText({
      sessionId: input.sessionId,
      chatId: toOpenWaChatId(input.debtorPhone),
      text: input.text,
    });
  } catch (error) {
    console.error(
      `Failed to send payment proof ${input.context} notice: ${getErrorMessage(error)}`
    );
  }
}

async function getExpenseSharePaidAt(shareId: string) {
  const rows = await prisma.$queryRaw<{ paidAt: Date | null }[]>`
    SELECT "paidAt" FROM "ExpenseShare" WHERE "id" = ${shareId} LIMIT 1
  `;

  return rows[0]?.paidAt ?? null;
}

async function hasPendingPaymentProofForShare(shareId: string) {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM "ExpenseShare" AS es
      JOIN "PaymentProof" AS pp
        ON pp."status" = 'PENDING_REVIEW'::"PaymentProofStatus"
        AND (
          pp."expenseShareId" = es."id"
          OR (
            pp."expenseShareId" IS NULL
            AND pp."debtorFriendId" = es."friendId"
          )
        )
      WHERE es."id" = ${shareId}
    ) AS "exists"
  `;

  return rows[0]?.exists ?? false;
}

function getShareAmounts(
  formData: FormData,
  splitMode: ExpenseSplitMode,
  friendIds: string[],
  totalCents: number,
  inlineFriends: { friendId: string; owedCents: number | null }[]
) {
  if (splitMode === "EQUAL_SPLIT") {
    const shareCents = Math.round(totalCents / (friendIds.length + 1));
    return {
      collectorCents: shareCents,
      friendCentsById: new Map(friendIds.map((friendId) => [friendId, shareCents])),
    };
  }

  const collectorCents = parseMoneyToCents(formData.get("collectorAmount"));
  if (collectorCents === null || collectorCents < 0) {
    redirectWithMessage("/expenses", "Please enter your own amount for custom split.");
  }

  const friendCentsById = new Map<string, number>();
  const inlineFriendCentsById = new Map(
    inlineFriends.map((friend) => [friend.friendId, friend.owedCents])
  );

  for (const friendId of friendIds) {
    const owedCents = inlineFriendCentsById.has(friendId)
      ? inlineFriendCentsById.get(friendId) ?? null
      : parseMoneyToCents(formData.get(`owedAmount:${friendId}`));

    if (owedCents === null || owedCents <= 0) {
      redirectWithMessage("/expenses", "Please enter an amount for each selected friend.");
    }

    friendCentsById.set(friendId, owedCents);
  }

  return { collectorCents, friendCentsById };
}

function getInlineFriendInputs(
  formData: FormData,
  splitMode: ExpenseSplitMode
): InlineFriendInput[] {
  const keys = Array.from(new Set(getStringList(formData.getAll("inlineFriendKeys"))));
  const friends: InlineFriendInput[] = [];
  const phones = new Set<string>();

  for (const key of keys) {
    const name = getString(formData.get(`inlineFriendName:${key}`));
    const rawPhone = getString(formData.get(`inlineFriendPhone:${key}`));
    const rawOwed = getString(formData.get(`inlineFriendOwedAmount:${key}`));

    if (!name && !rawPhone && !rawOwed) continue;

    if (!name || !rawPhone) {
      redirectWithMessage("/expenses", "Please enter both name and phone for each new friend.");
    }

    const phone = normalizeMalaysianPhone(rawPhone);
    if (phones.has(phone)) {
      redirectWithMessage("/expenses", "Each new inline friend needs a unique phone number.");
    }

    const owedCents =
      splitMode === "CUSTOM_AMOUNT"
        ? parseMoneyToCents(formData.get(`inlineFriendOwedAmount:${key}`))
        : null;

    if (splitMode === "CUSTOM_AMOUNT" && (!owedCents || owedCents <= 0)) {
      redirectWithMessage("/expenses", "Please enter an amount for each new friend.");
    }

    phones.add(phone);
    friends.push({ key, name, phone, owedCents });
  }

  return friends;
}

async function getOrCreateInlineFriend(
  input: InlineFriendInput,
  ownerId: string
) {
  const existing = await prisma.friend.findUnique({
    where: {
      ownerId_phone: { ownerId, phone: input.phone },
    },
  });

  if (existing) return existing;

  return prisma.friend.create({
    data: {
      ownerId,
      name: input.name,
      phone: input.phone,
    },
  });
}

function getSplitMode(value: FormDataEntryValue | null): ExpenseSplitMode | null {
  if (value === "EQUAL_SPLIT" || value === "CUSTOM_AMOUNT") return value;
  return null;
}

function getString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function getStringList(values: FormDataEntryValue[]) {
  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

function getReminderScheduleOrRedirect(formData: FormData) {
  try {
    return parseReminderScheduleFromFormData(formData);
  } catch (error) {
    redirectWithMessage("/expenses", getErrorMessage(error));
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function redirectWithMessage(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}
