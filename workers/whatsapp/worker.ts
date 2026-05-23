import { Buffer } from "node:buffer";
import { mkdir } from "node:fs/promises";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { PrismaClient, type Prisma } from "@prisma/client";
import { create, ev } from "@open-wa/wa-automate";
import { formatMoney } from "../../lib/money.js";
import {
  buildWhatsAppReminderMessage,
  getNextReminderAtFromCadence,
  getRetryReminderAt,
  toOpenWaChatId,
} from "../../lib/whatsapp.js";

type WhatsAppLinkStatusValue =
  | "NOT_LINKED"
  | "LINKING"
  | "LINKED"
  | "FAILED";

type OpenWaClient = {
  sendImage(
    chatId: string,
    imageDataUrl: string,
    filename: string,
    caption: string
  ): Promise<unknown>;
  getMe?: () => Promise<unknown>;
  onLogout?: (fn: (loggedOut?: boolean) => unknown) => Promise<boolean>;
  kill?: (reason?: string) => Promise<boolean | void> | boolean | void;
};

type ManagedSession = {
  userId: string;
  sessionId: string;
  expectedPhone: string;
  status: WhatsAppLinkStatusValue;
  qrImageDataUrl: string | null;
  linkedPhone: string | null;
  errorMessage: string | null;
  updatedAt: Date;
  client: OpenWaClient | null;
  clientPromise: Promise<OpenWaClient> | null;
};

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
const chromeExecutablePath =
  process.env.WHATSAPP_CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
const headless = getBoolean(process.env.WHATSAPP_HEADLESS, true);
const ezqr = getBoolean(process.env.WHATSAPP_EZQR, false);
const logEmptyPolls = getBoolean(process.env.WHATSAPP_LOG_EMPTY_POLLS, false);
const apiPort = getPositiveInteger(process.env.WHATSAPP_WORKER_API_PORT, 3010);
const apiToken = process.env.WHATSAPP_WORKER_API_TOKEN ?? "";
const sessionDataPath = process.env.WHATSAPP_SESSION_DATA_PATH ?? "sessions";
const runOnce =
  process.env.WHATSAPP_WORKER_RUN_ONCE === "true" ||
  process.argv.includes("--once");

const sessions = new Map<string, ManagedSession>();
let apiServer: http.Server | null = null;
let shuttingDown = false;

