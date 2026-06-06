import { randomInt } from "node:crypto";

const PAYMENT_CODE_PATTERN =
  /(?:^|[^A-Z0-9])B[\s-]*L[\s-]*((?:\d[\s-]*){8})(?![A-Z0-9])/i;

export function generatePaymentCode() {
  return `BL${randomInt(0, 100_000_000).toString().padStart(8, "0")}`;
}

export function extractPaymentCode(value: string) {
  const match = value.match(PAYMENT_CODE_PATTERN);
  if (!match) return "";

  return `BL${match[1].replace(/\D/g, "")}`;
}
