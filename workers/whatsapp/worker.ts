import { Buffer } from "node:buffer";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Prisma, PrismaClient } from "@prisma/client";
import { formatMoney } from "../../lib/money.js";
import { generatePaymentCode } from "../../lib/payment-codes.js";
import {
  downloadOpenWaMessageMedia,
  ensureOpenWaMessageReceivedWebhook,
  getOpenWaLinkedPhone,
  type OpenWaInboundMessage,
  listOpenWaMessages,
  mapOpenWaSessionStatus,
  recoverOpenWaSession,
  sendOpenWaImage,
  sendOpenWaText,
} from "../../lib/openwa.js";
import { handleInboundPaymentProofImage } from "../../lib/payment-proof-inbound.js";
import { createServerSupabaseClient } from "../../lib/supabase/server.js";
import {
  classifyWhatsappMessage,
  getWhatsappMessageId,
} from "../../lib/whatsapp-inbound.js";
import {
  buildPaymentCodeMessage,
  buildWhatsAppReminderMessage,
  getNextReminderAtFromCadence,
  getRetryReminderAt,
  toOpenWaChatId,
} from "../../lib/whatsapp.js";
import {
  getWhatsappBotSession,
  resolveWhatsappBotInboundRoute,
  updateWhatsappBotSessionStatus,
} from "../../lib/whatsapp-bot.js";

type DueShare = Prisma.ExpenseShareGetPayload<{
  include: {
    friend: { select: { name: true; phone: true } };
    expense: {
      select: {
        description: true;
        collector: {
          select: {
            id: true;
            phone: true;
            fullName: true;
            duitNowIdType: true;
            duitNowIdValue: true;
            duitNowQrUrl: true;
          };
        };
      };
    };
  };
}>;

type ActiveBotSession = {
  sessionId: string;
};

const prisma = new PrismaClient();
const pollIntervalMs = getPositiveInteger(
  process.env.WHATSAPP_WORKER_INTERVAL_MS,
  60_000
);
const retryDelayMs = getPositiveInteger(
  process.env.WHATSAPP_RETRY_DELAY_MS,
  15 * 60_000
);
const maxPerRun = getPositiveInteger(process.env.WHATSAPP_MAX_PER_RUN, 20);
const inboundMessageLimit = getPositiveInteger(
  process.env.WHATSAPP_INBOUND_MESSAGE_LIMIT,
  30
);
const webhookPort = getOptionalPositiveInteger(process.env.WHATSAPP_WEBHOOK_PORT);
const paymentProofWebhookUrl =
  process.env.OPENWA_PAYMENT_PROOF_WEBHOOK_URL?.trim() || null;
const logEmptyPolls = getBoolean(process.env.WHATSAPP_LOG_EMPTY_POLLS, false);
const runOnce =
  process.env.WHATSAPP_WORKER_RUN_ONCE === "true" ||
  process.argv.includes("--once");

let shuttingDown = false;
const webhookRegisteredSessions = new Set<string>();
let webhookServer: ReturnType<typeof createServer> | null = null;

async function main() {
  console.log("Starting BayarLah WhatsApp reminder poller.");
  startWebhookServer();

  do {
    const botSession = await getActiveWhatsappBotSession();
    const inboundProcessed = await processInboundPaymentProofMessages(botSession);
    const processed = await processDueReminders(botSession);
    if (processed > 0) {
      console.log(`Processed ${processed} due WhatsApp reminder(s).`);
    }
    if (inboundProcessed > 0) {
      console.log(`Processed ${inboundProcessed} inbound payment proof(s).`);
    }
    if (processed === 0 && inboundProcessed === 0 && (runOnce || logEmptyPolls)) {
      console.log("No due WhatsApp reminders or inbound payment proofs found.");
    }

    if (runOnce) break;
    await sleep(pollIntervalMs);
  } while (!shuttingDown);

  await shutdown();
}

