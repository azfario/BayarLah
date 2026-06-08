import { randomInt } from "node:crypto";

const DIGIT_PAYMENT_CODE_PATTERN = /(?:^|\D)((?:\d[\s-]*){8})(?!\d)/;
const LEGACY_PAYMENT_CODE_PATTERN =
  /(?:^|[^A-Z0-9])B[\s-]*L[\s-]*((?:\d[\s-]*){8})(?![A-Z0-9])/i;

export function generatePaymentCode() {
  return randomInt(0, 100_000_000).toString().padStart(8, "0");
}

export function extractPaymentCode(value: string) {
  const legacyMatch = value.match(LEGACY_PAYMENT_CODE_PATTERN);
  if (legacyMatch) {
    return legacyMatch[1].replace(/\D/g, "");
  }

  const match = value.match(DIGIT_PAYMENT_CODE_PATTERN);
  if (!match) return "";

  return match[1].replace(/\D/g, "");
}
