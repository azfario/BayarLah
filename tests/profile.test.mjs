import assert from "node:assert/strict";
import test from "node:test";
import { isProfileComplete } from "../lib/profile.ts";

test("profile completion no longer requires a personal WhatsApp link", () => {
  assert.equal(
    isProfileComplete({
      fullName: "Hakim",
      phone: "+60123456789",
      duitNowIdType: "PHONE",
      duitNowIdValue: "0123456789",
      duitNowRecipientName: "HAKIM",
      duitNowQrUrl: "https://example.com/qr.png",
      whatsappLinkStatus: "NOT_LINKED",
    }),
    true
  );
});