async function getActiveWhatsappBotSession(): Promise<ActiveBotSession | null> {
  const storedSession = await getWhatsappBotSession(prisma);
  if (!storedSession?.sessionId) return null;

  try {
    const session = await recoverOpenWaSession(storedSession.sessionId);
    const status = mapOpenWaSessionStatus(session.status);
    const linkedPhone = getOpenWaLinkedPhone(session);

    if (status !== "LINKED") {
      await updateWhatsappBotSessionStatus(prisma, {
        sessionId: storedSession.sessionId,
        status,
        linkedPhone: null,
        linkedAt: null,
        linkError: "BayarLah bot session is not connected.",
      });
      return null;
    }

    await updateWhatsappBotSessionStatus(prisma, {
      sessionId: storedSession.sessionId,
      status: "LINKED",
      linkedPhone,
      linkedAt: storedSession.linkedAt ?? new Date(),
      linkError: null,
    });
    await ensurePaymentProofWebhook(storedSession.sessionId);

    return { sessionId: storedSession.sessionId };
  } catch (error) {
    await updateWhatsappBotSessionStatus(prisma, {
      sessionId: storedSession.sessionId,
      status: "FAILED",
      linkedPhone: null,
      linkedAt: null,
      linkError: getErrorMessage(error),
    });
    console.error(`BayarLah bot session check failed: ${getErrorMessage(error)}`);
    return null;
  }
}

async function ensurePaymentProofWebhook(sessionId: string) {
  if (
    !paymentProofWebhookUrl ||
    webhookRegisteredSessions.has(sessionId)
  ) {
    return;
  }

  try {
    await ensureOpenWaMessageReceivedWebhook({
      sessionId,
      url: paymentProofWebhookUrl,
    });
    webhookRegisteredSessions.add(sessionId);
    console.log(`Registered OpenWA payment proof webhook for session ${sessionId}.`);
  } catch (error) {
    console.error(
      `Failed to register OpenWA payment proof webhook: ${getErrorMessage(error)}`
    );
  }
}

async function processInboundPaymentProofMessages(
  botSession: ActiveBotSession | null
) {
  if (!botSession) return 0;

  let processed = 0;

  try {
    const messages = await listOpenWaMessages(
      botSession.sessionId,
      inboundMessageLimit
    );

    for (const message of messages) {
      if (classifyWhatsappMessage(message) !== "INBOUND_IMAGE") continue;

      const messageId = getWhatsappMessageId(message);
      if (!messageId) continue;

      const claimed = await claimInboundMessage({
        senderSessionId: botSession.sessionId,
        providerMessageId: messageId,
        source: "POLL",
      });
      if (!claimed) continue;

      try {
        const debtorPhone = getInboundMessagePhone(message);
        const inboundChatId = message.chatId;
        const inboundSenderId = message.from;
        const route = await resolveWhatsappBotInboundRoute(prisma, {
          botSessionId: botSession.sessionId,
          debtorPhone,
          inboundChatId,
          inboundSenderId,
          messageId,
        });

        if (!route) {
          await completeInboundMessage({
            senderSessionId: botSession.sessionId,
            providerMessageId: messageId,
            outcome: "UNMATCHED",
          });
          await sendUnmatchedPaymentProofReply({
            sessionId: botSession.sessionId,
            debtorPhone,
            inboundChatId,
            inboundSenderId,
            messageId,
          });
          processed += 1;
          console.log(
            `Skipped unmatched inbound payment proof ${messageId} from ${
              debtorPhone ?? inboundSenderId ?? inboundChatId ?? "unknown"
            }.`
          );
          continue;
        }

        const media = await downloadOpenWaMessageMedia({
          sessionId: botSession.sessionId,
          messageId,
          mediaUrl: message.mediaUrl ?? message.url,
        });

        const result = await handleInboundPaymentProofImage({
          collectorId: route.collectorId,
          debtorPhone,
          inboundChatId,
          inboundSenderId,
          senderSessionId: botSession.sessionId,
          messageId,
          bytes: media.bytes,
          contentType: message.mimetype ?? message.mimeType ?? media.contentType,
        });

        await completeInboundMessage({
          senderSessionId: botSession.sessionId,
          providerMessageId: messageId,
          outcome: result.decision.status,
        });
        await sendPaymentProofWorkerNotifications({
          botSessionId: botSession.sessionId,
          collector: {
            id: route.collectorId,
            fullName: route.collectorFullName,
            phone: route.collectorPhone,
          },
          debtorPhone: debtorPhone ?? route.debtorPhone,
          inboundChatId,
          inboundSenderId,
          paymentProofId: result.paymentProofId,
          status: result.decision.status,
        });

        processed += 1;
        console.log(
          `Inbound payment proof ${messageId} from ${
            debtorPhone ?? inboundSenderId ?? inboundChatId ?? "unknown"
          }: ${result.decision.status}.`
        );
      } catch (error) {
        await failInboundMessage({
          senderSessionId: botSession.sessionId,
          providerMessageId: messageId,
          error,
        });
        console.error(
          `Failed inbound payment proof ${messageId}: ${getErrorMessage(error)}`
        );
      }
    }
  } catch (error) {
    console.error(
      `Failed inbound payment proof poll for BayarLah bot: ${getErrorMessage(error)}`
    );
  }

  return processed;
}

