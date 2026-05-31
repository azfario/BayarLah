# BayarLah Goals

## Product Goal

Build a Malaysian fintech-focused debt reminder app where friends can record shared expenses and receive payment reminders with the payer's DuitNow details.

## Milestones

- [x] User profile onboarding
  - Collect full name, phone number, Clerk email, optional profile photo, DuitNow ID type/value, and mandatory DuitNow QR image.
  - Require WhatsApp Web linking during onboarding.
  - Require profile completion before dashboard access.
  - Allow users to edit their profile later.
  - Store profile images and DuitNow QR images in public Supabase Storage buckets.

- [x] Friend management
  - Add friends by name and Malaysian phone number.
  - Keep the data model ready for WhatsApp contact integration.

- [x] Expense entry
  - Let users manually create shared expenses.
  - Support collector, total amount, description, involved friends, equal split, and custom per-friend amounts.

- [x] Receipt upload
  - Capture or upload a receipt photo from the Expenses page.
  - Compress receipt photos in the browser for mobile/Vercel-friendly uploads.
  - Use OCR.space for temporary image-to-text extraction, then Gemini Flash to parse OCR text.
  - Review parsed items, totals, tax, service charge, and rounding before saving.
  - Assign item amounts manually across the collector and friends.
  - Store item history and final custom expense shares without storing the receipt photo.

- [x] Reminder scheduling
  - Let users choose reminder frequency for unpaid debts.
  - Track next reminder date and reminder status.

- [x] WhatsApp notification
  - Link each collector's WhatsApp Web session through the OpenWA Gateway.
  - Send reminder messages with amount owed and DuitNow QR image.
  - Keep WhatsApp Web automation isolated from the Vercel app runtime.
  - Start with a demo-friendly OpenWA Gateway adapter, then prepare for official WhatsApp Business API.

- [x] Local reminder demo and worker deployment automation
  - Start the app, OpenWA Gateway, and reminder poller together with one local demo command.
  - Keep the Vercel app non-Dockerized.
  - Package the NovaCloud OpenWA Gateway plus lightweight reminder poller with Docker and persistent sessions.
  - Support full local Docker demo with app, OpenWA Gateway, and poller containers.
  - Support NovaCloud OpenWA Gateway deployment behind an HTTPS reverse proxy.

- [x] Dashboard polish
  - Show debts owed, debts receivable, recent expenses, and reminder status.
  - Keep the interface focused on quick hackathon demo flows.

- [x] Proof of payment: data foundations
  - Add a collector-only DuitNow recipient name field used to verify bank receipt screenshots.
  - Add a private payment proof image storage path or bucket.
  - Add a payment proof record that stores image hash, parsed transaction reference, parsed amount, parsed recipient, parsed timestamp, OCR text, status, matched share, and review notes.
  - Suggested statuses: `PENDING_REVIEW`, `AUTO_CONFIRMED`, `CONFIRMED`, `REJECTED`, `DUPLICATE_REJECTED`.
  - Handoff note: debtors still do not create accounts; debtor identity comes from WhatsApp sender phone matching an existing friend.
  - Done when: schema builds, profile can save the recipient name, and existing manual paid/unpaid behavior still works.

- [x] Proof of payment: bank receipt OCR parser
  - Extract the current OCR.space call into a reusable helper that can support both shop receipts and bank transfer receipts.
  - Add a bank receipt parser that returns amount, recipient text, transaction reference, timestamp, raw OCR text, and confidence notes.
  - Keep this parser separate from the existing shop receipt parsing flow.
  - Handoff note: start with Malaysian bank transfer receipt text fixtures before relying on real screenshots.
  - Done when: parser tests cover successful parse, missing recipient, missing amount, and low-confidence OCR text.

- [x] Proof of payment: matching and replay protection
  - Match proofs against unpaid shares for the debtor phone number.
  - Auto-confirm only when the parsed amount exactly matches one unpaid share and the parsed recipient matches the collector's DuitNow recipient name or DuitNow ID.
  - If the amount matches multiple shares, no shares, or the recipient check fails, create `PENDING_REVIEW` instead of guessing.
  - Reject duplicate image hashes and reused transaction references so one screenshot cannot settle multiple debts.
  - Handoff note: amount tolerance for auto-confirm is zero cents for v1.
  - Done when: tests cover exact match, multiple same-amount debts, no amount match, recipient mismatch, duplicate image, and duplicate reference.

- [x] Proof of payment: inbound WhatsApp worker
  - Add OpenWA inbound image handling alongside the existing outbound reminder worker.
  - Download the inbound receipt screenshot, hash it, store it privately, run OCR parsing, then run the matcher.
  - For high-confidence matches, mark the share paid and stop future reminders.
  - For low-confidence matches, create a pending review without marking the share paid.
  - Handoff note: keep this in the worker/OpenWA runtime, not the Vercel app runtime.
  - Done when: a fake inbound image event creates the expected payment proof state without breaking outbound reminders.

- [x] Proof of payment: collector review UI
  - Add a payment reviews section to the Expenses page.
  - Show the proof image, parsed amount, parsed recipient, parsed timestamp, transaction reference, suggested debt, and review reason.
  - Add Confirm and Reject actions.
  - Confirm marks the selected share paid and the proof `CONFIRMED`; Reject keeps the debt unpaid and marks the proof `REJECTED`.
  - Handoff note: enforce collector ownership before showing or changing any proof.
  - Done when: collectors can review only their own pending proofs and actions update the proof and share correctly.

- [ ] Proof of payment: trust notifications and end-to-end check
  - Always notify the collector when BayarLah auto-confirms a debtor payment.
  - Notify the debtor when payment is confirmed or rejected.
  - Skip normal reminders while a payment proof is pending review.
  - Run the complete local flow: reminder sent, debtor screenshot received, proof parsed, match or review created, and notifications sent.
  - Handoff note: never make auto-confirm silent; collector visibility is part of the product trust model.
  - Done when: `npm run build` passes and the local OpenWA demo proves both auto-confirm and pending-review paths.
