export type BankReceiptParseResult = {
  provider: "TNG_EWALLET" | "GENERIC_BANK";
  amountCents: number | null;
  recipientText: string;
  transactionReference: string;
  timestampText: string;
  rawOcrText: string;
  confidenceNotes: string[];
};

const AMOUNT_LABEL_PATTERN =
  /\b(amount|total|paid|payment|transfer|transaction|duitnow|myr|rm)\b/i;
const RECIPIENT_LABEL_PATTERN =
  /\b(recipient name|recipient duitnow id|duitnow name|to account|recipient|receiver|beneficiary|payee|merchant|to)\b/i;
const REFERENCE_LABEL_PATTERN =
  /\b(ref(?:erence)? no|transaction id|transaction ref|receipt no|duitnow ref|payment ref|reference|rrn)\b/i;
const TIMESTAMP_LABEL_PATTERN =
  /\b(transaction date|payment date|transfer date|date\/time|date|time|when)\b/i;
const TNG_BRAND_PATTERN = /\b(touch\s*['’]?\s*n\s*go\s+ewallet|tng\s+ewallet)\b/i;
const TNG_TRANSFER_PATTERN = /\btransferred\b/i;
const TNG_FIELD_PATTERN = /\b(receiver|remark|wallet ref(?:erence)?)\b/i;
const TNG_RECIPIENT_LABEL_PATTERN =
  /\b(transfer to|receiver|recipient|payment details|remark)\b/i;
const TNG_REFERENCE_LABEL_PATTERN =
  /\b(transaction no\.?|wallet ref(?:erence)?|reference no\.?)\b/i;
const TNG_TIMESTAMP_LABEL_PATTERN = /\b(date\s*\/\s*time|date\s*&\s*time)\b/i;
const TNG_FOOTER_PATTERN =
  /\b(get up to|claim now|terms and conditions|need help|powered by|learn more|invite friends)\b/i;

export function parseBankReceiptOcrText(ocrText: string): BankReceiptParseResult {
  const rawOcrText = ocrText.trim();
  const lines = rawOcrText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const provider = isTngReceipt(rawOcrText) ? "TNG_EWALLET" : "GENERIC_BANK";

  if (provider === "TNG_EWALLET") {
    return parseTngReceipt(rawOcrText, lines);
  }

  const amountCents = extractAmountCents(lines);
  const recipientText = extractLabeledValue(lines, RECIPIENT_LABEL_PATTERN);
  const transactionReference = extractLabeledValue(lines, REFERENCE_LABEL_PATTERN);
  const timestampText = extractTimestampText(lines);
  const confidenceNotes = getConfidenceNotes({
    rawOcrText,
    amountCents,
    recipientText,
    transactionReference,
    timestampText,
  });

  return {
    provider,
    amountCents,
    recipientText,
    transactionReference,
    timestampText,
    rawOcrText,
    confidenceNotes,
  };
}

function parseTngReceipt(rawOcrText: string, lines: string[]): BankReceiptParseResult {
  const coreLines = trimTngFooter(lines);
  const amountCents = extractTngAmountCents(coreLines);
  const recipientText = extractTngRecipientText(coreLines);
  const transactionReference = extractLabeledValue(
    coreLines,
    TNG_REFERENCE_LABEL_PATTERN
  );
  const timestampText = extractTngTimestampText(coreLines);
  const confidenceNotes = getConfidenceNotes({
    rawOcrText,
    amountCents,
    recipientText,
    transactionReference,
    timestampText,
    requireTransactionReference: false,
  });

  return {
    provider: "TNG_EWALLET",
    amountCents,
    recipientText,
    transactionReference,
    timestampText,
    rawOcrText,
    confidenceNotes,
  };
}

function isTngReceipt(rawOcrText: string) {
  return (
    TNG_BRAND_PATTERN.test(rawOcrText) ||
    (TNG_TRANSFER_PATTERN.test(rawOcrText) && TNG_FIELD_PATTERN.test(rawOcrText))
  );
}

function trimTngFooter(lines: string[]) {
  const footerIndex = lines.findIndex((line) => TNG_FOOTER_PATTERN.test(line));
  return footerIndex === -1 ? lines : lines.slice(0, footerIndex);
}

function extractAmountCents(lines: string[]) {
  const candidates = lines
    .map((line, index) => ({ line, index, amount: getLineAmountCents(line) }))
    .filter((candidate) => candidate.amount !== null)
    .map((candidate) => ({
      ...candidate,
      score: AMOUNT_LABEL_PATTERN.test(candidate.line) ? 2 : 1,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  return candidates[0]?.amount ?? null;
}

function getLineAmountCents(line: string) {
  const match = line.match(/\b(?:RM|MYR)\s*([0-9][0-9,]*(?:\.\d{2})?)\b/i);
  if (!match) return null;

  const amount = Number(match[1]?.replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return Math.round(amount * 100);
}

function extractTngAmountCents(lines: string[]) {
  for (const line of lines) {
    const match = line.match(/(?:^|\s)-?\s*RM\s*([0-9][0-9,]*(?:\.\d{2})?)/i);
    if (!match) continue;

    const amount = Number(match[1]?.replace(/,/g, ""));
    if (Number.isFinite(amount) && amount > 0) return Math.round(amount * 100);
  }

  return extractAmountCents(lines);
}

function extractTngRecipientText(lines: string[]) {
  const values: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!TNG_RECIPIENT_LABEL_PATTERN.test(line)) continue;

    const inlineValue = stripLabel(line, TNG_RECIPIENT_LABEL_PATTERN);
    if (inlineValue && !looksLikeTngLabelOnly(inlineValue)) {
      values.push(inlineValue);
      continue;
    }

    const nextLine = lines[index + 1];
    if (nextLine && !looksLikeTngLabelOnly(nextLine)) {
      values.push(nextLine);
    }
  }

  return [...new Set(values)].join(" ");
}

function extractTngTimestampText(lines: string[]) {
  const labeledTimestamp = extractLabeledValue(lines, TNG_TIMESTAMP_LABEL_PATTERN);
  if (labeledTimestamp && DATE_PATTERN.test(labeledTimestamp)) return labeledTimestamp;

  return extractTimestampText(lines);
}

function extractLabeledValue(lines: string[], labelPattern: RegExp) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!labelPattern.test(line)) continue;

    const inlineValue = stripLabel(line, labelPattern);
    if (inlineValue) return inlineValue;

    const nextLine = lines[index + 1];
    if (nextLine && !looksLikeLabelOnly(nextLine)) return nextLine;
  }

  return "";
}

function extractTimestampText(lines: string[]) {
  const labeledTimestamp = extractLabeledValue(lines, TIMESTAMP_LABEL_PATTERN);
  if (labeledTimestamp && DATE_PATTERN.test(labeledTimestamp)) return labeledTimestamp;

  return lines.find((line) => DATE_PATTERN.test(line)) ?? "";
}

const DATE_PATTERN =
  /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}\s+[A-Z][a-z]{2,8}\s+\d{2,4})\b/;