async function processInboundPaymentProofWebhook(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, status: 400, error: "Invalid webhook payload." };
  }

  const classification = classifyWhatsappMessage(payload);
  if (classification !== "INBOUND_IMAGE") {
    return { ok: true, skipped: classification.toLowerCase() };
  }

  const sessionId = getPayloadString(payload, ["sessionId", "session.id"]);
  if (!sessionId) {
    return { ok: true, skipped: "missing_session_id" };
  }

  const botSession = await getActiveWhatsappBotSession();
  if (!botSession || botSession.sessionId !== sessionId) {
    return { ok: true, skipped: "unknown_session" };
  }

  const debtorPhone = getWebhookDebtorPhone(payload);
  const inboundChatId = getWebhookInboundChatId(payload);
  const inboundSenderId = getWebhookInboundSenderId(payload);

  const messageId = getWhatsappMessageId(payload);
  if (!messageId) {
    return { ok: true, skipped: "missing_message_id" };
  }

  const media = await getWebhookImageMedia(payload);
  if (!media) {
    return {
      ok: true,
      skipped: "no_image_media",
      hint: "OpenWA delivered the webhook without image bytes or an image URL.",
    };
  }

  const claimed = await claimInboundMessage({
    senderSessionId: botSession.sessionId,
    providerMessageId: messageId,
    source: "WEBHOOK",
  });
  if (!claimed) {
    return { ok: true, skipped: "duplicate_message" };
  }

  try {
    const route = await resolveWhatsappBotInboundRoute(prisma, {
      botSessionId: botSession.sessionId,
      debtorPhone,
      inboundChatId,
      inboundSenderId,
      messageId,
    });

    if (!route) {
      await completeInboundMessage({
        senderSessionId: botSession.sessionId,
        providerMessageId: messageId,
        outcome: "UNMATCHED",
      });
      await sendUnmatchedPaymentProofReply({
        sessionId: botSession.sessionId,
        debtorPhone,
        inboundChatId,
        inboundSenderId,
        messageId,
      });

      return { ok: true, skipped: "unmatched_payment_proof" };
    }

    const result = await handleInboundPaymentProofImage({
      collectorId: route.collectorId,
      debtorPhone,
      inboundChatId,
      inboundSenderId,
      senderSessionId: botSession.sessionId,
      messageId,
      bytes: media.bytes,
      contentType: media.contentType,
    });

    await completeInboundMessage({
      senderSessionId: botSession.sessionId,
      providerMessageId: messageId,
      outcome: result.decision.status,
    });
    await sendPaymentProofWorkerNotifications({
      botSessionId: botSession.sessionId,
      collector: {
        id: route.collectorId,
        fullName: route.collectorFullName,
        phone: route.collectorPhone,
      },
      debtorPhone: debtorPhone ?? route.debtorPhone,
      inboundChatId,
      inboundSenderId,
      paymentProofId: result.paymentProofId,
      status: result.decision.status,
    });

    console.log(
      `Inbound payment proof webhook ${messageId} from ${
        debtorPhone ?? inboundSenderId ?? inboundChatId ?? "unknown"
      }: ${result.decision.status}.`
    );

    return {
      ok: true,
      status: result.decision.status,
      paymentProofId: result.paymentProofId,
      reviewReason: result.decision.reviewReason,
    };
  } catch (error) {
    await failInboundMessage({
      senderSessionId: botSession.sessionId,
      providerMessageId: messageId,
      error,
    });
    throw error;
  }
}

