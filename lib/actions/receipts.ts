"use server";

import { Buffer } from "node:buffer";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ensureUserInDB } from "@/lib/actions/user";
import { prisma } from "@/lib/db";
import { normalizeMalaysianPhone } from "@/lib/friends";
import { centsToMoneyString, parseMoneyToCents } from "@/lib/money";
import { isProfileComplete } from "@/lib/profile";
import {
  distributeEvenly,
  distributeProportionally,
} from "@/lib/receipt-calculations";
import { parseReminderScheduleFromFormData } from "@/lib/reminders";
import type {
  ParsedReceiptDraft,
  ReceiptParseState,
  ReceiptSaveState,
} from "@/lib/receipts";

const MAX_RECEIPT_SIZE_BYTES = Math.floor(3.8 * 1024 * 1024);
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const RECEIPT_NEXT_PATH = "/expenses?mode=receipt";

type ReceiptSplitMode = "EQUAL_SPLIT" | "CUSTOM_AMOUNT";

type GeminiResponse = {
  candidates?: {
    content?: {
      parts?: {
        text?: string;
      }[];
    };
  }[];
  error?: {
    message?: string;
  };
};

type OcrSpaceResponse = {
  ParsedResults?: {
    ParsedText?: string;
  }[];
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string | string[];
  ErrorDetails?: string;
};

type ReceiptSavePayload = {
  splitMode: ReceiptSplitMode;
  merchantName: string;
  receiptDate: string;
  subtotalCents: number;
  taxCents: number;
  serviceChargeCents: number;
  roundingCents: number;
  totalCents: number;
  participants: ReceiptSaveParticipant[];
  items: ReceiptSaveItem[];
};

type ReceiptSaveParticipant = {
  key: string;
  participantType: "COLLECTOR" | "FRIEND" | "INLINE_FRIEND";
  friendId?: string;
  inlineFriendName?: string;
  inlineFriendPhone?: string;
};

type ReceiptSaveItem = {
  key: string;
  name: string;
  quantity: number;
  unitAmountCents: number;
  totalAmountCents: number;
  assignments: ReceiptSaveAssignment[];
};

type ReceiptSaveAssignment = {
  participantKey: string;
};

type AllocationTarget = {
  participantType: "COLLECTOR" | "FRIEND";
  key: string;
  friendId: string | null;
};

type ResolvedParticipants = {
  list: AllocationTarget[];
  byKey: Map<string, AllocationTarget>;
};

const RECEIPT_SCHEMA = {
  type: "object",
  properties: {
    merchantName: {
      type: "string",
      description: "Merchant or restaurant name. Empty string if not visible.",
    },
    receiptDate: {
      type: "string",
      description: "Receipt date as visible in the OCR text. Empty string if not visible.",
    },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Receipt item name from OCR text.",
          },
          quantity: {
            type: "integer",
            description: "Item quantity. Use 1 if not visible.",
          },
          unitAmountCents: {
            type: "integer",
            description: "Single-unit item amount in Malaysian sen.",
          },
          totalAmountCents: {
            type: "integer",
            description: "Line total in Malaysian sen.",
          },
        },
        required: ["name", "quantity", "unitAmountCents", "totalAmountCents"],
      },
    },
    subtotalCents: {
      type: "integer",
      description: "Subtotal in Malaysian sen before tax/service/rounding.",
    },
    taxCents: {
      type: "integer",
      description: "Tax amount in Malaysian sen. Use 0 if not present.",
    },
    serviceChargeCents: {
      type: "integer",
      description: "Service charge in Malaysian sen. Use 0 if not present.",
    },
    roundingCents: {
      type: "integer",
      description: "Rounding adjustment in Malaysian sen. Can be negative.",
    },
    totalCents: {
      type: "integer",
      description: "Final receipt total paid in Malaysian sen.",
    },
  },
  required: [
    "merchantName",
    "receiptDate",
    "items",
    "subtotalCents",
    "taxCents",
    "serviceChargeCents",
    "roundingCents",
    "totalCents",
  ],
};

