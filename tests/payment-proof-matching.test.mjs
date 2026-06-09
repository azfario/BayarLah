import assert from "node:assert/strict";
import test from "node:test";
import { decidePaymentProofMatch } from "../lib/payment-proof-match-rules.ts";

const baseInput = {
  amountCents: 5000,
  recipientText: "Recipient Name: BayarLah Collector",
  transactionReference: "TXN123",
  paymentCode: "",
  collectorDuitNowRecipientName: "BayarLah Collector",
  collectorDuitNowIdValue: "0123456789",
  openShares: [
    { id: "share_1", owedAmountCents: 5000, paymentCode: "48273195" },
  ],
  remindedShareIds: [],
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

test("keeps unresolved debtor identity pending review", () => {
  const decision = decidePaymentProofMatch({
    ...baseInput,
    debtorIdentityReviewReason: "Could not resolve debtor identity.",
  });

  assert.equal(decision.status, "PENDING_REVIEW");
  assert.equal(decision.expenseShareId, null);
  assert.equal(decision.reviewReason, "Could not resolve debtor identity.");
});

test("can auto-confirm without a transaction reference when parser has no confidence notes", () => {
  const decision = decidePaymentProofMatch({
    ...baseInput,
    transactionReference: "",
    isDuplicateTransactionReference: false,
    confidenceNotes: [],
  });

  assert.equal(decision.status, "AUTO_CONFIRMED");
  assert.equal(decision.expenseShareId, "share_1");
});

test("payment code selects one debt when multiple unpaid debts have the same amount", () => {
  const decision = decidePaymentProofMatch({
    ...baseInput,
    paymentCode: "48273195",
    openShares: [
      { id: "share_1", owedAmountCents: 5000, paymentCode: "48273195" },
      { id: "share_2", owedAmountCents: 5000, paymentCode: "12345678" },
    ],
  });

  assert.equal(decision.status, "AUTO_CONFIRMED");
  assert.equal(decision.expenseShareId, "share_1");
});

test("payment code and exact amount bypass recipient and confidence checks", () => {
  const decision = decidePaymentProofMatch({
    ...baseInput,
    paymentCode: "48273195",
    recipientText: "",
    confidenceNotes: [
      "Missing recipient text.",
      "Missing transaction reference.",
      "Missing transfer timestamp.",
    ],
  });

  assert.equal(decision.status, "AUTO_CONFIRMED");
  assert.equal(decision.expenseShareId, "share_1");
});

test("keeps an unknown or paid-debt payment code pending review", () => {
  const decision = decidePaymentProofMatch({
    ...baseInput,
    paymentCode: "00000000",
  });

  assert.equal(decision.status, "PENDING_REVIEW");
  assert.equal(decision.expenseShareId, null);
  assert.equal(
    decision.reviewReason,
    "Payment code does not match an unpaid debt."
  );
});

test("keeps a coded proof with no amount pending review", () => {
  const decision = decidePaymentProofMatch({
    ...baseInput,
    paymentCode: "48273195",
    amountCents: null,
  });

  assert.equal(decision.status, "PENDING_REVIEW");
  assert.equal(decision.expenseShareId, "share_1");
  assert.equal(decision.reviewReason, "Missing transfer amount.");
});

test("keeps a coded proof with the wrong amount pending review", () => {
  const decision = decidePaymentProofMatch({
    ...baseInput,
    paymentCode: "48273195",
    amountCents: 4999,
  });

  assert.equal(decision.status, "PENDING_REVIEW");
  assert.equal(decision.expenseShareId, "share_1");
  assert.equal(
    decision.reviewReason,
    "Transfer amount does not match the coded debt."
  );
});

test("duplicate protection runs before payment-code matching", () => {
  const decision = decidePaymentProofMatch({
    ...baseInput,
    paymentCode: "48273195",
    isDuplicateImage: true,
  });

  assert.equal(decision.status, "DUPLICATE_REJECTED");
  assert.equal(decision.rejectedReason, "Duplicate receipt image.");
});

// LID-based auto-match tests

test("auto-confirms via reminded share even when OCR parsed a wrong payment code", () => {
  // Reproduces: bank Reference ID "82573501" parsed as code, real code "54033537" not on receipt.
  const decision = decidePaymentProofMatch({
    ...baseInput,
    amountCents: 1300,
    paymentCode: "82573501",
    recipientText: "Name",
    openShares: [{ id: "share_1", owedAmountCents: 1300, paymentCode: "54033537" }],
    remindedShareIds: ["share_1"],
  });

  assert.equal(decision.status, "AUTO_CONFIRMED");
  assert.equal(decision.expenseShareId, "share_1");
  assert.equal(decision.reviewReason, null);
});

test("falls through to review when reminded share amount does not match receipt", () => {
  const decision = decidePaymentProofMatch({
    ...baseInput,
    amountCents: 1299,
    openShares: [{ id: "share_1", owedAmountCents: 1300, paymentCode: "54033537" }],
    remindedShareIds: ["share_1"],
  });

  assert.equal(decision.status, "PENDING_REVIEW");
  assert.equal(decision.expenseShareId, null);
  assert.equal(decision.reviewReason, "No unpaid debt matches the transfer amount.");
});

test("LID-reminded share already paid (absent from openShares) does not auto-confirm", () => {
  // The reminded share id is not in openShares (already paid), so remindedOpen is empty.
  const decision = decidePaymentProofMatch({
    ...baseInput,
    amountCents: 1300,
    openShares: [],
    remindedShareIds: ["share_paid"],
  });

  assert.equal(decision.status, "PENDING_REVIEW");
  assert.equal(decision.reviewReason, "No unpaid debt matches the transfer amount.");
});

test("auto-confirms one open reminded share when another reminded debt was already paid", () => {
  // Real case: debtor reminded about two debts (RM0.50 open, RM45.69 paid); the paid
  // one is absent from openShares. OCR mis-parsed the date "20260609" as a payment code.
  const decision = decidePaymentProofMatch({
    ...baseInput,
    amountCents: 50,
    paymentCode: "20260609",
    recipientText: "Name",
    openShares: [{ id: "share_open", owedAmountCents: 50, paymentCode: "83008157" }],
    remindedShareIds: ["share_open", "share_paid"],
  });

  assert.equal(decision.status, "AUTO_CONFIRMED");
  assert.equal(decision.expenseShareId, "share_open");
  assert.equal(decision.reviewReason, null);
});

test("amount disambiguates when multiple reminded debts are open", () => {
  const decision = decidePaymentProofMatch({
    ...baseInput,
    amountCents: 50,
    paymentCode: "20260609",
    openShares: [
      { id: "share_a", owedAmountCents: 50, paymentCode: "83008157" },
      { id: "share_b", owedAmountCents: 4569, paymentCode: "11112222" },
    ],
    remindedShareIds: ["share_a", "share_b"],
  });

  assert.equal(decision.status, "AUTO_CONFIRMED");
  assert.equal(decision.expenseShareId, "share_a");
});

test("multiple reminded debts with the same amount stay pending", () => {
  const decision = decidePaymentProofMatch({
    ...baseInput,
    amountCents: 50,
    openShares: [
      { id: "share_a", owedAmountCents: 50, paymentCode: "83008157" },
      { id: "share_b", owedAmountCents: 50, paymentCode: "11112222" },
    ],
    remindedShareIds: ["share_a", "share_b"],
  });

  assert.equal(decision.status, "PENDING_REVIEW");
  assert.equal(decision.expenseShareId, null);
  assert.equal(decision.reviewReason, "Multiple unpaid debts match the transfer amount.");
});

test("duplicate image still wins over a valid LID + amount match", () => {
  const decision = decidePaymentProofMatch({
    ...baseInput,
    amountCents: 5000,
    openShares: [{ id: "share_1", owedAmountCents: 5000, paymentCode: "54033537" }],
    remindedShareIds: ["share_1"],
    isDuplicateImage: true,
  });

  assert.equal(decision.status, "DUPLICATE_REJECTED");
  assert.equal(decision.rejectedReason, "Duplicate receipt image.");
});