async function processDueReminders(botSession: ActiveBotSession | null) {
  const now = new Date();
  const dueShareRows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id"
    FROM "ExpenseShare"
    WHERE "paidAt" IS NULL
      AND "reminderStatus" = 'ACTIVE'::"ReminderStatus"
      AND "nextReminderAt" <= ${now}
      AND "reminderFrequencyValue" IS NOT NULL
      AND "reminderFrequencyUnit" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "PaymentProof" AS pp
        WHERE pp."status" = 'PENDING_REVIEW'::"PaymentProofStatus"
          AND (
            pp."expenseShareId" = "ExpenseShare"."id"
            OR (
              pp."expenseShareId" IS NULL
              AND pp."debtorFriendId" = "ExpenseShare"."friendId"
            )
          )
      )
    ORDER BY "nextReminderAt" ASC
    LIMIT ${maxPerRun}
  `;
  const dueShareIds = dueShareRows.map((share) => share.id);

  if (dueShareIds.length === 0) return 0;
  if (!botSession) {
    console.error("BayarLah bot session is not linked; skipping due reminders.");
    return 0;
  }

  const dueShares = await prisma.expenseShare.findMany({
    where: {
      id: { in: dueShareIds },
    },
    include: {
      friend: {
        select: { name: true, phone: true },
      },
      expense: {
        select: {
          description: true,
          collector: {
            select: {
              id: true,
              phone: true,
              fullName: true,
              duitNowIdType: true,
              duitNowIdValue: true,
              duitNowQrUrl: true,
            },
          },
        },
      },
    },
  });
  const dueShareById = new Map(dueShares.map((share) => [share.id, share]));

  for (const { id } of dueShareRows) {
    const share = dueShareById.get(id);
    if (!share) continue;
    await sendReminder(share, botSession);
  }

  return dueShares.length;
}

async function sendReminder(share: DueShare, botSession: ActiveBotSession) {
  if (!share.reminderFrequencyValue || !share.reminderFrequencyUnit) return;

  const collector = share.expense.collector;
  const qrUrl = collector.duitNowQrUrl ?? "";
  const paymentCode = await ensureExpenseSharePaymentCode(share.id);
  const messageText = buildWhatsAppReminderMessage({
    friendName: share.friend.name,
    collectorName: collector.fullName ?? "Your friend",
    amountLabel: formatMoney(share.owedAmount),
    expenseDescription: share.expense.description,
    duitNowIdType: collector.duitNowIdType,
    duitNowIdValue: collector.duitNowIdValue,
  });
  const paymentCodeMessage = buildPaymentCodeMessage(paymentCode);
  const whatsappChatId = toOpenWaChatId(share.friend.phone);

  const attempt = await prisma.whatsappReminderAttempt.create({
    data: {
      expenseShareId: share.id,
      status: "PENDING",
      recipientPhone: share.friend.phone,
      messageText,
      duitNowQrUrl: qrUrl,
    },
  });
  await prisma.$executeRaw`
    UPDATE "WhatsappReminderAttempt"
    SET
      "senderSessionId" = ${botSession.sessionId},
      "whatsappChatId" = ${whatsappChatId}
    WHERE "id" = ${attempt.id}
  `;

  try {
    if (!qrUrl) {
      throw new Error("Collector DuitNow QR is missing.");
    }

    const providerResult = await sendOpenWaImage({
      sessionId: botSession.sessionId,
      chatId: whatsappChatId,
      imageUrl: qrUrl,
      caption: messageText,
    });
    await sendOpenWaText({
      sessionId: botSession.sessionId,
      chatId: whatsappChatId,
      text: paymentCodeMessage,
    });
    const sentAt = new Date();
    const nextReminderAt = getNextReminderAtFromCadence(
      share.reminderFrequencyValue,
      share.reminderFrequencyUnit,
      sentAt
    );

    const providerMessageId = getProviderMessageId(providerResult);
    const whatsappLidChatId = extractOpenWaSerializedChatId(providerMessageId ?? "");

    await prisma.$transaction(async (tx) => {
      await tx.whatsappReminderAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "SENT",
          providerMessageId,
          sentAt,
          errorMessage: null,
        },
      });
      await tx.$executeRaw`
        UPDATE "WhatsappReminderAttempt"
        SET "whatsappLidChatId" = ${whatsappLidChatId}
        WHERE "id" = ${attempt.id}
      `;
      await tx.expenseShare.update({
        where: { id: share.id },
        data: {
          lastReminderAt: sentAt,
          nextReminderAt,
        },
      });
    });
  } catch (error) {
    await recordFailedAttempt(attempt.id, share.id, error);
    console.error(
      `Failed WhatsApp reminder for ${share.friend.phone}: ${getErrorMessage(error)}`
    );
  }
}

async function ensureExpenseSharePaymentCode(shareId: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const paymentCode = generatePaymentCode();
    const updatedAt = new Date();
    let assigned: { paymentCode: string }[];
    try {
      assigned = await prisma.$queryRaw<{ paymentCode: string }[]>`
        UPDATE "ExpenseShare"
        SET
          "paymentCode" = ${paymentCode},
          "updatedAt" = ${updatedAt}
        WHERE "id" = ${shareId}
          AND "paymentCode" IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM "ExpenseShare" AS existing
            WHERE existing."paymentCode" = ${paymentCode}
          )
        RETURNING "paymentCode"
      `;
    } catch (error) {
      if (isUniqueConstraintError(error)) continue;
      throw error;
    }
    if (assigned[0]?.paymentCode) return assigned[0].paymentCode;

    const existing = await prisma.$queryRaw<{ paymentCode: string | null }[]>`
      SELECT "paymentCode"
      FROM "ExpenseShare"
      WHERE "id" = ${shareId}
      LIMIT 1
    `;
    if (existing[0]?.paymentCode) return existing[0].paymentCode;
    if (existing.length === 0) {
      throw new Error("Expense share not found while assigning a payment code.");
    }
  }

  throw new Error("Could not generate a unique payment code.");
}

async function claimInboundMessage(input: {
  senderSessionId: string;
  providerMessageId: string;
  source: "POLL" | "WEBHOOK";
}) {
  const claimedAt = new Date();
  const staleBefore = new Date(claimedAt.getTime() - 5 * 60_000);
  const rows = await prisma.$queryRaw<{ providerMessageId: string }[]>`
    INSERT INTO "WhatsappInboundMessage" (
      "senderSessionId",
      "providerMessageId",
      "status",
      "source",
      "claimedAt",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${input.senderSessionId},
      ${input.providerMessageId},
      'PROCESSING'::"WhatsappInboundMessageStatus",
      ${input.source},
      ${claimedAt},
      ${claimedAt},
      ${claimedAt}
    )
    ON CONFLICT ("senderSessionId", "providerMessageId") DO UPDATE SET
      "status" = 'PROCESSING'::"WhatsappInboundMessageStatus",
      "source" = EXCLUDED."source",
      "claimedAt" = EXCLUDED."claimedAt",
      "processedAt" = NULL,
      "errorMessage" = NULL,
      "updatedAt" = EXCLUDED."updatedAt"
    WHERE "WhatsappInboundMessage"."status" = 'FAILED'::"WhatsappInboundMessageStatus"
      OR (
        "WhatsappInboundMessage"."status" = 'PROCESSING'::"WhatsappInboundMessageStatus"
        AND "WhatsappInboundMessage"."claimedAt" <= ${staleBefore}
      )
    RETURNING "providerMessageId"
  `;

  return rows.length === 1;
}

async function completeInboundMessage(input: {
  senderSessionId: string;
  providerMessageId: string;
  outcome: string;
}) {
  const processedAt = new Date();
  await prisma.$executeRaw`
    UPDATE "WhatsappInboundMessage"
    SET
      "status" = 'PROCESSED'::"WhatsappInboundMessageStatus",
      "outcome" = ${input.outcome},
      "processedAt" = ${processedAt},
      "errorMessage" = NULL,
      "updatedAt" = ${processedAt}
    WHERE "senderSessionId" = ${input.senderSessionId}
      AND "providerMessageId" = ${input.providerMessageId}
      AND "status" = 'PROCESSING'::"WhatsappInboundMessageStatus"
  `;
}

async function failInboundMessage(input: {
  senderSessionId: string;
  providerMessageId: string;
  error: unknown;
}) {
  const failedAt = new Date();
  await prisma.$executeRaw`
    UPDATE "WhatsappInboundMessage"
    SET
      "status" = 'FAILED'::"WhatsappInboundMessageStatus",
      "errorMessage" = ${getErrorMessage(input.error)},
      "updatedAt" = ${failedAt}
    WHERE "senderSessionId" = ${input.senderSessionId}
      AND "providerMessageId" = ${input.providerMessageId}
      AND "status" = 'PROCESSING'::"WhatsappInboundMessageStatus"
  `;
}

function isUniqueConstraintError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;

  return (
    error.code === "P2002" ||
    (error.code === "P2010" && error.meta?.code === "23505")
  );
}

async function sendPaymentProofWorkerNotifications(input: {
  botSessionId: string;
  collector: {
    id: string;
    fullName: string | null;
    phone: string | null;
  };
  debtorPhone?: string | null;
  inboundChatId?: string | null;
  inboundSenderId?: string | null;
  paymentProofId: string | null;
  status: "PENDING_REVIEW" | "AUTO_CONFIRMED" | "DUPLICATE_REJECTED";
}) {
  if (!input.paymentProofId) return;

  const proof = await prisma.paymentProof.findUnique({
    where: { id: input.paymentProofId },
    include: {
      debtorFriend: { select: { name: true, phone: true } },
      expenseShare: {
        select: {
          owedAmount: true,
          expense: { select: { description: true } },
          friend: { select: { name: true, phone: true } },
        },
      },
    },
  });
  if (!proof) return;

  const debtorName =
    proof.debtorFriend?.name ??
    proof.expenseShare?.friend.name ??
    input.debtorPhone ??
    input.inboundSenderId ??
    input.inboundChatId ??
    "Unknown debtor";
  const debtorPhone =
    proof.debtorFriend?.phone ?? proof.expenseShare?.friend.phone ?? input.debtorPhone;
  const amountLabel =
    proof.expenseShare?.owedAmount ?? proof.parsedAmount
      ? formatMoney(proof.expenseShare?.owedAmount ?? proof.parsedAmount)
      : "the submitted amount";
  const expenseDescription = proof.expenseShare?.expense.description ?? "this debt";

  if (input.status === "AUTO_CONFIRMED") {
    await sendOpenWaTextSafely({
      sessionId: input.botSessionId,
      phone: input.collector.phone,
      text: [
        `BayarLah auto-confirmed ${debtorName}'s payment of ${amountLabel}.`,
        `Debt settled: ${expenseDescription}.`,
      ].join("\n"),
      context: `collector auto-confirm notice for proof ${proof.id}`,
    });

    await sendCollectorReceiptImageSafely({
      botSessionId: input.botSessionId,
      phone: input.collector.phone,
      imageStoragePath: proof.imageStoragePath,
      caption: `Receipt from ${debtorName} — ${amountLabel} for ${expenseDescription}.`,
      context: `collector receipt image for proof ${proof.id}`,
    });

    await sendOpenWaTextSafely({
      sessionId: input.botSessionId,
      phone: debtorPhone,
      text: [
        "Payment confirmed.",
        `You're squared up for ${expenseDescription}.`,
      ].join("\n"),
      context: `debtor auto-confirm notice for proof ${proof.id}`,
    });
  }

  if (input.status === "PENDING_REVIEW") {
    await sendOpenWaTextSafely({
      sessionId: input.botSessionId,
      phone: input.collector.phone,
      text: [
        `BayarLah found a payment proof from ${debtorName} that needs review.`,
        "Open Expenses > Payment reviews to confirm or reject it.",
      ].join("\n"),
      context: `collector pending review notice for proof ${proof.id}`,
    });
  }
}