export async function parseReceipt(
  _previousState: ReceiptParseState,
  formData: FormData
): Promise<ReceiptParseState> {
  const user = await ensureUserInDB();
  if (!isProfileComplete(user)) {
    redirect(`/profile?next=${encodeURIComponent(RECEIPT_NEXT_PATH)}`);
  }

  try {
    assertOcrSpaceConfigured();
    assertGeminiConfigured();

    const receiptImage = getUploadedFile(formData.get("receiptImage"));
    if (!receiptImage) {
      return { error: "Please upload or capture a receipt image." };
    }

    validateReceiptImage(receiptImage);

    const bytes = Buffer.from(await receiptImage.arrayBuffer());
    const ocrText = await extractReceiptTextWithOcrSpace(receiptImage, bytes);
    const draft = await parseReceiptTextWithGemini(ocrText);

    return { draft };
  } catch (error) {
    return { error: getErrorMessage(error) };
  }
}

export async function saveReceiptExpense(
  _previousState: ReceiptSaveState,
  formData: FormData
): Promise<ReceiptSaveState> {
  const user = await ensureUserInDB();
  if (!isProfileComplete(user)) {
    redirect(`/profile?next=${encodeURIComponent(RECEIPT_NEXT_PATH)}`);
  }

  try {
    const description = getString(formData.get("description"));
    const reminderSchedule = parseReminderScheduleFromFormData(formData);
    const payload = parseReceiptSavePayload(getString(formData.get("receiptPayload")));
    const savedExpense = await buildReceiptExpenseData(payload, user.id);

    await prisma.expense.create({
      data: {
        collectorId: user.id,
        description:
          description || payload.merchantName || "Receipt-assisted expense",
        totalAmount: centsToMoneyString(payload.totalCents),
        splitMode: savedExpense.splitMode,
        collectorAmount: centsToMoneyString(savedExpense.collectorCents),
        receiptMerchantName: payload.merchantName || null,
        receiptDate: payload.receiptDate || null,
        receiptSubtotal: centsToMoneyString(payload.subtotalCents),
        receiptTax: centsToMoneyString(payload.taxCents),
        receiptServiceCharge: centsToMoneyString(payload.serviceChargeCents),
        receiptRounding: centsToMoneyString(payload.roundingCents),
        receiptParsedTotal: centsToMoneyString(payload.totalCents),
        shares: {
          create: savedExpense.friendTotals
            .filter((friendTotal) => friendTotal.owedCents > 0)
            .map((friendTotal) => ({
              friendId: friendTotal.friendId,
              owedAmount: centsToMoneyString(friendTotal.owedCents),
              ...reminderSchedule,
            })),
        },
        receiptItems: {
          create: savedExpense.items,
        },
      },
    });
  } catch (error) {
    return { error: getErrorMessage(error) };
  }

  revalidatePath("/expenses");
  redirect("/expenses?success=Receipt expense recorded.");
}

async function buildReceiptExpenseData(payload: ReceiptSavePayload, userId: string) {
  validateReceiptPayloadTotals(payload);

  const participants = await resolveParticipants(payload.participants, userId);

  if (payload.splitMode === "EQUAL_SPLIT") {
    if (participants.list.filter((participant) => participant.friendId).length === 0) {
      throw new Error("Add at least one friend before saving an equal split.");
    }

    const finalTotals = distributeEvenly(
      payload.totalCents,
      participants.list.map((participant) => participant.key)
    );

    return {
      splitMode: "EQUAL_SPLIT" as const,
      collectorCents: finalTotals.get("collector") ?? 0,
      friendTotals: getFriendTotals(participants.list, finalTotals),
      items: payload.items.map((item, index) => ({
        name: item.name,
        amount: centsToMoneyString(item.totalAmountCents),
        sortOrder: index,
      })),
    };
  }

  return buildCustomReceiptExpenseData(payload, participants);
}

