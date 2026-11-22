# Demo runbook

How to show ColdLink before the provider dashboard, admin screens and real SMS exist. Everything runs on the dev database with Paystack test keys (decisions 111, 112).

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
- In Vercel, set `VITE_SHOW_DEV_CODE` to `true` for Production and redeploy, or the public site
  hides the sign-in code (decision 113).
- The demo API gives the sign-in code for any number to whoever asks, so anyone can sign in as any
  account on the dev database. Use made-up 0800 numbers, and keep real people's numbers and
  details out of it.
- Render's free service sleeps when idle: open the site two minutes before presenting.
- The scheduled jobs run in every API on the dev database unless it sets `JOBS_ENABLED=false`
  (decision 114). An unpaid booking expires when its hold ends and an unanswered one when the
  provider's deadline passes, with a test refund, so make the bookings to show on the day. While
  Render sleeps its jobs wait until it wakes.

## The flow

1. **Farmer finds storage.** Home, Find cold storage, pick a place, the produce and how much.
   Results show the nearest cold rooms with space and the price.
2. **Farmer books.** Open a cold room, Book. Sign in with a made-up 0800 number: the code is shown
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

Provider dashboard (#38), admin screens (#42+), ratings (#36),
delivery, real SMS (Termii) and the production deployment (#52).
