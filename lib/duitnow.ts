export const DUITNOW_ID_TYPES = [
  { value: "PHONE", label: "Phone number" },
  { value: "NRIC", label: "NRIC" },
  { value: "PASSPORT", label: "Passport" },
  { value: "BUSINESS_REGISTRATION", label: "Business registration" },
  { value: "ARMY_POLICE", label: "Army / police" },
] as const;

export type DuitNowIdTypeValue = (typeof DUITNOW_ID_TYPES)[number]["value"];

export function isDuitNowIdType(value: string): value is DuitNowIdTypeValue {
  return DUITNOW_ID_TYPES.some((type) => type.value === value);
}
