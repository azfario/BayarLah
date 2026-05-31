import assert from "node:assert/strict";
import test from "node:test";
import { Buffer } from "node:buffer";
import {
  handleInboundPaymentProofImage,
  hashPaymentProofImage,
} from "../lib/payment-proof-inbound.ts";

test("handles a fake inbound image event through OCR parsing and matching", async () => {
  const bytes = Buffer.from("fake-image-bytes");
  const calls = [];

  const result = await handleInboundPaymentProofImage(
    {
      collectorId: "collector_1",
      debtorPhone: "+60123456789",
      messageId: "message_1",
      bytes,
      contentType: "image/jpeg",
    },
    {
      uploadImage: async (input) => {
        calls.push(["upload", input.imageHash]);
        return `collector_1/60123456789/${input.imageHash}.jpg`;
      },
      extractOcrText: async () => `
Maybank2u
Transfer Successful
Recipient Name: BAYARLAH COLLECTOR
Amount: RM 50.00
Reference No: MBB123456789
Transaction Date: 31/05/2026 09:41 PM
      `,
      createMatchedProof: async (input) => {
        calls.push(["match", input.parsedAmountCents, input.parsedRecipient]);
        return {
          decision: {
            status: "AUTO_CONFIRMED",
            expenseShareId: "share_1",
            reviewReason: null,
            rejectedReason: null,
          },
          paymentProofId: "proof_1",
        };
      },
    }
  );

  assert.equal(calls[0][0], "upload");
  assert.equal(calls[0][1], hashPaymentProofImage(bytes));
  assert.deepEqual(calls[1], ["match", 5000, "BAYARLAH COLLECTOR"]);
  assert.equal(result.decision.status, "AUTO_CONFIRMED");
  assert.equal(result.paymentProofId, "proof_1");
});