async function sendOpenWaTextSafely(input: {
  sessionId: string;
  phone: string | null;
  text: string;
  context: string;
}) {
  if (!input.phone) return;

  try {
    await sendOpenWaText({
      sessionId: input.sessionId,
      chatId: toOpenWaChatId(input.phone),
      text: input.text,
    });
  } catch (error) {
    console.error(
      `Failed to send ${input.context}: ${getErrorMessage(error)}`
    );
  }
}

async function sendUnmatchedPaymentProofReply(input: {
  sessionId: string;
  debtorPhone?: string | null;
  inboundChatId?: string | null;
  inboundSenderId?: string | null;
  messageId: string;
}) {
  const chatId =
    input.inboundChatId ??
    input.inboundSenderId ??
    (input.debtorPhone ? toOpenWaChatId(input.debtorPhone) : null);

  await sendOpenWaTextToChatSafely({
    sessionId: input.sessionId,
    chatId,
    text: [
      "BayarLah could not match this receipt to a recent unpaid reminder.",
      "Please send the receipt image in the same chat after receiving a BayarLah reminder.",
    ].join("\n"),
    context: `unmatched payment proof ${input.messageId}`,
  });
}

async function sendCollectorReceiptImageSafely(input: {
  botSessionId: string;
  phone: string | null;
  imageStoragePath: string;
  caption: string;
  context: string;
}) {
  if (!input.phone) return;

  try {
    const supabase = createServerSupabaseClient();
    const { data } = await supabase.storage
      .from("payment-proofs")
      .createSignedUrl(input.imageStoragePath, 60 * 10);
    if (!data?.signedUrl) return;

    await sendOpenWaImage({
      sessionId: input.botSessionId,
      chatId: toOpenWaChatId(input.phone),
      imageUrl: data.signedUrl,
      caption: input.caption,
    });
  } catch (error) {
    console.error(`Failed to send ${input.context}: ${getErrorMessage(error)}`);
  }
}

