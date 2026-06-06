import assert from "node:assert/strict";
import test from "node:test";
import { buildWhatsAppReminderMessage } from "../lib/whatsapp.ts";

test("builds the friendly DuitNow reminder message", () => {
  const message = buildWhatsAppReminderMessage({
    friendName: "Aina",
    collectorName: "Hakim",
    amountLabel: "RM12.50",
    expenseDescription: "Lunch",
    paymentCode: "48273195",
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
      "Enter payment code:",
      "48273195",
      "in the transfer Reference/Remark field.",
      "",
      "After paying, send the payment receipt image back to this chat reply.",
    ].join("\n")
  );
});

test("reuses the supplied payment code in repeated reminder messages", () => {
  const input = {
    friendName: "Aina",
    collectorName: "Hakim",
    amountLabel: "RM12.50",
    expenseDescription: "Lunch",
    paymentCode: "48273195",
    duitNowIdType: "PHONE",
    duitNowIdValue: "0123456789",
  };

  assert.equal(
    buildWhatsAppReminderMessage(input),
    buildWhatsAppReminderMessage(input)
  );
});
