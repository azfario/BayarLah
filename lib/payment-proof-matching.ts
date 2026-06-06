import { Prisma } from "@prisma/client";
import { prisma } from "./db.ts";
import { normalizeMalaysianPhone } from "./friends.ts";
import { centsToMoneyString } from "./money.ts";
export { decidePaymentProofMatch } from "./payment-proof-match-rules.ts";
import { decidePaymentProofMatch } from "./payment-proof-match-rules.ts";

export type CreatePaymentProofMatchInput = {
  collectorId: string;
  debtorPhone?: string | null;
  inboundChatId?: string | null;
  inboundSenderId?: string | null;
  senderSessionId?: string | null;
  messageId: string;
  receiptProvider?: string | null;
  imageStoragePath: string;
  imageHash: string;
  parsedAmountCents: number | null;
  parsedRecipient: string;
  parsedTransactionReference: string;
  parsedPaymentCode: string;
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

    const resolvedDebtor = await resolveDebtorFriend(tx, {
      collectorId: collector.id,
      debtorPhone: input.debtorPhone,
      inboundChatId: input.inboundChatId,
      inboundSenderId: input.inboundSenderId,
      senderSessionId: input.senderSessionId,
      messageId: input.messageId,
    });

    const openShares = resolvedDebtor.friendId
      ? await tx.$queryRaw<
          { id: string; owedAmount: Prisma.Decimal; paymentCode: string | null }[]
        >`
          SELECT es."id", es."owedAmount", es."paymentCode"
          FROM "ExpenseShare" AS es
          JOIN "Expense" AS e
            ON e."id" = es."expenseId"
          WHERE es."friendId" = ${resolvedDebtor.friendId}
            AND es."paidAt" IS NULL
            AND e."collectorId" = ${collector.id}
        `
      : [];

    const decision = decidePaymentProofMatch({
      amountCents: input.parsedAmountCents,
      recipientText: input.parsedRecipient,
      transactionReference: input.parsedTransactionReference,
      paymentCode: input.parsedPaymentCode,
      collectorDuitNowRecipientName: collector.duitNowRecipientName,
      collectorDuitNowIdValue: collector.duitNowIdValue,
      openShares: openShares.map((share) => ({
        id: share.id,
        owedAmountCents: decimalToCents(share.owedAmount),
        paymentCode: share.paymentCode,
      })),
      debtorIdentityReviewReason: resolvedDebtor.reviewReason,
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
        debtorFriendId: resolvedDebtor.friendId,
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
    await tx.$executeRaw`
      UPDATE "PaymentProof"
      SET
        "receiptProvider" = ${input.receiptProvider || null},
        "parsedPaymentCode" = ${input.parsedPaymentCode || null},
        "inboundMessageId" = ${input.messageId || null},
        "inboundChatId" = ${input.inboundChatId || null},
        "inboundSenderId" = ${input.inboundSenderId || null}
      WHERE "id" = ${paymentProof.id}
    `;

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

async function resolveDebtorFriend(
  tx: Prisma.TransactionClient,
  input: {
    collectorId: string;
    debtorPhone?: string | null;
    inboundChatId?: string | null;
    inboundSenderId?: string | null;
    senderSessionId?: string | null;
    messageId: string;
  }
) {
  const phone = getRealPhone(input.debtorPhone);
  if (phone) {
    const phoneMatches = await tx.friend.findMany({
      where: {
        ownerId: input.collectorId,
        phone: normalizeMalaysianPhone(phone),
      },
      select: { id: true },
    });
    const friendIds = uniqueValues(phoneMatches.map((friend) => friend.id));
    if (friendIds.length === 1) {
      return { friendId: friendIds[0], reviewReason: null };
    }
    if (friendIds.length > 1) {
      return {
        friendId: null,
        reviewReason: "Multiple debtor identities match the inbound phone.",
      };
    }
  }

  const identityKeys = getInboundIdentityKeys([
    input.inboundChatId,
    input.inboundSenderId,
    input.messageId,
  ]);
  if (identityKeys.length === 0) {
    return { friendId: null, reviewReason: "Could not resolve debtor identity." };
  }

  const attemptRows = input.senderSessionId
    ? await tx.$queryRaw<{ friendId: string }[]>`
    SELECT es."friendId"
    FROM "WhatsappReminderAttempt" AS wra
    JOIN "ExpenseShare" AS es
      ON es."id" = wra."expenseShareId"
    JOIN "Expense" AS e
      ON e."id" = es."expenseId"
    WHERE wra."status" = 'SENT'::"WhatsappReminderAttemptStatus"
      AND wra."senderSessionId" = ${input.senderSessionId}
      AND e."collectorId" = ${input.collectorId}
      AND (
        wra."whatsappChatId" IN (${Prisma.join(identityKeys)})
        OR wra."whatsappLidChatId" IN (${Prisma.join(identityKeys)})
        OR wra."providerMessageId" IN (${Prisma.join(identityKeys)})
      )
    ORDER BY wra."createdAt" DESC
  `
    : await tx.$queryRaw<{ friendId: string }[]>`
    SELECT es."friendId"
    FROM "WhatsappReminderAttempt" AS wra
    JOIN "ExpenseShare" AS es
      ON es."id" = wra."expenseShareId"
    JOIN "Expense" AS e
      ON e."id" = es."expenseId"
    WHERE wra."status" = 'SENT'::"WhatsappReminderAttemptStatus"
      AND e."collectorId" = ${input.collectorId}
      AND (
        wra."whatsappChatId" IN (${Prisma.join(identityKeys)})
        OR wra."whatsappLidChatId" IN (${Prisma.join(identityKeys)})
        OR wra."providerMessageId" IN (${Prisma.join(identityKeys)})
      )
    ORDER BY wra."createdAt" DESC
  `;
  const friendIds = uniqueValues(attemptRows.map((attempt) => attempt.friendId));

  if (friendIds.length === 1) {
    return { friendId: friendIds[0], reviewReason: null };
  }
  if (friendIds.length > 1) {
    return {
      friendId: null,
      reviewReason: "Multiple debtor identities match the inbound WhatsApp thread.",
    };
  }

  return { friendId: null, reviewReason: "Could not resolve debtor identity." };
}

function decimalToCents(value: Prisma.Decimal) {
  return Math.round(Number(value.toString()) * 100);
}

function getRealPhone(value: string | null | undefined) {
  if (!value || value.includes("@lid")) return null;

  const digits = value.split("@")[0]?.replace(/\D/g, "") ?? "";
  return digits ? `+${digits}` : null;
}

function getInboundIdentityKeys(values: Array<string | null | undefined>) {
  const keys = new Set<string>();

  for (const value of values) {
    if (!value) continue;
    keys.add(value);

    const chatId = extractOpenWaSerializedChatId(value);
    if (chatId) keys.add(chatId);
  }

  return [...keys].filter(Boolean);
}

function extractOpenWaSerializedChatId(value: string) {
  const match = value.match(/(?:true|false)_([^_]+@(?:lid|c\.us))/i);
  return match?.[1] ?? null;
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}