async function sendOpenWaTextToChatSafely(input: {
  sessionId: string;
  chatId: string | null;
  text: string;
  context: string;
}) {
  if (!input.chatId) return;

  try {
    await sendOpenWaText({
      sessionId: input.sessionId,
      chatId: input.chatId,
      text: input.text,
    });
  } catch (error) {
    console.error(
      `Failed to send ${input.context}: ${getErrorMessage(error)}`
    );
  }
}

async function recordFailedAttempt(
  attemptId: string,
  shareId: string,
  error: unknown
) {
  const failedAt = new Date();

  await prisma.$transaction([
    prisma.whatsappReminderAttempt.update({
      where: { id: attemptId },
      data: {
        status: "FAILED",
        errorMessage: getErrorMessage(error),
      },
    }),
    prisma.expenseShare.update({
      where: { id: shareId },
      data: {
        nextReminderAt: getRetryReminderAt(failedAt, retryDelayMs),
      },
    }),
  ]);
}

function getProviderMessageId(value: unknown) {
  if (typeof value === "string" && value) return value;
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const id = record.id ?? record.messageId ?? record._serialized;
  return typeof id === "string" && id ? id : null;
}

function extractOpenWaSerializedChatId(value: string) {
  const match = value.match(/(?:true|false)_([^_]+@(?:lid|c\.us))/i);
  return match?.[1] ?? null;
}

