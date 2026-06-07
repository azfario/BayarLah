export type WhatsappMessageClassification =
  | "INBOUND_IMAGE"
  | "OUTGOING"
  | "NOT_IMAGE"
  | "AMBIGUOUS";

export function classifyWhatsappMessage(value: unknown): WhatsappMessageClassification {
  const records = getNestedRecords(value);
  const directions = records
    .map((record) => getString(record.direction)?.toLowerCase())
    .filter(Boolean);
  const fromMeValues = records
    .map((record) => record.fromMe)
    .filter((item): item is boolean => typeof item === "boolean");

  if (directions.includes("outgoing") || fromMeValues.includes(true)) {
    return "OUTGOING";
  }

  const explicitlyInbound =
    directions.some((direction) => direction === "incoming" || direction === "inbound") ||
    fromMeValues.includes(false);
  if (!explicitlyInbound) return "AMBIGUOUS";

  return records.some(isImageRecord) ? "INBOUND_IMAGE" : "NOT_IMAGE";
}

export function getWhatsappMessageId(value: unknown) {
  for (const path of [
    "data.message._serialized",
    "data.message.waMessageId",
    "data.message.messageId",
    "data.message.id",
    "message._serialized",
    "message.waMessageId",
    "message.messageId",
    "message.id",
    "data._serialized",
    "data.waMessageId",
    "data.messageId",
    "data.id",
  ]) {
    const candidate = getString(getPathValue(value, path));
    if (candidate) return candidate;
  }

  const records = getNestedRecords(value);
  const messageRecords = records.filter(
    (record) =>
      "direction" in record ||
      "fromMe" in record ||
      "type" in record ||
      "mimetype" in record ||
      "mimeType" in record ||
      "hasMedia" in record
  );

  for (const record of [...messageRecords, ...records]) {
    for (const key of ["id", "messageId", "_serialized", "waMessageId"]) {
      const candidate = getString(record[key]);
      if (candidate) return candidate;
    }
  }

  return null;
}

function isImageRecord(record: Record<string, unknown>) {
  const type = getString(record.type)?.toLowerCase();
  const mimeType = (
    getString(record.mimetype) ??
    getString(record.mimeType) ??
    getString(record.contentType)
  )?.toLowerCase();

  return (
    record.hasMedia === true ||
    type === "image" ||
    Boolean(mimeType?.startsWith("image/"))
  );
}

function getNestedRecords(value: unknown) {
  const records: Record<string, unknown>[] = [];
  const pending = [value];
  const visited = new Set<object>();

  while (pending.length > 0) {
    const item = pending.shift();
    if (!item || typeof item !== "object" || visited.has(item)) continue;

    visited.add(item);
    if (Array.isArray(item)) {
      pending.push(...item);
      continue;
    }

    const record = item as Record<string, unknown>;
    records.push(record);
    pending.push(...Object.values(record));
  }

  return records;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getPathValue(value: unknown, path: string) {
  let current = value;

  for (const key of path.split(".")) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}