function buildCustomReceiptExpenseData(
  payload: ReceiptSavePayload,
  participants: ResolvedParticipants
) {
  const participantSubtotals = new Map<string, number>();
  for (const participant of participants.list) {
    participantSubtotals.set(participant.key, 0);
  }

  const receiptItems = payload.items.map((item, index) => {
    if (item.assignments.length !== item.quantity) {
      throw new Error(`Assign every "${item.name}" item before saving.`);
    }

    const allocationsByParticipant = item.assignments.map((assignment) => {
      const target = participants.byKey.get(assignment.participantKey);
      if (!target) {
        throw new Error("Receipt assignment participant is invalid.");
      }

      participantSubtotals.set(
        target.key,
        (participantSubtotals.get(target.key) ?? 0) + item.unitAmountCents
      );

      return {
        target,
        amountCents: item.unitAmountCents,
      };
    });

    return {
      name: item.name,
      amount: centsToMoneyString(item.totalAmountCents),
      sortOrder: index,
      allocations: {
        create: allocationsByParticipant.map((allocation) => ({
          participantType: allocation.target.participantType,
          friendId: allocation.target.friendId,
          amount: centsToMoneyString(allocation.amountCents),
        })),
      },
    };
  });

  const chargesCents =
    payload.taxCents + payload.serviceChargeCents + payload.roundingCents;
  const chargeAllocations = distributeProportionally(
    chargesCents,
    Array.from(participantSubtotals.entries()).map(([key, baseCents]) => ({
      key,
      baseCents,
    }))
  );
  const finalTotals = new Map<string, number>();

  for (const [key, subtotalCents] of participantSubtotals.entries()) {
    const finalCents = subtotalCents + (chargeAllocations.get(key) ?? 0);
    if (finalCents < 0) {
      throw new Error("Receipt adjustments make one participant total negative.");
    }

    finalTotals.set(key, finalCents);
  }

  const computedTotal = Array.from(finalTotals.values()).reduce(
    (sum, cents) => sum + cents,
    0
  );

  if (computedTotal !== payload.totalCents) {
    throw new Error("Please adjust the receipt totals until they match.");
  }

  const friendTotals = getFriendTotals(participants.list, finalTotals);
  if (!friendTotals.some((friendTotal) => friendTotal.owedCents > 0)) {
    throw new Error("Assign at least one item to a friend before saving.");
  }

  return {
    splitMode: "CUSTOM_AMOUNT" as const,
    collectorCents: finalTotals.get("collector") ?? 0,
    friendTotals,
    items: receiptItems,
  };
}

