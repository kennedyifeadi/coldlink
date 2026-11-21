# Demo runbook

How to show ColdLink before the provider dashboard, admin screens, scheduled jobs and real SMS
exist. Everything runs on the dev database with Paystack test keys (decisions 111, 112).

## Before the day

- `require_provider_approval` is off on the dev database, so a cold room listed in the demo goes
  live at once. Turn it back on (`app_config`) once the admin screens (#42+) exist.
- **Laptop:** `pnpm install`, then start the API first and the web app second, in two terminals:
  `pnpm --filter @coldlink/api dev` and `pnpm --filter web dev`. Open `http://localhost:5173`.
- **Public link:** in Render, choose New, then Blueprint, and pick this repository; `render.yaml`
  makes the `coldlink-api` service. Enter the values it asks for (`DATABASE_URL`, the Supabase
  and Paystack keys from `apps/api/.env`, and the Vercel site's URL as both `WEB_APP_URL` and
  `CORS_ORIGINS`). The service is `https://coldlink-api.onrender.com`, which the `/api/` rewrite
  in `apps/web/vercel.json` points at. In Paystack's test dashboard, set the webhook URL to the Vercel site +
  `/api/v1/webhooks/paystack`.
- Render's free service sleeps when idle: open the site two minutes before presenting.

## The flow

1. **Farmer finds storage.** Home, Find cold storage, pick a place, the produce and how much.
   Results show the nearest cold rooms with space and the price.
2. **Farmer books.** Open a cold room, Book. Sign in with any Nigerian number: the code is shown
   on screen. Review the booking and Pay. Paystack's test checkout opens; pay with one of
   Paystack's published test cards. The app returns to the confirmation.
3. **Provider accepts.** The provider's SMS is not sent, so read it from the API's log (the
   laptop terminal, or Render's Logs tab): the `booking_received` line's `text` ends with the
   accept/reject link. Open it, Accept. The farmer's booking is now confirmed, with the
   facility's address and phone.
4. **Farmer manages it.** Bookings shows the booking, its history, and the refund cancelling
   would give. Book again repeats it in a few taps.
5. **Provider lists a cold room.** Home, List your cold room, then the wizard. It appears in
   search straight away.

## Not built yet

Provider dashboard (#38), admin screens (#42+), ratings (#36), reminders and automatic expiry
(#30), delivery, real SMS (Termii) and the production deployment (#52).
