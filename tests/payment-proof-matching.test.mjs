import assert from "node:assert/strict";
import test from "node:test";
import { decidePaymentProofMatch } from "../lib/payment-proof-match-rules.ts";

const baseInput = {
  amountCents: 5000,
  recipientText: "Recipient Name: BayarLah Collector",
  transactionReference: "TXN123",
  collectorDuitNowRecipientName: "BayarLah Collector",
  collectorDuitNowIdValue: "0123456789",
  openShares: [{ id: "share_1", owedAmountCents: 5000 }],
  isDuplicateImage: false,
  isDuplicateTransactionReference: false,
  confidenceNotes: [],
};

test("auto-confirms when one unpaid share exactly matches amount and recipient", () => {
  const decision = decidePaymentProofMatch(baseInput);

  assert.equal(decision.status, "AUTO_CONFIRMED");
  assert.equal(decision.expenseShareId, "share_1");
  assert.equal(decision.reviewReason, null);
});

test("keeps multiple same-amount debts pending review", () => {
  const decision = decidePaymentProofMatch({
    ...baseInput,
    openShares: [
      { id: "share_1", owedAmountCents: 5000 },
      { id: "share_2", owedAmountCents: 5000 },
    ],
  });

  assert.equal(decision.status, "PENDING_REVIEW");
  assert.equal(decision.expenseShareId, null);
  assert.equal(decision.reviewReason, "Multiple unpaid debts match the transfer amount.");
});

test("keeps proofs with no amount match pending review", () => {
  const decision = decidePaymentProofMatch({
    ...baseInput,
    amountCents: 4999,
  });

  assert.equal(decision.status, "PENDING_REVIEW");
  assert.equal(decision.expenseShareId, null);
  assert.equal(decision.reviewReason, "No unpaid debt matches the transfer amount.");
});

test("keeps recipient mismatches pending review even when amount matches", () => {
  const decision = decidePaymentProofMatch({
    ...baseInput,
    recipientText: "Recipient Name: Someone Else",
  });

  assert.equal(decision.status, "PENDING_REVIEW");
  assert.equal(decision.expenseShareId, "share_1");
  assert.equal(
    decision.reviewReason,
    "Receipt recipient does not match the collector's DuitNow details."
  );
});

test("rejects duplicate image hashes", () => {
  const decision = decidePaymentProofMatch({
    ...baseInput,
    isDuplicateImage: true,
  });

  assert.equal(decision.status, "DUPLICATE_REJECTED");
  assert.equal(decision.rejectedReason, "Duplicate receipt image.");
});

test("rejects duplicate transaction references", () => {
  const decision = decidePaymentProofMatch({
    ...baseInput,
    isDuplicateTransactionReference: true,
  });

  assert.equal(decision.status, "DUPLICATE_REJECTED");
  assert.equal(decision.rejectedReason, "Duplicate transaction reference.");
});