async function resolveParticipants(
  inputs: ReceiptSaveParticipant[],
  ownerId: string
): Promise<ResolvedParticipants> {
  const participantInputs = ensureCollectorParticipant(inputs);
  const keys = new Set<string>();
  const selectedFriendIds = Array.from(
    new Set(
      participantInputs
        .filter((participant) => participant.participantType === "FRIEND")
        .map((participant) => participant.friendId)
        .filter((friendId): friendId is string => Boolean(friendId))
    )
  );
  const selectedFriends = await prisma.friend.findMany({
    where: {
      ownerId,
      id: { in: selectedFriendIds },
    },
    select: { id: true, phone: true },
  });

  if (selectedFriends.length !== selectedFriendIds.length) {
    throw new Error("Please choose friends from your own list.");
  }

  const selectedFriendById = new Map(
    selectedFriends.map((friend) => [friend.id, friend])
  );
  const selectedPhones = new Set(selectedFriends.map((friend) => friend.phone));
  const inlineInputs = getInlineFriendInputs(participantInputs);
  const inlineFriends = new Map<string, { id: string; phone: string }>();

  for (const input of inlineInputs.values()) {
    if (selectedPhones.has(input.phone)) {
      throw new Error("One inline friend is already selected from your saved friends.");
    }

    const friend = await getOrCreateInlineFriend(input, ownerId);
    inlineFriends.set(input.phone, { id: friend.id, phone: friend.phone });
  }

  const list: AllocationTarget[] = [];
  const byKey = new Map<string, AllocationTarget>();

  for (const participant of participantInputs) {
    if (!participant.key || keys.has(participant.key)) {
      throw new Error("Receipt participant data is invalid.");
    }

    keys.add(participant.key);

    let target: AllocationTarget;
    if (participant.participantType === "COLLECTOR") {
      target = {
        participantType: "COLLECTOR",
        key: "collector",
        friendId: null,
      };
    } else if (participant.participantType === "FRIEND") {
      if (!participant.friendId || !selectedFriendById.has(participant.friendId)) {
        throw new Error("Please choose friends from your own list.");
      }

      target = {
        participantType: "FRIEND",
        key: participant.key,
        friendId: participant.friendId,
      };
    } else {
      const phone = normalizeMalaysianPhone(
        getStringValue(participant.inlineFriendPhone)
      );
      const inlineFriend = inlineFriends.get(phone);
      if (!inlineFriend) {
        throw new Error("Please enter both name and phone for each new friend.");
      }

      target = {
        participantType: "FRIEND",
        key: participant.key,
        friendId: inlineFriend.id,
      };
    }

    list.push(target);
    byKey.set(target.key, target);
  }

  return { list, byKey };
}

function ensureCollectorParticipant(inputs: ReceiptSaveParticipant[]) {
  const withoutCollectors = inputs.filter(
    (participant) => participant.participantType !== "COLLECTOR"
  );

  return [
    {
      key: "collector",
      participantType: "COLLECTOR" as const,
    },
    ...withoutCollectors,
  ];
}

function getFriendTotals(
  participants: AllocationTarget[],
  finalTotals: Map<string, number>
) {
  return participants
    .filter((participant) => participant.friendId)
    .map((participant) => ({
      friendId: participant.friendId ?? "",
      owedCents: finalTotals.get(participant.key) ?? 0,
    }));
}

function validateReceiptPayloadTotals(payload: ReceiptSavePayload) {
  if (payload.items.length === 0) {
    throw new Error("Please keep at least one receipt item.");
  }

  if (payload.subtotalCents <= 0 || payload.totalCents <= 0) {
    throw new Error("Receipt subtotal and total must be above RM0.00.");
  }

  if (payload.taxCents < 0 || payload.serviceChargeCents < 0) {
    throw new Error("Tax and service charge cannot be negative.");
  }

  const subtotalFromItems = payload.items.reduce((sum, item) => {
    if (
      item.quantity <= 0 ||
      item.unitAmountCents <= 0 ||
      item.totalAmountCents !== item.quantity * item.unitAmountCents
    ) {
      throw new Error(`Please check quantity and unit price for "${item.name}".`);
    }

    return sum + item.totalAmountCents;
  }, 0);

  if (subtotalFromItems !== payload.subtotalCents) {
    throw new Error("Item prices must match the receipt subtotal.");
  }

  const computedTotal =
    payload.subtotalCents +
    payload.taxCents +
    payload.serviceChargeCents +
    payload.roundingCents;

  if (computedTotal !== payload.totalCents) {
    throw new Error("Receipt subtotal, tax, service, and rounding must match total.");
  }
}

function getInlineFriendInputs(participants: ReceiptSaveParticipant[]) {
  const inlineFriends = new Map<string, { name: string; phone: string }>();

  for (const participant of participants) {
    if (participant.participantType !== "INLINE_FRIEND") continue;

    const name = getStringValue(participant.inlineFriendName);
    const phone = normalizeMalaysianPhone(getStringValue(participant.inlineFriendPhone));

    if (!name || !phone) {
      throw new Error("Please enter both name and phone for each new friend.");
    }

    if (inlineFriends.has(phone)) {
      throw new Error("Each new inline friend needs a unique phone number.");
    }

    inlineFriends.set(phone, { name, phone });
  }

  return inlineFriends;
}