async function main() {
  console.log("Starting BayarLah WhatsApp worker.");
  console.log(`Session data path: ${sessionDataPath}`);

  if (chromeExecutablePath) {
    console.log(`Using browser executable at ${chromeExecutablePath}.`);
  }

  await mkdir(sessionDataPath, { recursive: true });
  installQrListener();
  await startApiServer();

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

function installQrListener() {
  ev.on("qr.**", (data: unknown, sessionId: string) => {
    if (typeof data !== "string" || !data.startsWith("data:image/")) return;

    const session = sessions.get(sessionId);
    if (!session) return;

    updateSession(session, {
      status: "LINKING",
      qrImageDataUrl: data,
      errorMessage: null,
    });
  });
}

async function startApiServer() {
  apiServer = http.createServer((request, response) => {
    void handleApiRequest(request, response);
  });

  await new Promise<void>((resolve) => {
    apiServer?.listen(apiPort, resolve);
  });

  console.log(`WhatsApp worker API listening on port ${apiPort}.`);
}

async function handleApiRequest(
  request: IncomingMessage,
  response: ServerResponse
) {
  try {
    const method = request.method ?? "GET";
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

    if (method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, {
        ok: true,
        sessions: sessions.size,
      });
      return;
    }

    if (!isAuthorized(request)) {
      sendJson(response, 401, { error: "Unauthorized." });
      return;
    }

    if (method === "POST" && url.pathname === "/sessions/start") {
      const body = await readJsonBody(request);
      const userId = getStringProperty(body, "userId");
      const sessionId = getStringProperty(body, "sessionId");
      const expectedPhone = getStringProperty(body, "expectedPhone");

      if (!userId || !sessionId || !expectedPhone) {
        sendJson(response, 400, { error: "Missing session start fields." });
        return;
      }

      const session = startSession({
        userId,
        sessionId,
        expectedPhone,
        markLinkingInDb: true,
      });

      sendJson(response, 202, serializeSession(session));
      return;
    }

    const statusMatch = url.pathname.match(/^\/sessions\/([^/]+)\/status$/);
    if (method === "GET" && statusMatch) {
      const sessionId = decodeURIComponent(statusMatch[1]);
      sendJson(response, 200, await getSessionStatus(sessionId));
      return;
    }

    sendJson(response, 404, { error: "Not found." });
  } catch (error) {
    sendJson(response, 500, { error: getErrorMessage(error) });
  }
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

    if (collector.whatsappLinkStatus !== "LINKED" || !collector.whatsappSessionId) {
      throw new Error("Collector WhatsApp is not linked.");
    }

    const whatsapp = await getReadyClient({
      userId: collector.id,
      sessionId: collector.whatsappSessionId,
      expectedPhone: collector.phone ?? "",
    });

    const chatId = toOpenWaChatId(share.friend.phone);
    const qrImageDataUrl = await fetchImageAsDataUrl(qrUrl);
    const providerResult = await whatsapp.sendImage(
      chatId,
      qrImageDataUrl,
      "duitnow-qr.jpg",
      messageText
    );
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

function startSession(input: {
  userId: string;
  sessionId: string;
  expectedPhone: string;
  markLinkingInDb: boolean;
}) {
  const existing = sessions.get(input.sessionId);
  if (existing?.client || existing?.clientPromise) {
    existing.userId = input.userId;
    existing.expectedPhone = input.expectedPhone;
    return existing;
  }

  const session: ManagedSession =
    existing ??
    {
      userId: input.userId,
      sessionId: input.sessionId,
      expectedPhone: input.expectedPhone,
      status: "LINKING",
      qrImageDataUrl: null,
      linkedPhone: null,
      errorMessage: null,
      updatedAt: new Date(),
      client: null,
      clientPromise: null,
    };

  sessions.set(input.sessionId, session);
  updateSession(session, {
    userId: input.userId,
    expectedPhone: input.expectedPhone,
    status: "LINKING",
    errorMessage: null,
  });

  if (input.markLinkingInDb) {
    void prisma.user
      .updateMany({
        where: { id: input.userId, whatsappSessionId: input.sessionId },
        data: {
          whatsappLinkStatus: "LINKING",
          whatsappLinkError: null,
          whatsappLinkedAt: null,
          whatsappLinkedPhone: null,
          profileCompletedAt: null,
        },
      })
      .catch((error) => console.error(getErrorMessage(error)));
  }

  session.clientPromise = createOpenWaClient(session)
    .then(async (client) => {
      const linkedPhone = await getLinkedPhone(client);
      if (!phonesMatch(input.expectedPhone, linkedPhone)) {
        await client.kill?.("PHONE_MISMATCH");
        throw new Error(
          `Linked WhatsApp phone ${linkedPhone} does not match profile phone ${input.expectedPhone}.`
        );
      }

      updateSession(session, {
        status: "LINKED",
        qrImageDataUrl: null,
        linkedPhone,
        errorMessage: null,
        client,
      });

      await client.onLogout?.(() => {
        updateSession(session, {
          status: "NOT_LINKED",
          errorMessage: "WhatsApp session logged out.",
          client: null,
          clientPromise: null,
        });

        void prisma.user
          .updateMany({
            where: { id: input.userId, whatsappSessionId: input.sessionId },
            data: {
              whatsappLinkStatus: "NOT_LINKED",
              whatsappLinkError: "WhatsApp session logged out.",
              whatsappLinkedAt: null,
              profileCompletedAt: null,
            },
          })
          .catch((error) => console.error(getErrorMessage(error)));
      });

      await prisma.user.updateMany({
        where: { id: input.userId, whatsappSessionId: input.sessionId },
        data: {
          whatsappLinkStatus: "LINKED",
          whatsappLinkedPhone: linkedPhone,
          whatsappLinkedAt: new Date(),
          whatsappLinkError: null,
          profileCompletedAt: new Date(),
        },
      });

      console.log(`WhatsApp linked for session ${input.sessionId}.`);
      return client;
    })
    .catch(async (error) => {
      updateSession(session, {
        status: "FAILED",
        errorMessage: getErrorMessage(error),
        client: null,
        clientPromise: null,
      });

      await prisma.user.updateMany({
        where: { id: input.userId, whatsappSessionId: input.sessionId },
        data: {
          whatsappLinkStatus: "FAILED",
          whatsappLinkError: getErrorMessage(error),
          whatsappLinkedAt: null,
          profileCompletedAt: null,
        },
      });

      throw error;
    });
  void session.clientPromise.catch(() => undefined);

  return session;
}

async function createOpenWaClient(session: ManagedSession) {
  return (await create({
    sessionId: session.sessionId,
    sessionDataPath,
    multiDevice: true,
    headless,
    qrTimeout: 0,
    authTimeout: 0,
    executablePath: chromeExecutablePath || undefined,
    useChrome: !chromeExecutablePath,
    chromiumArgs: ["--no-sandbox", "--disable-setuid-sandbox"],
    ezqr,
    qrLogSkip: true,
    disableSpins: true,
    logConsoleErrors: true,
  })) as unknown as OpenWaClient;
}

async function getReadyClient(input: {
  userId: string;
  sessionId: string;
  expectedPhone: string;
}) {
  const session = startSession({ ...input, markLinkingInDb: false });
  if (session.client) return session.client;
  if (!session.clientPromise) {
    throw new Error("WhatsApp session is not ready.");
  }

  return session.clientPromise;
}

async function getSessionStatus(sessionId: string) {
  const session = sessions.get(sessionId);
  if (session) return serializeSession(session);

  const user = await prisma.user.findUnique({
    where: { whatsappSessionId: sessionId },
    select: {
      whatsappLinkStatus: true,
      whatsappSessionId: true,
      whatsappLinkedPhone: true,
      whatsappLinkedAt: true,
      whatsappLinkError: true,
    },
  });

  return {
    status: user?.whatsappLinkStatus ?? "NOT_LINKED",
    sessionId: user?.whatsappSessionId ?? sessionId,
    qrImageDataUrl: null,
    linkedPhone: user?.whatsappLinkedPhone ?? null,
    errorMessage: user?.whatsappLinkError ?? null,
    updatedAt: user?.whatsappLinkedAt?.toISOString() ?? null,
  };
}

function serializeSession(session: ManagedSession) {
  return {
    status: session.status,
    sessionId: session.sessionId,
    qrImageDataUrl: session.qrImageDataUrl,
    linkedPhone: session.linkedPhone,
    errorMessage: session.errorMessage,
    updatedAt: session.updatedAt.toISOString(),
  };
}

function updateSession(
  session: ManagedSession,
  changes: Partial<Omit<ManagedSession, "sessionId" | "updatedAt">>
) {
  Object.assign(session, changes, { updatedAt: new Date() });
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

async function fetchImageAsDataUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to fetch DuitNow QR image (${response.status}).`);
  }

  const contentType =
    response.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  const bytes = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${bytes.toString("base64")}`;
}

async function getLinkedPhone(client: OpenWaClient) {
  const me = await client.getMe?.().catch(() => null);
  const candidates = getPhoneCandidates(me);
  const digits = candidates.map(getDigits).find(Boolean);
  return digits ? `+${digits}` : null;
}

function getPhoneCandidates(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const id =
    record.id && typeof record.id === "object"
      ? (record.id as Record<string, unknown>)
      : null;

  return [
    record.phone,
    record.me,
    record.wid,
    record._serialized,
    id?.user,
    id?._serialized,
  ].filter((candidate): candidate is string => typeof candidate === "string");
}

function phonesMatch(expectedPhone: string, linkedPhone: string | null) {
  const expectedDigits = getDigits(expectedPhone);
  const linkedDigits = getDigits(linkedPhone ?? "");

  if (!expectedDigits || !linkedDigits) return true;
  return expectedDigits === linkedDigits;
}

function getDigits(value: string) {
  return value.replace(/\D/g, "");
}

function getProviderMessageId(value: unknown) {
  if (typeof value === "string" && value) return value;
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const id = record.id ?? record.messageId ?? record._serialized;
  return typeof id === "string" && id ? id : null;
}

function isAuthorized(request: IncomingMessage) {
  if (!apiToken) return false;
  return request.headers.authorization === `Bearer ${apiToken}`;
}

async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const text = Buffer.concat(chunks).toString("utf8");
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

function getStringProperty(value: Record<string, unknown>, key: string) {
  const field = value[key];
  return typeof field === "string" ? field.trim() : "";
}

function sendJson(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
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

  apiServer?.close();

  await Promise.all(
    Array.from(sessions.values()).map(async (session) => {
      await session.client?.kill?.("WORKER_SHUTDOWN");
    })
  );

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
