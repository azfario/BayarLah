export type ReminderFrequencyUnitValue = "HOURS" | "DAYS";

type WhatsAppReminderMessageInput = {
  friendName: string;
  collectorName: string;
  amountLabel: string;
  expenseDescription: string;
  duitNowIdType?: string | null;
  duitNowIdValue?: string | null;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const DUITNOW_ID_LABELS: Record<string, string> = {
  PHONE: "phone number",
  NRIC: "NRIC",
  PASSPORT: "passport",
  BUSINESS_REGISTRATION: "business registration",
  ARMY_POLICE: "army / police ID",
};

export function toOpenWaChatId(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) {
    throw new Error("Recipient phone number is missing.");
  }

  return `${digits}@c.us`;
}

export function buildWhatsAppReminderMessage({
  friendName,
  collectorName,
  amountLabel,
  expenseDescription,
  duitNowIdType,
  duitNowIdValue,
}: WhatsAppReminderMessageInput) {
  const duitNowLabel = DUITNOW_ID_LABELS[duitNowIdType ?? ""] ?? "ID";
  const duitNowLine = duitNowIdValue
    ? `DuitNow ${duitNowLabel}: ${duitNowIdValue}`
    : "DuitNow details are attached with the QR.";

  return [
    `Hi ${friendName}, ${collectorName} sent you a BayarLah payment reminder.`,
    `Amount owed: ${amountLabel}`,
    `Expense: ${expenseDescription}`,
    duitNowLine,
    "The DuitNow QR is attached for payment. Thank you.",
  ].join("\n");
}

export function getNextReminderAtFromCadence(
  value: number,
  unit: ReminderFrequencyUnitValue,
  now = new Date()
) {
  const intervalMs = unit === "HOURS" ? value * HOUR_MS : value * DAY_MS;
  return new Date(now.getTime() + intervalMs);
}

export function getRetryReminderAt(now = new Date(), retryDelayMs = 15 * 60 * 1000) {
  return new Date(now.getTime() + retryDelayMs);
}