async function getOrCreateInlineFriend(
  input: { name: string; phone: string },
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

async function extractReceiptTextWithOcrSpace(file: File, bytes: Buffer) {
  const apiKey = assertOcrSpaceConfigured();
  const body = new FormData();
  const imageBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(imageBuffer).set(bytes);
  body.append(
    "file",
    new Blob([imageBuffer], { type: file.type }),
    file.name || "receipt.jpg"
  );
  body.append("language", "eng");
  body.append("isOverlayRequired", "false");
  body.append("detectOrientation", "true");
  body.append("OCREngine", "2");

  const response = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    headers: {
      apikey: apiKey,
    },
    body,
  });

  const result = (await response.json().catch(() => null)) as OcrSpaceResponse | null;
  if (!response.ok || !result) {
    throw new Error("OCR.space could not read this receipt.");
  }

  if (result.IsErroredOnProcessing) {
    throw new Error(getOcrErrorMessage(result));
  }

  const text = result.ParsedResults?.map((parsed) => parsed.ParsedText ?? "")
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("OCR could not find text on this receipt. Try a clearer photo.");
  }

  return text;
}

async function parseReceiptTextWithGemini(ocrText: string): Promise<ParsedReceiptDraft> {
  const apiKey = assertGeminiConfigured();
  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const text = await fetchGeminiReceiptJson(apiKey, model, ocrText);
  const parsed = parseJsonText(text);

  return normalizeParsedReceipt(parsed);
}