function stripLabel(line: string, labelPattern: RegExp) {
  return line
    .replace(labelPattern, "")
    .replace(/^[:\-\s]+/, "")
    .replace(/^[#:\-\s]+/, "")
    .trim();
}

function looksLikeLabelOnly(line: string) {
  return (
    RECIPIENT_LABEL_PATTERN.test(line) ||
    REFERENCE_LABEL_PATTERN.test(line) ||
    TIMESTAMP_LABEL_PATTERN.test(line) ||
    AMOUNT_LABEL_PATTERN.test(line)
  );
}

function looksLikeTngLabelOnly(line: string) {
  return (
    looksLikeLabelOnly(line) ||
    TNG_RECIPIENT_LABEL_PATTERN.test(line) ||
    TNG_REFERENCE_LABEL_PATTERN.test(line) ||
    TNG_TIMESTAMP_LABEL_PATTERN.test(line) ||
    TNG_FOOTER_PATTERN.test(line) ||
    /^-?\s*RM\s*[0-9]/i.test(line)
  );
}

function getConfidenceNotes({
  rawOcrText,
  amountCents,
  recipientText,
  transactionReference,
  timestampText,
  requireTransactionReference = true,
}: {
  rawOcrText: string;
  amountCents: number | null;
  recipientText: string;
  transactionReference: string;
  timestampText: string;
  requireTransactionReference?: boolean;
}) {
  const notes: string[] = [];

  if (rawOcrText.length < 40) {
    notes.push("OCR text is very short.");
  }

  if (amountCents === null) {
    notes.push("Missing transfer amount.");
  }

  if (!recipientText) {
    notes.push("Missing recipient text.");
  }

  if (requireTransactionReference && !transactionReference) {
    notes.push("Missing transaction reference.");
  }

  if (!timestampText) {
    notes.push("Missing transfer timestamp.");
  }

  return notes;
}
