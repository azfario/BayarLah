import { Buffer } from "node:buffer";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Prisma, PrismaClient } from "@prisma/client";
import { formatMoney } from "../../lib/money.js";
import {
  downloadOpenWaMessageMedia,
  getOpenWaLinkedPhone,
  type OpenWaInboundMessage,
  isOpenWaSessionConnected,
  listOpenWaMessages,
  openWaPhonesMatch,
  recoverOpenWaSession,
  sendOpenWaImage,
  sendOpenWaText,
} from "../../lib/openwa.js";
import { handleInboundPaymentProofImage } from "../../lib/payment-proof-inbound.js";
import {
  buildWhatsAppReminderMessage,
  getNextReminderAtFromCadence,
  getRetryReminderAt,
  toOpenWaChatId,
} from "../../lib/whatsapp.js";

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
            whatsappLinkStatus: true;
            whatsappSessionId: true;
          };
        };
      };
    };
  };
}>;

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
const logEmptyPolls = getBoolean(process.env.WHATSAPP_LOG_EMPTY_POLLS, false);
const runOnce =
  process.env.WHATSAPP_WORKER_RUN_ONCE === "true" ||
  process.argv.includes("--once");

let shuttingDown = false;
const processedInboundMessageIds = new Set<string>();
let webhookServer: ReturnType<typeof createServer> | null = null;

