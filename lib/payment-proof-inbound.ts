import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { createServerSupabaseClient } from "./supabase/server.ts";
import { extractImageTextWithOcrSpace } from "./ocr-space.ts";
import { createMatchedPaymentProof } from "./payment-proof-matching.ts";
import { parseBankReceiptOcrText } from "./payment-proofs.ts";

type HandleInboundPaymentProofImageInput = {
  collectorId: string;
  debtorPhone: string;
  messageId: string;
  bytes: Buffer;
  contentType: string;
};

type PaymentProofImageDeps = {
  uploadImage?: (input: {
    collectorId: string;
    debtorPhone: string;
    imageHash: string;
    messageId: string;
    bytes: Buffer;
    contentType: string;
  }) => Promise<string>;
  extractOcrText?: (input: {
    bytes: Buffer;
    contentType: string;
    fileName: string;
  }) => Promise<string>;
  createMatchedProof?: typeof createMatchedPaymentProof;
};

export async function handleInboundPaymentProofImage(
  input: HandleInboundPaymentProofImageInput,
  deps: PaymentProofImageDeps = {}
) {
  const imageHash = hashPaymentProofImage(input.bytes);
  const contentType = input.contentType || "image/jpeg";
  const fileName = `payment-proof-${imageHash}.${getImageExtension(contentType)}`;
  const uploadImage = deps.uploadImage ?? uploadPaymentProofImage;
  const extractOcrText = deps.extractOcrText ?? extractPaymentProofText;
  const createMatchedProof = deps.createMatchedProof ?? createMatchedPaymentProof;
  const imageStoragePath = await uploadImage({
    collectorId: input.collectorId,
    debtorPhone: input.debtorPhone,
    imageHash,
    messageId: input.messageId,
    bytes: input.bytes,
    contentType,
  });
  const rawOcrText = await extractOcrText({
    bytes: input.bytes,
    contentType,
    fileName,
  });
  const parsed = parseBankReceiptOcrText(rawOcrText);

  return createMatchedProof({
    collectorId: input.collectorId,
    debtorPhone: input.debtorPhone,
    imageStoragePath,
    imageHash,
    parsedAmountCents: parsed.amountCents,
    parsedRecipient: parsed.recipientText,
    parsedTransactionReference: parsed.transactionReference,
    parsedTimestamp: parseReceiptTimestamp(parsed.timestampText),
    rawOcrText: parsed.rawOcrText,
    confidenceNotes: parsed.confidenceNotes,
  });
}

export function hashPaymentProofImage(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function uploadPaymentProofImage(input: {
  collectorId: string;
  debtorPhone: string;
  imageHash: string;
  messageId: string;
  bytes: Buffer;
  contentType: string;
}) {
  const supabase = createServerSupabaseClient();
  const extension = getImageExtension(input.contentType);
  const safeMessageId = input.messageId.replace(/[^a-z0-9_-]/gi, "").slice(0, 80);
  const safeDebtorPhone = input.debtorPhone.replace(/\D/g, "") || "unknown";
  const path = [
    input.collectorId,
    safeDebtorPhone,
    `${Date.now()}-${safeMessageId || input.imageHash}.${extension}`,
  ].join("/");

  return supabase.storage
    .from("payment-proofs")
    .upload(path, input.bytes, {
      contentType: input.contentType,
      upsert: false,
    })
    .then(({ error }) => {
      if (error) throw new Error(error.message);
      return path;
    });
}

async function extractPaymentProofText(input: {
  bytes: Buffer;
  contentType: string;
  fileName: string;
}) {
  const imageBuffer = new ArrayBuffer(input.bytes.byteLength);
  new Uint8Array(imageBuffer).set(input.bytes);
  const file = new File([imageBuffer], input.fileName, { type: input.contentType });

  return extractImageTextWithOcrSpace({
    file,
    bytes: input.bytes,
    fallbackFileName: input.fileName,
    failureMessage: "OCR.space could not read this payment proof.",
    emptyTextMessage: "OCR could not find text on this payment proof.",
  });
}

function parseReceiptTimestamp(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const date = new Date(trimmed);
  if (!Number.isNaN(date.getTime())) return date;

  const match = trimmed.match(
    /\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?:\s*([AP]M))?)?/i
  );
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = normalizeYear(Number(match[3]));
  let hour = match[4] ? Number(match[4]) : 0;
  const minute = match[5] ? Number(match[5]) : 0;
  const meridiem = match[6]?.toUpperCase();

  if (meridiem === "PM" && hour < 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;

  const parsedDate = new Date(year, month - 1, day, hour, minute);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function normalizeYear(year: number) {
  return year < 100 ? 2000 + year : year;
}

function getImageExtension(contentType: string) {
  switch (contentType.toLowerCase()) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/heic":
      return "heic";
    default:
      return "jpg";
  }
}
