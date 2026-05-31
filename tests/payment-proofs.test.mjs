import assert from "node:assert/strict";
import test from "node:test";
import { parseBankReceiptOcrText } from "../lib/payment-proofs.ts";

test("parses amount, recipient, reference, and timestamp from a bank receipt", () => {
  const parsed = parseBankReceiptOcrText(`
Maybank2u
Transfer Successful
Recipient Name: AHMAD BIN ALI
Recipient DuitNow ID: 0123456789
Amount: RM 50.00
Reference No: MBB123456789
Transaction Date: 31/05/2026 09:41 PM
  `);

  assert.equal(parsed.amountCents, 5000);
  assert.equal(parsed.recipientText, "AHMAD BIN ALI");
  assert.equal(parsed.transactionReference, "MBB123456789");
  assert.equal(parsed.timestampText, "31/05/2026 09:41 PM");
  assert.deepEqual(parsed.confidenceNotes, []);
});

test("flags a missing recipient", () => {
  const parsed = parseBankReceiptOcrText(`
CIMB OCTO
Transfer Successful
Amount: RM 22.50
Transaction ID: CIMB998877
Date/Time: 31/05/2026 10:02 PM
  `);

  assert.equal(parsed.amountCents, 2250);
  assert.equal(parsed.recipientText, "");
  assert.ok(parsed.confidenceNotes.includes("Missing recipient text."));
});

test("flags a missing amount", () => {
  const parsed = parseBankReceiptOcrText(`
TNG eWallet
Payment Successful
Recipient: BAYARLAH COLLECTOR
Reference: TNG123456
Payment Date: 31 May 2026 20:10
  `);

  assert.equal(parsed.amountCents, null);
  assert.equal(parsed.recipientText, "BAYARLAH COLLECTOR");
  assert.ok(parsed.confidenceNotes.includes("Missing transfer amount."));
});

test("flags low-confidence OCR text", () => {
  const parsed = parseBankReceiptOcrText("RM 50 blur");

  assert.equal(parsed.amountCents, 5000);
  assert.ok(parsed.confidenceNotes.includes("OCR text is very short."));
  assert.ok(parsed.confidenceNotes.includes("Missing recipient text."));
  assert.ok(parsed.confidenceNotes.includes("Missing transaction reference."));
});
