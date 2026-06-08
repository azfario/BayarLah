import assert from "node:assert/strict";
import test from "node:test";
import { buildPaymentCodeMessage, buildWhatsAppReminderMessage } from "../lib/whatsapp.ts";

test("builds the friendly DuitNow reminder message", () => {
  const message = buildWhatsAppReminderMessage({
    friendName: "Aina",
    collectorName: "Hakim",
    amountLabel: "RM12.50",
    expenseDescription: "Lunch",
    duitNowIdType: "PHONE",
    duitNowIdValue: "0123456789",
  });

  assert.equal(
    message,
    [
      "Hi Aina, BayarLah is sending this reminder on behalf of Hakim.",
      "",
      "Amount owed: RM12.50",
      "Reason: Lunch",
      "",
      "Please pay using the DuitNow QR attached OR send to",
      "DuitNow phone number: 0123456789",
      "",
      "After paying, send the payment receipt image (no PDF, just screenshot or the receipt image) back to this chat reply.",
    ].join("\n")
  );
});

test("builds the payment code message", () => {
  assert.equal(
    buildPaymentCodeMessage("48273195"),
    "Payment code: *48273195*\nEnter this in the transfer Reference/Remark field."
  );
});
