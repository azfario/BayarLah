export type OpenPaymentShare = {
  id: string;
  owedAmountCents: number;
};

export type PaymentProofMatchInput = {
  amountCents: number | null;
  recipientText: string;
  transactionReference: string;
  collectorDuitNowRecipientName: string | null;
  collectorDuitNowIdValue: string | null;
  openShares: OpenPaymentShare[];
  isDuplicateImage: boolean;
  isDuplicateTransactionReference: boolean;
  confidenceNotes: string[];
};

export type PaymentProofMatchDecision = {
  status: "PENDING_REVIEW" | "AUTO_CONFIRMED" | "DUPLICATE_REJECTED";
  expenseShareId: string | null;
  reviewReason: string | null;
  rejectedReason: string | null;
};

export function decidePaymentProofMatch(
  input: PaymentProofMatchInput
): PaymentProofMatchDecision {
  if (input.isDuplicateImage) {
    return duplicateDecision("Duplicate receipt image.");
  }

  if (input.isDuplicateTransactionReference) {
    return duplicateDecision("Duplicate transaction reference.");
  }

  if (input.amountCents === null) {
    return pendingDecision(null, "Missing transfer amount.");
  }

  const amountMatches = input.openShares.filter(
    (share) => share.owedAmountCents === input.amountCents
  );

  if (amountMatches.length === 0) {
    return pendingDecision(null, "No unpaid debt matches the transfer amount.");
  }

  if (amountMatches.length > 1) {
    return pendingDecision(null, "Multiple unpaid debts match the transfer amount.");
  }

  const matchedShare = amountMatches[0];

  if (!recipientMatchesCollector(input)) {
    return pendingDecision(
      matchedShare.id,
      "Receipt recipient does not match the collector's DuitNow details."
    );
  }

  if (input.confidenceNotes.length > 0) {
    return pendingDecision(matchedShare.id, input.confidenceNotes.join(" "));
  }

  return {
    status: "AUTO_CONFIRMED",
    expenseShareId: matchedShare.id,
    reviewReason: null,
    rejectedReason: null,
  };
}

function recipientMatchesCollector(input: PaymentProofMatchInput) {
  const parsedRecipient = normalizeRecipient(input.recipientText);
  if (!parsedRecipient) return false;

  const expectedValues = [
    input.collectorDuitNowRecipientName,
    input.collectorDuitNowIdValue,
  ]
    .map(normalizeRecipient)
    .filter((value) => value.length >= 4);

  return expectedValues.some((expected) => parsedRecipient.includes(expected));
}

function duplicateDecision(reason: string): PaymentProofMatchDecision {
  return {
    status: "DUPLICATE_REJECTED",
    expenseShareId: null,
    reviewReason: null,
    rejectedReason: reason,
  };
}

function pendingDecision(
  expenseShareId: string | null,
  reviewReason: string
): PaymentProofMatchDecision {
  return {
    status: "PENDING_REVIEW",
    expenseShareId,
    reviewReason,
    rejectedReason: null,
  };
}

function normalizeRecipient(value: string | null) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
