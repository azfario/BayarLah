import assert from "node:assert/strict";
import test from "node:test";
import {
  getDuitNowIdPlaceholder,
  normalizeMalaysianNric,
} from "../lib/duitnow.ts";
import {
  isValidMalaysianMobilePhone,
  normalizeMalaysianMobilePhone,
} from "../lib/friends.ts";
import { isProfileComplete } from "../lib/profile.ts";

test("profile completion requires the collector payment details", () => {
  assert.equal(
    isProfileComplete({
      fullName: "Hakim",
      phone: "+60123456789",
      duitNowIdType: "PHONE",
      duitNowIdValue: "0123456789",
      duitNowRecipientName: "HAKIM",
      duitNowQrUrl: "https://example.com/qr.png",
    }),
    true
  );
});

test("normalizes and validates Malaysian mobile numbers", () => {
  assert.equal(normalizeMalaysianMobilePhone("012-345 6789"), "+60123456789");
  assert.equal(isValidMalaysianMobilePhone("+60123456789"), true);
  assert.equal(isValidMalaysianMobilePhone("+601123456789"), true);
});

test("rejects malformed or incorrectly sized Malaysian mobile numbers", () => {
  assert.equal(isValidMalaysianMobilePhone("+6012345678"), false);
  assert.equal(isValidMalaysianMobilePhone("+6012345678901"), false);
  assert.equal(isValidMalaysianMobilePhone("+60212345678"), false);
  assert.equal(normalizeMalaysianMobilePhone("phone 0123456789"), "");
  assert.equal(normalizeMalaysianMobilePhone("+60+123456789"), "");
});

test("normalizes valid NRIC values to 12 digits", () => {
  assert.equal(normalizeMalaysianNric("900101145678"), "900101145678");
  assert.equal(normalizeMalaysianNric("900101-14-5678"), "900101145678");
  assert.equal(normalizeMalaysianNric("900101 14 5678"), "900101145678");
});

test("rejects invalid NRIC values", () => {
  assert.equal(normalizeMalaysianNric("90010114567"), "");
  assert.equal(normalizeMalaysianNric("9001011456789"), "");
  assert.equal(normalizeMalaysianNric("900101-AB-5678"), "");
});

test("provides an example for every DuitNow ID type", () => {
  assert.equal(getDuitNowIdPlaceholder("PHONE"), "+60123456789");
  assert.equal(getDuitNowIdPlaceholder("NRIC"), "900101145678");
  assert.equal(getDuitNowIdPlaceholder("PASSPORT"), "A12345678");
  assert.equal(
    getDuitNowIdPlaceholder("BUSINESS_REGISTRATION"),
    "202301234567"
  );
  assert.equal(getDuitNowIdPlaceholder("ARMY_POLICE"), "12345678");
});
