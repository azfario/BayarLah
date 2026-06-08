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

  assert.equal(parsed.provider, "GENERIC_BANK");
  assert.equal(parsed.amountCents, 5000);
  assert.equal(parsed.recipientText, "AHMAD BIN ALI");
  assert.equal(parsed.transactionReference, "MBB123456789");
  assert.equal(parsed.paymentCode, "");
  assert.equal(parsed.timestampText, "31/05/2026 09:41 PM");
  assert.deepEqual(parsed.confidenceNotes, []);
});

test("parses TNG details receipt fields", () => {
  const parsed = parseBankReceiptOcrText(`
Touch 'n Go eWallet
Transferred
-RM0.50
Transfer To
HASIF BIN HASSAN
Payment Details
BayarLah Collector
Date/Time
31/05/2026 09:41 PM
Wallet Ref
202605310001
Transaction No.
TNG123456789
  `);

  assert.equal(parsed.provider, "TNG_EWALLET");
  assert.equal(parsed.amountCents, 50);
  assert.equal(parsed.recipientText, "HASIF BIN HASSAN BayarLah Collector");
  assert.equal(parsed.transactionReference, "202605310001");
  assert.equal(parsed.timestampText, "31/05/2026 09:41 PM");
  assert.deepEqual(parsed.confidenceNotes, []);
});

test("parses TNG share receipt without requiring a reference", () => {
  const parsed = parseBankReceiptOcrText(`
TNG eWallet
Transferred
RM 0.50
Receiver
BayarLah Collector
Remark
0123456789
Date & Time
31/05/2026 09:41 PM
  `);

  assert.equal(parsed.provider, "TNG_EWALLET");
  assert.equal(parsed.amountCents, 50);
  assert.equal(parsed.recipientText, "BayarLah Collector 0123456789");
  assert.equal(parsed.transactionReference, "");
  assert.equal(parsed.timestampText, "31/05/2026 09:41 PM");
  assert.deepEqual(parsed.confidenceNotes, []);
});

test("parses and normalizes a payment code without treating it as a transaction reference", () => {
  const parsed = parseBankReceiptOcrText(`
Maybank2u
Transfer Successful
Recipient Name: AHMAD BIN ALI
Amount: RM 50.00
Reference: 4827-3195
Transaction Date: 31/05/2026 09:41 PM
  `);

  assert.equal(parsed.paymentCode, "48273195");
  assert.equal(parsed.transactionReference, "");
  assert.ok(parsed.confidenceNotes.includes("Missing transaction reference."));
});

test("keeps a real transaction reference when the receipt also has a payment code", () => {
  const parsed = parseBankReceiptOcrText(`
CIMB OCTO
Transfer Successful
Recipient Name: AHMAD BIN ALI
Amount: RM 50.00
Transaction ID: CIMB998877
Recipient Reference: 48273195
Date/Time: 31/05/2026 09:41 PM
  `);

  assert.equal(parsed.paymentCode, "48273195");
  assert.equal(parsed.transactionReference, "CIMB998877");
});

test("extracts a payment code from a TNG remark", () => {
  const parsed = parseBankReceiptOcrText(`
TNG eWallet
Transferred
RM 50.00
Receiver
AHMAD BIN ALI
Remark
4827-3195
Date & Time
31/05/2026 09:41 PM
  `);

  assert.equal(parsed.paymentCode, "48273195");
  assert.equal(parsed.transactionReference, "");
  assert.deepEqual(parsed.confidenceNotes, []);
});

test("extracts TNG stacked labels before receipt values", () => {
  const parsed = parseBankReceiptOcrText(`
21:474
•ll 4G
RM 0.50
Transferred
Receiver
Remark
Date & Time
MUTSANNA
BIN ZULKEFLE
28273625
07/06/2026 21:47:32
Panasonic
Beat the Blaze,
Save More Today
eWallet Rebate
Done
  `);

  assert.equal(parsed.provider, "TNG_EWALLET");
  assert.equal(parsed.amountCents, 50);
  assert.equal(parsed.recipientText, "MUTSANNA BIN ZULKEFLE");
  assert.equal(parsed.paymentCode, "28273625");
  assert.equal(parsed.timestampText, "07/06/2026 21:47:32");
  assert.deepEqual(parsed.confidenceNotes, []);
});

test("keeps supporting previously issued BL payment codes", () => {
  const parsed = parseBankReceiptOcrText(`
Maybank2u
Transfer Successful
Recipient Name: AHMAD BIN ALI
Amount: RM 50.00
Recipient Reference: BL48273195
Transaction Date: 31/05/2026 09:41 PM
  `);

  assert.equal(parsed.paymentCode, "48273195");
});

test("does not treat an unrelated eight-digit number as a payment code", () => {
  const parsed = parseBankReceiptOcrText(`
Maybank2u
Transfer Successful
Recipient Name: AHMAD BIN ALI
Recipient Account: 48273195
Amount: RM 50.00
Transaction ID: CIMB998877
Transaction Date: 31/05/2026 09:41 PM
  `);

  assert.equal(parsed.paymentCode, "");
});

test("parses TNG receipt before ad footer text", () => {
  const parsed = parseBankReceiptOcrText(`
TNG eWallet
Transferred
RM 0.50
Receiver
BayarLah Collector
Remark
0123456789
Date & Time
31/05/2026 09:41 PM
Get up to RM10 cashback today
Receiver
Advertiser Name
  `);

  assert.equal(parsed.provider, "TNG_EWALLET");
  assert.equal(parsed.amountCents, 50);
  assert.equal(parsed.recipientText, "BayarLah Collector 0123456789");
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
