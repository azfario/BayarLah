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
