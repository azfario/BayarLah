export const DUITNOW_ID_TYPES = [
  { value: "PHONE", label: "Phone number" },
  { value: "NRIC", label: "NRIC" },
  { value: "PASSPORT", label: "Passport" },
  { value: "BUSINESS_REGISTRATION", label: "Business registration" },
  { value: "ARMY_POLICE", label: "Army / police" },
] as const;

export type DuitNowIdTypeValue = (typeof DUITNOW_ID_TYPES)[number]["value"];

const DUITNOW_ID_PLACEHOLDERS: Record<DuitNowIdTypeValue, string> = {
  PHONE: "+60123456789",
  NRIC: "900101145678",
  PASSPORT: "A12345678",
  BUSINESS_REGISTRATION: "202301234567",
  ARMY_POLICE: "12345678",
};

export function isDuitNowIdType(value: string): value is DuitNowIdTypeValue {
  return DUITNOW_ID_TYPES.some((type) => type.value === value);
}

export function getDuitNowIdPlaceholder(type: string) {
  return isDuitNowIdType(type)
    ? DUITNOW_ID_PLACEHOLDERS[type]
    : "Select an ID type";
}

export function normalizeMalaysianNric(value: string) {
  const trimmed = value.trim();
  if (!trimmed || !/^[\d\s-]+$/.test(trimmed)) return "";

  const digits = trimmed.replace(/[\s-]/g, "");
  return /^\d{12}$/.test(digits) ? digits : "";
}
