import { Prisma } from "@prisma/client";

export type WhatsappBotStatus = "NOT_LINKED" | "LINKING" | "LINKED" | "FAILED";

export type WhatsappBotSessionRecord = {
  id: string;
  sessionId: string | null;
  status: WhatsappBotStatus;
  linkedPhone: string | null;
  linkedAt: Date | null;
  linkError: string | null;
  updatedAt: Date | null;
};

export type WhatsappBotInboundRoute = {
  collectorId: string;
  collectorFullName: string | null;
  collectorPhone: string | null;
  debtorPhone: string | null;
};

export type WhatsappBotRouteCandidate = WhatsappBotInboundRoute & {
  senderSessionId: string | null;
  status: string;
  paidAt: Date | null;
  createdAt: Date;
};

type RawDb = {
  $queryRaw<T = unknown>(
    query: TemplateStringsArray | Prisma.Sql,
    ...values: unknown[]
  ): Promise<T>;
  $executeRaw(
    query: TemplateStringsArray | Prisma.Sql,
    ...values: unknown[]
  ): Promise<number>;
};

export const WHATSAPP_BOT_SESSION_ID = "default";
export const DEFAULT_WHATSAPP_BOT_SESSION_NAME = "bayarlah-bot";

export function getWhatsappBotSessionName() {
  return (
    process.env.BAYARLAH_BOT_SESSION_NAME?.trim() ||
    DEFAULT_WHATSAPP_BOT_SESSION_NAME
  );
}

export function parseWhatsappBotAdminEmails(value: string | undefined) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isWhatsappBotAdminEmail(
  email: string | null | undefined,
  configuredEmails = process.env.BAYARLAH_BOT_ADMIN_EMAILS
) {
  if (!email) return false;
  return parseWhatsappBotAdminEmails(configuredEmails).has(email.toLowerCase());
}

export async function getWhatsappBotSession(db: RawDb) {
  const rows = await db.$queryRaw<WhatsappBotSessionRecord[]>`
    SELECT
      "id",
      "sessionId",
      "status"::text AS "status",
      "linkedPhone",
      "linkedAt",
      "linkError",
      "updatedAt"
    FROM "WhatsappBotSession"
    WHERE "id" = ${WHATSAPP_BOT_SESSION_ID}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function getLinkedWhatsappBotSession(db: RawDb) {
  const session = await getWhatsappBotSession(db);
  if (session?.status !== "LINKED" || !session.sessionId) return null;
  return session;
}

export async function upsertWhatsappBotSession(
  db: RawDb,
  input: {
    sessionId: string | null;
    status: WhatsappBotStatus;
    linkedPhone?: string | null;
    linkedAt?: Date | null;
    linkError?: string | null;
  }
) {
  const now = new Date();

  await db.$executeRaw`
    INSERT INTO "WhatsappBotSession" (
      "id",
      "sessionId",
      "status",
      "linkedPhone",
      "linkedAt",
      "linkError",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${WHATSAPP_BOT_SESSION_ID},
      ${input.sessionId},
      ${input.status}::"WhatsappLinkStatus",
      ${input.linkedPhone ?? null},
      ${input.linkedAt ?? null},
      ${input.linkError ?? null},
      ${now},
      ${now}
    )
    ON CONFLICT ("id") DO UPDATE SET
      "sessionId" = EXCLUDED."sessionId",
      "status" = EXCLUDED."status",
      "linkedPhone" = EXCLUDED."linkedPhone",
      "linkedAt" = EXCLUDED."linkedAt",
      "linkError" = EXCLUDED."linkError",
      "updatedAt" = EXCLUDED."updatedAt"
  `;
}

export async function updateWhatsappBotSessionStatus(
  db: RawDb,
  input: {
    sessionId: string;
    status: WhatsappBotStatus;
    linkedPhone?: string | null;
    linkedAt?: Date | null;
    linkError?: string | null;
  }
) {
  const now = new Date();

  await db.$executeRaw`
    UPDATE "WhatsappBotSession"
    SET
      "status" = ${input.status}::"WhatsappLinkStatus",
      "linkedPhone" = ${input.linkedPhone ?? null},
      "linkedAt" = ${input.linkedAt ?? null},
      "linkError" = ${input.linkError ?? null},
      "updatedAt" = ${now}
    WHERE "id" = ${WHATSAPP_BOT_SESSION_ID}
      AND "sessionId" = ${input.sessionId}
  `;
}

export async function resolveWhatsappBotInboundRoute(
  db: RawDb,
  input: {
    botSessionId: string;
    debtorPhone?: string | null;
    inboundChatId?: string | null;
    inboundSenderId?: string | null;
    messageId?: string | null;
  }
) {
  const identityKeys = getInboundIdentityKeys([
    input.debtorPhone ? toOpenWaChatId(input.debtorPhone) : null,
    input.inboundChatId,
    input.inboundSenderId,
    input.messageId,
  ]);

  if (identityKeys.length === 0) return null;

  const rows = await db.$queryRaw<WhatsappBotRouteCandidate[]>`
    SELECT
      e."collectorId",
      u."fullName" AS "collectorFullName",
      u."phone" AS "collectorPhone",
      f."phone" AS "debtorPhone",
      wra."senderSessionId",
      wra."status"::text AS "status",
      es."paidAt",
      wra."createdAt"
    FROM "WhatsappReminderAttempt" AS wra
    JOIN "ExpenseShare" AS es
      ON es."id" = wra."expenseShareId"
    JOIN "Expense" AS e
      ON e."id" = es."expenseId"
    JOIN "User" AS u
      ON u."id" = e."collectorId"
    JOIN "Friend" AS f
      ON f."id" = es."friendId"
    WHERE (
      wra."whatsappChatId" IN (${Prisma.join(identityKeys)})
      OR wra."whatsappLidChatId" IN (${Prisma.join(identityKeys)})
      OR wra."providerMessageId" IN (${Prisma.join(identityKeys)})
    )
    ORDER BY wra."createdAt" DESC
    LIMIT 20
  `;

  return pickLatestWhatsappBotInboundRoute(rows, input.botSessionId);
}

export function pickLatestWhatsappBotInboundRoute(
  candidates: WhatsappBotRouteCandidate[],
  botSessionId: string
): WhatsappBotInboundRoute | null {
  const route = candidates
    .filter(
      (candidate) =>
        candidate.senderSessionId === botSessionId &&
        candidate.status === "SENT" &&
        !candidate.paidAt
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

  if (!route) return null;

  return {
    collectorId: route.collectorId,
    collectorFullName: route.collectorFullName,
    collectorPhone: route.collectorPhone,
    debtorPhone: route.debtorPhone,
  };
}

export function getInboundIdentityKeys(values: Array<string | null | undefined>) {
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

function toOpenWaChatId(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits ? `${digits}@c.us` : null;
}