async function fetchGeminiReceiptJson(
  apiKey: string,
  model: string,
  ocrText: string
) {
  const normalizedModel = model.startsWith("models/")
    ? model.slice("models/".length)
    : model;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${normalizedModel}:generateContent`;
  const prompt = [
    "Parse this OCR text from a Malaysian receipt into JSON.",
    "Use integer cents, not RM decimals.",
    "Only include actual purchasable line items in items.",
    "Do not include subtotal, tax, service charge, rounding, discount, cash, change, card payment, or total as items.",
    "If a receipt line has quantity such as x2, quantity 2, 2pcs, or 2 @ RM12, return quantity and unitAmountCents.",
    "If quantity is not visible, use quantity 1.",
    "If a value is not visible, use 0 for money fields or an empty string for text fields.",
    "Return exactly these top-level keys: merchantName, receiptDate, items, subtotalCents, taxCents, serviceChargeCents, roundingCents, totalCents.",
    "Each item must contain name, quantity, unitAmountCents, and totalAmountCents.",
    "Do not invent items or prices. If OCR is uncertain, keep the closest visible text so the user can edit it.",
    "OCR text:",
    ocrText,
  ].join("\n");
  const contents = [
    {
      role: "user",
      parts: [{ text: prompt }],
    },
  ];
  const requestBodies = [
    {
      contents,
      generationConfig: {
        responseFormat: {
          text: {
            mimeType: "application/json",
            schema: RECEIPT_SCHEMA,
          },
        },
      },
    },
    {
      contents,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RECEIPT_SCHEMA,
      },
    },
    {
      contents,
      generationConfig: {
        responseMimeType: "application/json",
      },
    },
  ];
  let lastErrorMessage = "Gemini could not parse the OCR text.";

  for (const body of requestBodies) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
    });

    const responseJson = (await response.json().catch(() => null)) as
      | GeminiResponse
      | null;

    if (!response.ok) {
      lastErrorMessage = responseJson?.error?.message || lastErrorMessage;
      continue;
    }

    const text = responseJson?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();

    if (!text) {
      throw new Error("Gemini returned an empty receipt parse.");
    }

    return text;
  }

  throw new Error(lastErrorMessage);
}

function parseReceiptSavePayload(value: string): ReceiptSavePayload {
  if (!value) {
    throw new Error("Receipt review data is missing. Please upload the receipt again.");
  }

  const raw = parseJsonText(value);
  if (!isRecord(raw)) {
    throw new Error("Receipt review data is invalid.");
  }

  const splitMode = getReceiptSplitMode(raw.splitMode);
  const participants = Array.isArray(raw.participants)
    ? raw.participants.map(parseReceiptSaveParticipant)
    : [];
  const items = Array.isArray(raw.items)
    ? raw.items.map((item, index) => parseReceiptSaveItem(item, index))
    : [];

  return {
    splitMode,
    merchantName: getStringValue(raw.merchantName),
    receiptDate: getStringValue(raw.receiptDate),
    subtotalCents: getRequiredCents(raw.subtotalCents, "subtotal"),
    taxCents: getRequiredCents(raw.taxCents, "tax", { allowZero: true }),
    serviceChargeCents: getRequiredCents(raw.serviceChargeCents, "service charge", {
      allowZero: true,
    }),
    roundingCents: getRequiredCents(raw.roundingCents, "rounding", {
      allowNegative: true,
      allowZero: true,
    }),
    totalCents: getRequiredCents(raw.totalCents, "total"),
    participants,
    items,
  };
}

function parseReceiptSaveParticipant(value: unknown): ReceiptSaveParticipant {
  if (!isRecord(value)) {
    throw new Error("Receipt participant data is invalid.");
  }

  const participantType = getStringValue(value.participantType);
  if (
    participantType !== "COLLECTOR" &&
    participantType !== "FRIEND" &&
    participantType !== "INLINE_FRIEND"
  ) {
    throw new Error("Receipt participant data is invalid.");
  }

  return {
    key: getStringValue(value.key),
    participantType,
    friendId: getStringValue(value.friendId) || undefined,
    inlineFriendName: getStringValue(value.inlineFriendName) || undefined,
    inlineFriendPhone: getStringValue(value.inlineFriendPhone) || undefined,
  };
}

function parseReceiptSaveItem(value: unknown, index: number): ReceiptSaveItem {
  if (!isRecord(value)) {
    throw new Error("Receipt item data is invalid.");
  }

  const key = getStringValue(value.key) || `item-${index + 1}`;
  const name = getStringValue(value.name) || `Item ${index + 1}`;
  const quantity = getRequiredQuantity(value.quantity, name);
  const unitAmountCents = getRequiredCents(value.unitAmountCents, name);
  const totalAmountCents = getRequiredCents(value.totalAmountCents, name);
  const assignments = Array.isArray(value.assignments)
    ? value.assignments.map(parseReceiptSaveAssignment)
    : [];

  return { key, name, quantity, unitAmountCents, totalAmountCents, assignments };
}

function parseReceiptSaveAssignment(value: unknown): ReceiptSaveAssignment {
  if (!isRecord(value)) {
    throw new Error("Receipt assignment data is invalid.");
  }

  return {
    participantKey: getStringValue(value.participantKey),
  };
}

function normalizeParsedReceipt(value: unknown): ParsedReceiptDraft {
  if (!isRecord(value)) {
    throw new Error("Gemini returned receipt data in an unexpected format.");
  }

  const rawItems = Array.isArray(value.items) ? value.items : [];
  const items = rawItems
    .map((item, index) => {
      if (!isRecord(item)) return null;

      const quantity = normalizeQuantity(item.quantity) ?? 1;
      const rawTotal =
        normalizeCents(item.totalAmountCents) ?? normalizeCents(item.amountCents);
      const rawUnit = normalizeCents(item.unitAmountCents);
      const unitAmountCents =
        rawUnit ??
        (rawTotal !== null && quantity > 0
          ? Math.max(1, Math.round(rawTotal / quantity))
          : null);

      if (!unitAmountCents || unitAmountCents <= 0) return null;

      return {
        name: getStringValue(item.name) || `Item ${index + 1}`,
        quantity,
        unitAmountCents,
        totalAmountCents: quantity * unitAmountCents,
      };
    })
    .filter(
      (item): item is {
        name: string;
        quantity: number;
        unitAmountCents: number;
        totalAmountCents: number;
      } => Boolean(item)
    );

  if (items.length === 0) {
    throw new Error("Gemini could not find receipt line items. Try a clearer photo.");
  }

  const itemSubtotal = items.reduce((sum, item) => sum + item.totalAmountCents, 0);
  const subtotalCents = normalizeCents(value.subtotalCents) ?? itemSubtotal;
  const taxCents = Math.max(0, normalizeCents(value.taxCents) ?? 0);
  const serviceChargeCents = Math.max(
    0,
    normalizeCents(value.serviceChargeCents) ?? 0
  );
  const roundingCents = normalizeCents(value.roundingCents) ?? 0;
  const totalCents =
    normalizeCents(value.totalCents) ??
    subtotalCents + taxCents + serviceChargeCents + roundingCents;

  if (totalCents <= 0) {
    throw new Error("Gemini could not find a valid receipt total.");
  }

  return {
    merchantName: getStringValue(value.merchantName),
    receiptDate: getStringValue(value.receiptDate),
    items,
    subtotalCents,
    taxCents,
    serviceChargeCents,
    roundingCents,
    totalCents,
  };
}

function getReceiptSplitMode(value: unknown): ReceiptSplitMode {
  if (value === "EQUAL_SPLIT" || value === "CUSTOM_AMOUNT") return value;
  throw new Error("Receipt split mode is invalid.");
}

function assertOcrSpaceConfigured() {
  const apiKey = process.env.OCR_SPACE_API_KEY;

  if (!apiKey) {
    throw new Error("Missing OCR_SPACE_API_KEY in .env.");
  }

  return apiKey;
}

function assertGeminiConfigured() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY in .env.");
  }

  return apiKey;
}

function validateReceiptImage(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please upload an image file.");
  }

  if (file.size > MAX_RECEIPT_SIZE_BYTES) {
    throw new Error("Please upload a compressed receipt image smaller than 3.8 MB.");
  }
}

function getUploadedFile(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || value.size === 0) return null;
  return value;
}

function parseJsonText(value: string): unknown {
  const trimmed = value.trim();
  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  try {
    return JSON.parse(withoutFence);
  } catch {
    throw new Error("Receipt data could not be read as JSON.");
  }
}

function getRequiredCents(
  value: unknown,
  label: string,
  options: { allowNegative?: boolean; allowZero?: boolean } = {}
) {
  const cents = normalizeCents(value);
  if (
    cents === null ||
    (!options.allowNegative && cents < 0) ||
    (!options.allowZero && cents <= 0)
  ) {
    throw new Error(`Please enter a valid amount for ${label}.`);
  }

  return cents;
}

function getRequiredQuantity(value: unknown, label: string) {
  const quantity = normalizeQuantity(value);
  if (quantity === null || quantity <= 0) {
    throw new Error(`Please enter a valid quantity for ${label}.`);
  }

  return quantity;
}

function normalizeQuantity(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.round(value));
  }

  if (typeof value !== "string") return null;

  const quantity = Number(value.trim());
  if (!Number.isFinite(quantity)) return null;

  return Math.max(1, Math.round(quantity));
}

function normalizeCents(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? value : Math.round(value * 100);
  }

  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.includes(".")) {
    return parseMoneyToCents(trimmed);
  }

  const cents = Number(trimmed.replace(/,/g, ""));
  return Number.isInteger(cents) ? cents : null;
}

function getString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function getStringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getOcrErrorMessage(result: OcrSpaceResponse) {
  const message = Array.isArray(result.ErrorMessage)
    ? result.ErrorMessage.filter(Boolean).join(" ")
    : result.ErrorMessage;

  return message || result.ErrorDetails || "OCR.space could not read this receipt.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
