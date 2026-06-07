export function normalizeMalaysianPhone(value: string) {
  const compact = value.trim().replace(/[^\d+]/g, "");
  if (!compact) return "";

  if (compact.startsWith("+")) {
    return `+${compact.slice(1).replace(/\D/g, "")}`;
  }

  const digits = compact.replace(/\D/g, "");
  if (digits.startsWith("60")) return `+${digits}`;
  if (digits.startsWith("0")) return `+6${digits}`;
  return `+60${digits}`;
}

export function isValidMalaysianMobilePhone(value: string) {
  return /^\+601\d{8,9}$/.test(value);
}

export function normalizeMalaysianMobilePhone(value: string) {
  const trimmed = value.trim();
  if (!trimmed || !/^\+?[\d\s()-]+$/.test(trimmed)) return "";
  return normalizeMalaysianPhone(trimmed);
}
