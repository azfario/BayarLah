import { Prisma } from "@prisma/client";
import { prisma } from "./db.ts";
import { normalizeMalaysianPhone } from "./friends.ts";
import { centsToMoneyString } from "./money.ts";
export { decidePaymentProofMatch } from "./payment-proof-match-rules.ts";
import { decidePaymentProofMatch } from "./payment-proof-match-rules.ts";

export type CreatePaymentProofMatchInput = {
  collectorId: string;
  debtorPhone: string;
  imageStoragePath: string;
  imageHash: string;
  parsedAmountCents: number | null;
  parsedRecipient: string;
  parsedTransactionReference: string;
  parsedTimestamp: Date | null;
  rawOcrText: string;
  confidenceNotes: string[];
};

export async function createMatchedPaymentProof(input: CreatePaymentProofMatchInput) {
  return prisma.$transaction(async (tx) => {
    const duplicate = await tx.paymentProof.findFirst({
      where: {
        OR: [
          { imageHash: input.imageHash },
          ...(input.parsedTransactionReference
            ? [{ parsedTransactionReference: input.parsedTransactionReference }]
            : []),
        ],
      },
      select: { id: true, imageHash: true, parsedTransactionReference: true },
    });

    const collector = await tx.user.findUnique({
      where: { id: input.collectorId },
      select: {
        id: true,
        duitNowRecipientName: true,
        duitNowIdValue: true,
      },
    });

    if (!collector) {
      throw new Error("Collector not found.");
    }

    const debtorFriend = await tx.friend.findFirst({
      where: {
        ownerId: collector.id,
        phone: normalizeMalaysianPhone(input.debtorPhone),
      },
      select: { id: true },
    });

    const openShares = debtorFriend
      ? await tx.expenseShare.findMany({
          where: {
            friendId: debtorFriend.id,
            paidAt: null,
            expense: { collectorId: collector.id },
          },
          select: { id: true, owedAmount: true },
        })
      : [];

    const decision = decidePaymentProofMatch({
      amountCents: input.parsedAmountCents,
      recipientText: input.parsedRecipient,
      transactionReference: input.parsedTransactionReference,
      collectorDuitNowRecipientName: collector.duitNowRecipientName,
      collectorDuitNowIdValue: collector.duitNowIdValue,
      openShares: openShares.map((share) => ({
        id: share.id,
        owedAmountCents: decimalToCents(share.owedAmount),
      })),
      isDuplicateImage: Boolean(duplicate?.imageHash),
      isDuplicateTransactionReference: Boolean(
        input.parsedTransactionReference &&
          duplicate?.parsedTransactionReference === input.parsedTransactionReference
      ),
      confidenceNotes: input.confidenceNotes,
    });

    if (decision.status === "DUPLICATE_REJECTED") {
      return { decision, paymentProofId: null };
    }

    const paymentProof = await tx.paymentProof.create({
      data: {
        collectorId: collector.id,
        debtorFriendId: debtorFriend?.id ?? null,
        expenseShareId: decision.expenseShareId,
        status: decision.status,
        imageStoragePath: input.imageStoragePath,
        imageHash: input.imageHash,
        parsedTransactionReference: input.parsedTransactionReference || null,
        parsedAmount:
          input.parsedAmountCents === null
            ? null
            : centsToMoneyString(input.parsedAmountCents),
        parsedRecipient: input.parsedRecipient || null,
        parsedTimestamp: input.parsedTimestamp,
        rawOcrText: input.rawOcrText || null,
        reviewReason: decision.reviewReason,
        rejectedReason: decision.rejectedReason,
        reviewedAt: decision.status === "AUTO_CONFIRMED" ? new Date() : null,
      },
      select: { id: true },
    });

    if (decision.status === "AUTO_CONFIRMED" && decision.expenseShareId) {
      const paidAt = new Date();
      await tx.expenseShare.update({
        where: { id: decision.expenseShareId },
        data: {
          paidAt,
          reminderStatus: "PAUSED",
          nextReminderAt: null,
        },
      });
    }

    return { decision, paymentProofId: paymentProof.id };
  });
}

function decimalToCents(value: Prisma.Decimal) {
  return Math.round(Number(value.toString()) * 100);
}
