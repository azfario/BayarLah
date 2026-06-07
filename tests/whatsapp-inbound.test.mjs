import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyWhatsappMessage,
  getWhatsappMessageId,
} from "../lib/whatsapp-inbound.ts";

test("rejects a nested outgoing reminder image", () => {
  const payload = {
    event: "message.received",
    data: {
      message: {
        id: "outgoing-reminder",
        direction: "outgoing",
        type: "image",
        mimetype: "image/png",
      },
    },
  };

  assert.equal(classifyWhatsappMessage(payload), "OUTGOING");
});

test("rejects outgoing messages when fromMe is nested", () => {
  assert.equal(
    classifyWhatsappMessage({
      data: { message: { fromMe: true, type: "image", hasMedia: true } },
    }),
    "OUTGOING"
  );
});

test("accepts only explicitly inbound images", () => {
  assert.equal(
    classifyWhatsappMessage({
      data: {
        id: "receipt-1",
        direction: "incoming",
        type: "image",
        mimetype: "image/jpeg",
      },
    }),
    "INBOUND_IMAGE"
  );
});

test("skips inbound text and ambiguous images", () => {
  assert.equal(
    classifyWhatsappMessage({ direction: "incoming", type: "text" }),
    "NOT_IMAGE"
  );
  assert.equal(
    classifyWhatsappMessage({ type: "image", mimetype: "image/jpeg" }),
    "AMBIGUOUS"
  );
});

test("extracts a stable message id from nested webhook data", () => {
  assert.equal(
    getWhatsappMessageId({
      id: "webhook-envelope-id",
      event: "message.received",
      data: { message: { _serialized: "false_60123456789@c.us_ABC" } },
    }),
    "false_60123456789@c.us_ABC"
  );
});
