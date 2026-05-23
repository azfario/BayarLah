export type ProportionalBase = {
  key: string;
  baseCents: number;
};

export function distributeProportionally(
  adjustmentCents: number,
  bases: ProportionalBase[]
) {
  const result = new Map<string, number>();
  const nonZeroBases = bases.filter((base) => base.baseCents > 0);

  for (const base of bases) result.set(base.key, 0);
  if (adjustmentCents === 0 || nonZeroBases.length === 0) return result;

  const sign = adjustmentCents < 0 ? -1 : 1;
  const absoluteAdjustment = Math.abs(adjustmentCents);
  const totalBase = nonZeroBases.reduce((sum, base) => sum + base.baseCents, 0);
  let assigned = 0;

  const shares = nonZeroBases.map((base) => {
    const exactShare = (absoluteAdjustment * base.baseCents) / totalBase;
    const floorShare = Math.floor(exactShare);
    assigned += floorShare;

    return {
      key: base.key,
      floorShare,
      remainder: exactShare - floorShare,
    };
  });

  shares.sort((a, b) => b.remainder - a.remainder || a.key.localeCompare(b.key));

  let remaining = absoluteAdjustment - assigned;
  for (const share of shares) {
    const extra = remaining > 0 ? 1 : 0;
    result.set(share.key, sign * (share.floorShare + extra));
    remaining -= extra;
  }

  return result;
}

export function distributeEvenly(totalCents: number, keys: string[]) {
  const result = new Map<string, number>();
  if (keys.length === 0) return result;

  const baseCents = Math.floor(totalCents / keys.length);
  let remaining = totalCents - baseCents * keys.length;

  for (const key of keys) {
    const extra = remaining > 0 ? 1 : 0;
    result.set(key, baseCents + extra);
    remaining -= extra;
  }

  return result;
}