function getInboundMessagePhone(message: OpenWaInboundMessage) {
  const chatId = message.from ?? message.chatId ?? "";
  if (chatId.includes("@lid")) return null;
  const digits = chatId.split("@")[0]?.replace(/\D/g, "") ?? "";

  if (!digits) return null;
  return `+${digits}`;
}

function getWebhookDebtorPhone(payload: object) {
  const value = getPayloadString(payload, [
    "data.from",
    "data.message.from",
    "data.chatId",
    "data.message.chatId",
    "from",
    "message.from",
    "chatId",
    "message.chatId",
  ]);
  if (!value || value.includes("@lid")) return null;
  const digits = value?.split("@")[0]?.replace(/\D/g, "") ?? "";

  return digits ? `+${digits}` : null;
}

function getWebhookInboundChatId(payload: object) {
  return getPayloadString(payload, [
    "data.chatId",
    "data.message.chatId",
    "chatId",
    "message.chatId",
  ]);
}

function getWebhookInboundSenderId(payload: object) {
  return getPayloadString(payload, [
    "data.from",
    "data.message.from",
    "from",
    "message.from",
  ]);
}

async function getWebhookImageMedia(payload: object) {
  const media = findImageMedia(payload);
  if (!media) return null;

  if (media.base64) {
    const base64 = media.base64.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "");
    return {
      bytes: Buffer.from(base64, "base64"),
      contentType: media.contentType ?? "image/jpeg",
    };
  }

  if (media.url) {
    const response = await fetch(media.url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`OpenWA webhook media download returned ${response.status}.`);
    }

    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") || media.contentType || "image/jpeg",
    };
  }

  return null;
}

