import assert from "node:assert/strict";
import test from "node:test";
import {
  isWhatsappBotAdminEmail,
  parseWhatsappBotAdminEmails,
  pickLatestWhatsappBotInboundRoute,
} from "../lib/whatsapp-bot.ts";

test("parses bot admin allowlist case-insensitively", () => {
  const emails = parseWhatsappBotAdminEmails("Admin@Example.com, ops@example.com");

  assert.equal(emails.has("admin@example.com"), true);
  assert.equal(isWhatsappBotAdminEmail("ADMIN@example.com", "admin@example.com"), true);
  assert.equal(isWhatsappBotAdminEmail("user@example.com", "admin@example.com"), false);
});

test("selects latest unpaid route for the active bot session", () => {
  const route = pickLatestWhatsappBotInboundRoute(
    [
      {
        collectorId: "collector_old",
        collectorFullName: "Old Collector",
        collectorPhone: "+60100000001",
        debtorPhone: "+60123456789",
        senderSessionId: "bot_1",
        status: "SENT",
        paidAt: null,
        createdAt: new Date("2026-06-01T08:00:00Z"),
      },
      {
        collectorId: "collector_ignored",
        collectorFullName: "Ignored Collector",
        collectorPhone: "+60100000002",
        debtorPhone: "+60123456789",
        senderSessionId: null,
        status: "SENT",
        paidAt: null,
        createdAt: new Date("2026-06-01T09:00:00Z"),
      },
      {
        collectorId: "collector_paid",
        collectorFullName: "Paid Collector",
        collectorPhone: "+60100000003",
        debtorPhone: "+60123456789",
        senderSessionId: "bot_1",
        status: "SENT",
        paidAt: new Date("2026-06-01T09:30:00Z"),
        createdAt: new Date("2026-06-01T09:30:00Z"),
      },
      {
        collectorId: "collector_latest",
        collectorFullName: "Latest Collector",
        collectorPhone: "+60100000004",
        debtorPhone: "+60123456789",
        senderSessionId: "bot_1",
        status: "SENT",
        paidAt: null,
        createdAt: new Date("2026-06-01T10:00:00Z"),
      },
      {
        collectorId: "collector_other_bot",
        collectorFullName: "Other Bot Collector",
        collectorPhone: "+60100000005",
        debtorPhone: "+60123456789",
        senderSessionId: "bot_2",
        status: "SENT",
        paidAt: null,
        createdAt: new Date("2026-06-01T11:00:00Z"),
      },
    ],
    "bot_1"
  );

  assert.deepEqual(route, {
    collectorId: "collector_latest",
    collectorFullName: "Latest Collector",
    collectorPhone: "+60100000004",
    debtorPhone: "+60123456789",
  });
});

test("returns no route when no active bot reminder matches", () => {
  const route = pickLatestWhatsappBotInboundRoute(
    [
      {
        collectorId: "collector_1",
        collectorFullName: "Collector",
        collectorPhone: "+60100000001",
        debtorPhone: "+60123456789",
        senderSessionId: null,
        status: "SENT",
        paidAt: null,
        createdAt: new Date("2026-06-01T08:00:00Z"),
      },
    ],
    "bot_1"
  );

  assert.equal(route, null);
});

