export function parseMoneyToCents(value: FormDataEntryValue | string | null) {
  if (typeof value !== "string") return null;

  const amount = Number(value.trim().replace(/,/g, ""));
  if (!Number.isFinite(amount)) return null;

  return Math.round(amount * 100);
}

export function centsToMoneyString(cents: number) {
  return (cents / 100).toFixed(2);
}

export function formatMoney(
  value: number | string | { toString(): string } | null | undefined
) {
  const amount = Number(value?.toString() ?? 0);
  return `RM${Number.isFinite(amount) ? amount.toFixed(2) : "0.00"}`;
}