function findImageMedia(value: unknown): {
  base64?: string;
  url?: string;
  contentType?: string;
} | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const contentType =
    getRecordString(record, "mimetype") ??
    getRecordString(record, "mimeType") ??
    getRecordString(record, "contentType");
  const isImage =
    contentType?.toLowerCase().startsWith("image/") ||
    getRecordString(record, "type")?.toLowerCase() === "image";
  const base64 = getRecordString(record, "base64") ?? getRecordString(record, "data");
  const url =
    getRecordString(record, "mediaUrl") ??
    getRecordString(record, "url") ??
    getRecordString(record, "downloadUrl");

  if (isImage && (base64 || url)) {
    return {
      ...(base64 ? { base64 } : {}),
      ...(url ? { url } : {}),
      ...(contentType ? { contentType } : {}),
    };
  }

  for (const item of Object.values(record)) {
    const nested = findImageMedia(item);
    if (nested) return nested;
  }

  return null;
}

function getPayloadString(payload: object, paths: string[]) {
  for (const path of paths) {
    const value = getPayloadValue(payload, [path]);
    if (typeof value === "string" && value.trim()) return value;
  }

  return null;
}

function getPayloadValue(payload: object, paths: string[]) {
  for (const path of paths) {
    let value: unknown = payload;
    for (const key of path.split(".")) {
      if (!value || typeof value !== "object") {
        value = undefined;
        break;
      }
      value = (value as Record<string, unknown>)[key];
    }
    if (value !== undefined && value !== null) return value;
  }

  return null;
}

function getRecordString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function startWebhookServer() {
  if (!webhookPort || webhookServer) return;

  webhookServer = createServer((request, response) => {
    void handleWebhookRequest(request, response);
  });
  webhookServer.listen(webhookPort, "0.0.0.0", () => {
    console.log(`WhatsApp payment proof webhook listening on port ${webhookPort}.`);
  });
}

async function handleWebhookRequest(
  request: IncomingMessage,
  response: ServerResponse
) {
  if (request.method === "GET" && request.url === "/health") {
    writeJson(response, shuttingDown ? 503 : 200, {
      ok: !shuttingDown,
      service: "bayarlah-whatsapp-worker",
      uptimeSeconds: Math.floor(process.uptime()),
    });
    return;
  }

  if (request.method !== "POST" || request.url !== "/openwa/payment-proof-webhook") {
    writeJson(response, 404, { error: "Not found." });
    return;
  }

  try {
    const payload = JSON.parse(await readRequestBody(request)) as unknown;
    const result = await processInboundPaymentProofWebhook(payload);
    const httpStatus =
      "status" in result && typeof result.status === "number" ? result.status : 200;
    writeJson(response, httpStatus, result);
  } catch (error) {
    console.error(`Failed payment proof webhook: ${getErrorMessage(error)}`);
    writeJson(response, 500, { error: getErrorMessage(error) });
  }
}

function readRequestBody(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) {
        reject(new Error("Webhook payload is too large."));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function writeJson(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

function getPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getOptionalPositiveInteger(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function getBoolean(value: string | undefined, fallback: boolean) {
  if (!value) return fallback;

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown WhatsApp worker error.";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  webhookServer?.close();
  await prisma.$disconnect();
}

process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});

void main().catch(async (error) => {
  console.error(getErrorMessage(error));
  await shutdown();
  process.exit(1);
});
