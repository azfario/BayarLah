import { PrismaClient, type Prisma } from "@prisma/client";
import { formatMoney } from "../../lib/money.js";
import {
  getOpenWaLinkedPhone,
  isOpenWaSessionConnected,
  openWaPhonesMatch,
  recoverOpenWaSession,
  sendOpenWaImage,
} from "../../lib/openwa.js";
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
const logEmptyPolls = getBoolean(process.env.WHATSAPP_LOG_EMPTY_POLLS, false);
const runOnce =
  process.env.WHATSAPP_WORKER_RUN_ONCE === "true" ||
  process.argv.includes("--once");

let shuttingDown = false;

async function main() {
  console.log("Starting BayarLah WhatsApp reminder poller.");

  do {
    const processed = await processDueReminders();
    if (processed > 0) {
      console.log(`Processed ${processed} due WhatsApp reminder(s).`);
    } else if (runOnce || logEmptyPolls) {
      console.log("No due WhatsApp reminders found.");
    }

    if (runOnce) break;
    await sleep(pollIntervalMs);
  } while (!shuttingDown);

  await shutdown();
}

async function processDueReminders() {
  const now = new Date();
  const dueShares = await prisma.expenseShare.findMany({
    where: {
      reminderStatus: "ACTIVE",
      nextReminderAt: { lte: now },
      reminderFrequencyValue: { not: null },
      reminderFrequencyUnit: { not: null },
    },
    orderBy: { nextReminderAt: "asc" },
    take: maxPerRun,
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

  for (const share of dueShares) {
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

  const attempt = await prisma.whatsappReminderAttempt.create({
    data: {
      expenseShareId: share.id,
      status: "PENDING",
      recipientPhone: share.friend.phone,
      messageText,
      duitNowQrUrl: qrUrl,
    },
  });

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
      chatId: toOpenWaChatId(share.friend.phone),
      imageUrl: qrUrl,
      caption: messageText,
    });
    const sentAt = new Date();
    const nextReminderAt = getNextReminderAtFromCadence(
      share.reminderFrequencyValue,
      share.reminderFrequencyUnit,
      sentAt
    );

    await prisma.$transaction([
      prisma.whatsappReminderAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "SENT",
          providerMessageId: getProviderMessageId(providerResult),
          sentAt,
          errorMessage: null,
        },
      }),
      prisma.expenseShare.update({
        where: { id: share.id },
        data: {
          lastReminderAt: sentAt,
          nextReminderAt,
        },
      }),
    ]);
  } catch (error) {
    await recordFailedAttempt(attempt.id, share.id, error);
    console.error(
      `Failed WhatsApp reminder for ${share.friend.phone}: ${getErrorMessage(error)}`
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

function getPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
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
