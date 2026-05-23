export type ParsedReceiptItem = {
  name: string;
  quantity: number;
  unitAmountCents: number;
  totalAmountCents: number;
};

export type ParsedReceiptDraft = {
  merchantName: string;
  receiptDate: string;
  items: ParsedReceiptItem[];
  subtotalCents: number;
  taxCents: number;
  serviceChargeCents: number;
  roundingCents: number;
  totalCents: number;
};

export type ReceiptParseState = {
  error?: string;
  draft?: ParsedReceiptDraft;
};

export type ReceiptSaveState = {
  error?: string;
};
