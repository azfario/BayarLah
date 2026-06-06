import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendOpenWaText } from "@/lib/openwa";
import { handleInboundPaymentProofImage } from "@/lib/payment-proof-inbound";
import {
  getLinkedWhatsappBotSession,
  resolveWhatsappBotInboundRoute,
} from "@/lib/whatsapp-bot";
import { toOpenWaChatId } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const configuredSecret = process.env.OPENWA_WEBHOOK_SECRET;
  if (process.env.NODE_ENV === "production" && !configuredSecret) {
    return NextResponse.json(
      { error: "Webhook authentication is not configured." },
      { status: 503 }
    );
  }

  if (configuredSecret) {
    const receivedSecret =
      request.headers.get("x-openwa-webhook-secret") ??
      request.headers.get("x-webhook-secret");
    if (receivedSecret !== configuredSecret) {
      return NextResponse.json({ error: "Invalid webhook secret." }, { status: 401 });
    }
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }

  if (isOutgoingWebhookPayload(payload)) {
    return NextResponse.json({ ok: true, skipped: "outgoing_message" });
  }

  const sessionId = getPayloadString(payload, ["sessionId", "session.id"]);
  if (!sessionId) {
    return NextResponse.json({ ok: true, skipped: "missing_session_id" });
  }

  const botSession = await getLinkedWhatsappBotSession(prisma);
  if (!botSession?.sessionId || botSession.sessionId !== sessionId) {
    return NextResponse.json({ ok: true, skipped: "unknown_session" });
  }

  const debtorPhone = getDebtorPhone(payload);
  const inboundChatId = getInboundChatId(payload);
  const inboundSenderId = getInboundSenderId(payload);

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

  const route = await resolveWhatsappBotInboundRoute(prisma, {
    botSessionId: botSession.sessionId,
    debtorPhone,
    inboundChatId,
    inboundSenderId,
    messageId,
  });

  if (!route) {
    await sendUnmatchedPaymentProofReply({
      sessionId: botSession.sessionId,
      debtorPhone,
      inboundChatId,
      inboundSenderId,
    });

    return NextResponse.json({ ok: true, skipped: "unmatched_payment_proof" });
  }

  const media = await getWebhookImageMedia(payload);
  if (!media) {
    return NextResponse.json({
      ok: true,
      skipped: "no_image_media",
      hint: "OpenWA delivered the webhook, but the payload did not include image bytes or an image URL.",
    });
  }

  const result = await handleInboundPaymentProofImage({
    collectorId: route.collectorId,
    debtorPhone: debtorPhone ?? route.debtorPhone,
    inboundChatId,
    inboundSenderId,
    senderSessionId: botSession.sessionId,
    messageId,
    bytes: media.bytes,
    contentType: media.contentType,
  });

  return NextResponse.json({
    ok: true,
    status: result.decision.status,
    paymentProofId: result.paymentProofId,
    reviewReason: result.decision.reviewReason,
  });
}

async function sendUnmatchedPaymentProofReply(input: {
  sessionId: string;
  debtorPhone?: string | null;
  inboundChatId?: string | null;
  inboundSenderId?: string | null;
}) {
  const chatId =
    input.inboundChatId ??
    input.inboundSenderId ??
    (input.debtorPhone ? toOpenWaChatId(input.debtorPhone) : null);

  if (!chatId) return;

  await sendOpenWaText({
    sessionId: input.sessionId,
    chatId,
    text: [
      "BayarLah could not match this receipt to a recent unpaid reminder.",
      "Please send the receipt image in the same chat after receiving a BayarLah reminder.",
    ].join("\n"),
  }).catch(() => undefined);
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

function getDebtorPhone(payload: object) {
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

function getInboundChatId(payload: object) {
  return getPayloadString(payload, [
    "data.chatId",
    "data.message.chatId",
    "chatId",
    "message.chatId",
  ]);
}

function getInboundSenderId(payload: object) {
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