async function main() {
  console.log("Starting BayarLah WhatsApp reminder poller.");
  startWebhookServer();

  do {
    const inboundProcessed = await processInboundPaymentProofMessages();
    const processed = await processDueReminders();
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

async function processInboundPaymentProofMessages() {
  const collectors = await prisma.user.findMany({
    where: {
      whatsappLinkStatus: "LINKED",
      whatsappSessionId: { not: null },
    },
    select: {
      id: true,
      fullName: true,
      phone: true,
      whatsappSessionId: true,
    },
  });
  let processed = 0;

  for (const collector of collectors) {
    if (!collector.whatsappSessionId) continue;

    try {
      const messages = await listOpenWaMessages(
        collector.whatsappSessionId,
        inboundMessageLimit
      );

      for (const message of messages) {
        if (!isInboundImageMessage(message)) continue;

        const messageId = getInboundMessageId(message);
        if (!messageId || processedInboundMessageIds.has(messageId)) continue;

        processedInboundMessageIds.add(messageId);
        const media = await downloadOpenWaMessageMedia({
          sessionId: collector.whatsappSessionId,
          messageId,
          mediaUrl: message.mediaUrl ?? message.url,
        });

        const result = await handleInboundPaymentProofImage({
          collectorId: collector.id,
          debtorPhone: getInboundMessagePhone(message),
          inboundChatId: message.chatId,
          inboundSenderId: message.from,
          messageId,
          bytes: media.bytes,
          contentType: message.mimetype ?? message.mimeType ?? media.contentType,
        });

        await sendPaymentProofWorkerNotifications({
          collector,
          debtorPhone: getInboundMessagePhone(message),
          inboundChatId: message.chatId,
          inboundSenderId: message.from,
          paymentProofId: result.paymentProofId,
          status: result.decision.status,
        });

        processed += 1;
        console.log(
          `Inbound payment proof ${messageId} from ${
            getInboundMessagePhone(message) ?? message.from ?? message.chatId ?? "unknown"
          }: ${result.decision.status}.`
        );
      }
    } catch (error) {
      console.error(
        `Failed inbound payment proof poll for collector ${collector.id}: ${getErrorMessage(
          error
        )}`
      );
    }
  }

  return processed;
}

async function processInboundPaymentProofWebhook(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, status: 400, error: "Invalid webhook payload." };
  }

  if (isOutgoingWebhookPayload(payload)) {
    return { ok: true, skipped: "outgoing_message" };
  }

  const sessionId = getPayloadString(payload, ["sessionId", "session.id"]);
  if (!sessionId) {
    return { ok: true, skipped: "missing_session_id" };
  }

  const collector = await prisma.user.findFirst({
    where: {
      whatsappSessionId: sessionId,
      whatsappLinkStatus: "LINKED",
    },
    select: {
      id: true,
      fullName: true,
      phone: true,
      whatsappSessionId: true,
    },
  });
  if (!collector) {
    return { ok: true, skipped: "unknown_session" };
  }

  const debtorPhone = getWebhookDebtorPhone(payload);
  const inboundChatId = getWebhookInboundChatId(payload);
  const inboundSenderId = getWebhookInboundSenderId(payload);

  const media = await getWebhookImageMedia(payload);
  if (!media) {
    return {
      ok: true,
      skipped: "no_image_media",
      hint: "OpenWA delivered the webhook without image bytes or an image URL.",
    };
  }

  const messageId =
    getPayloadString(payload, [
      "data.id",
      "data.messageId",
      "data._serialized",
      "data.waMessageId",
      "data.message.id",
      "message.id",
      "messageId",
      "id",
      "waMessageId",
      "message.waMessageId",
    ]) ?? `${sessionId}-${Date.now()}`;

  const result = await handleInboundPaymentProofImage({
    collectorId: collector.id,
    debtorPhone,
    inboundChatId,
    inboundSenderId,
    messageId,
    bytes: media.bytes,
    contentType: media.contentType,
  });

  await sendPaymentProofWorkerNotifications({
    collector,
    debtorPhone,
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
}

async function processDueReminders() {
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
              whatsappLinkStatus: true,
              whatsappSessionId: true,
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
    await sendReminder(share);
  }

  return dueShares.length;
}

async function sendReminder(share: DueShare) {
  if (!share.reminderFrequencyValue || !share.reminderFrequencyUnit) return;

  const collector = share.expense.collector;
  const qrUrl = collector.duitNowQrUrl ?? "";
  const messageText = buildWhatsAppReminderMessage({
    friendName: share.friend.name,
    collectorName: collector.fullName ?? "Your friend",
    amountLabel: formatMoney(share.owedAmount),
    expenseDescription: share.expense.description,
    duitNowIdType: collector.duitNowIdType,
    duitNowIdValue: collector.duitNowIdValue,
  });
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
    SET "whatsappChatId" = ${whatsappChatId}
    WHERE "id" = ${attempt.id}
  `;

  try {
    if (!qrUrl) {
      throw new Error("Collector DuitNow QR is missing.");
    }

    if (!collector.whatsappSessionId) {
      throw new Error("Collector WhatsApp is not linked.");
    }

    const session = await recoverOpenWaSession(collector.whatsappSessionId);
    if (!isOpenWaSessionConnected(session)) {
      throw new Error("Collector OpenWA session is not connected.");
    }

    const linkedPhone = getOpenWaLinkedPhone(session);
    if (!openWaPhonesMatch(collector.phone, linkedPhone)) {
      throw new Error(
        `Linked WhatsApp phone ${
          linkedPhone ?? "unknown"
        } does not match collector phone ${collector.phone ?? "unknown"}.`
      );
    }

    if (collector.whatsappLinkStatus !== "LINKED") {
      await markCollectorSessionLinked(
        collector.id,
        collector.whatsappSessionId,
        linkedPhone
      );
    }

    const providerResult = await sendOpenWaImage({
      sessionId: collector.whatsappSessionId,
      chatId: whatsappChatId,
      imageUrl: qrUrl,
      caption: messageText,
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

async function sendPaymentProofWorkerNotifications(input: {
  collector: {
    id: string;
    fullName: string | null;
    phone: string | null;
    whatsappSessionId: string | null;
  };
  debtorPhone?: string | null;
  inboundChatId?: string | null;
  inboundSenderId?: string | null;
  paymentProofId: string | null;
  status: "PENDING_REVIEW" | "AUTO_CONFIRMED" | "DUPLICATE_REJECTED";
}) {
  if (!input.collector.whatsappSessionId || !input.paymentProofId) return;

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
      sessionId: input.collector.whatsappSessionId,
      phone: input.collector.phone,
      text: [
        `BayarLah auto-confirmed ${debtorName}'s payment of ${amountLabel}.`,
        `Debt settled: ${expenseDescription}.`,
      ].join("\n"),
      context: `collector auto-confirm notice for proof ${proof.id}`,
    });

    await sendOpenWaTextSafely({
      sessionId: input.collector.whatsappSessionId,
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
      sessionId: input.collector.whatsappSessionId,
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

async function markCollectorSessionLinked(
  userId: string,
  sessionId: string,
  linkedPhone: string | null
) {
  const linkedAt = new Date();

  await prisma.user.updateMany({
    where: { id: userId, whatsappSessionId: sessionId },
    data: {
      whatsappLinkStatus: "LINKED",
      whatsappLinkedPhone: linkedPhone,
      whatsappLinkedAt: linkedAt,
      whatsappLinkError: null,
      profileCompletedAt: linkedAt,
    },
  });
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

function isInboundImageMessage(message: OpenWaInboundMessage) {
  if (message.fromMe) return false;
  if ((message.direction ?? "").toLowerCase() === "outgoing") return false;

  const type = (message.type ?? "").toLowerCase();
  const mimeType = (message.mimetype ?? message.mimeType ?? "").toLowerCase();

  return (
    message.hasMedia === true ||
    type === "image" ||
    mimeType.startsWith("image/")
  );
}

function getInboundMessageId(message: OpenWaInboundMessage) {
  return message.id ?? message.messageId ?? message._serialized ?? null;
}

function getInboundMessagePhone(message: OpenWaInboundMessage) {
  const chatId = message.from ?? message.chatId ?? "";
  if (chatId.includes("@lid")) return null;
  const digits = chatId.split("@")[0]?.replace(/\D/g, "") ?? "";

  if (!digits) return null;
  return `+${digits}`;
}

function isOutgoingWebhookPayload(payload: object) {
  const direction = getPayloadString(payload, [
    "direction",
    "message.direction",
    "data.direction",
    "data.message.direction",
  ]);
  const fromMe = getPayloadValue(payload, [
    "fromMe",
    "message.fromMe",
    "data.fromMe",
    "data.message.fromMe",
  ]);

  return direction?.toLowerCase() === "outgoing" || fromMe === true;
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
