# ColdLink: Product Requirements Document (v2, Full Platform Build)

**Audience:** the ColdLink team
**Status:** Draft for build
**Product:** ColdLink, a platform that lets farmers in Oyo State find and book nearby cold storage, with optional delivery, and records produce for a future presale marketplace.

---

## 0. How to use this document (read first)

### 0.1 Order of work
1. **Audit the existing app before writing any code.** The current frontend (React + JavaScript, front-end only, no backend) was built quickly and is the reference for how ColdLink behaves today. Produce `docs/current-state.md` covering: every route and screen, every form and its fields, all hardcoded or mock data, all state management, the search and ranking logic as implemented, the booking and payment flow as implemented, and any third-party services in use. The WhatsApp bot lives outside this repository and is deferred from this sprint (see `docs/decisions.md`), so it is not part of the audit.
2. **Then read this PRD** and write `docs/discrepancies.md` listing every place the existing app and this PRD disagree. Do not resolve a discrepancy silently. If the existing behaviour is better than what this PRD says, say so and propose a change.
3. **Then build in the phases in Section 12**, one phase at a time, with each phase passing its acceptance criteria before the next starts.

### 0.2 Working rules
- Where this PRD is ambiguous or marks a decision as open (Section 14), use the stated default, record the assumption in `docs/decisions.md`, and keep going. Do not block on it. Decisions already recorded in `docs/decisions.md` override this document.
- Never invent business values (fees, percentages, prices). Put every such value in the `app_config` table (Section 5.15) with the placeholder shown, and flag it.
- Preserve the user-facing behaviour of the existing flows unless this PRD says otherwise.
- Small, reviewable commits following the commit rules in `CLAUDE.md`. No secrets in the repo.
- Every endpoint, form and database write validates input with the shared Zod schemas.
- Do not build the public marketplace (Section 7.10). Only build its data layer and the opt-in capture.

### 0.3 Precedence
If two sections conflict, the order of authority is: Section 6 (business rules), then Section 5 (data model), then Section 7 (functional requirements), then everything else.

---

## 1. Product overview

**Problem.** Nigeria loses an estimated ₦9.4 trillion a year to post-harvest spoilage, with Oyo State's share estimated at about ₦94.6 billion (The Guardian). In ColdLink's farmer survey, 70% of farmers said they did not know a nearby cold storage option existed. The constraint is largely discovery, not only capacity.

**Solution.** Farmers search by location, crop, quantity and duration, see nearby storage that is available and suitable, book it with a deposit, and optionally arrange delivery. Storage providers range from commercial cold rooms to individuals renting spare freezers and fridges.

**Who uses it**
- **Farmers:** smallholder and medium-scale farmers growing perishable crops. Many use basic phones, have limited data, and may have low digital literacy. UX must work for them first.
- **Providers:** cold room operators and individuals with spare freezer or fridge capacity.
- **Delivery partners:** third-party logistics providers (ColdLink does not run its own fleet).
- **Admins:** the ColdLink team.

**Revenue model (drives the data model)**
- Commission on each storage booking (default 7.5%, deducted from the provider's side).
- Flat service fee per booking, paid by the farmer (amount TBD).
- Delivery fee margin.
- Farmer training fees (handled outside this app for now; not in scope).

**Success metrics (instrument these)**
- Farmers registered, bookings created, bookings completed, repeat booking rate.
- Search-to-booking conversion.
- Provider response rate and median response time.
- Percentage of bookings with the presale opt-in selected.
- Average days in storage per booking.

---

## 2. Scope

### In scope (this build)
- TypeScript migration and redesign of the web frontend.
- New backend: Node.js + Express (TypeScript), PostgreSQL on Supabase.
- Phone-number registration with OTP, ColdLink ID.
- Provider onboarding, admin approval, provider dashboard.
- Geo search with availability and crop-compatibility filtering.
- Booking engine with capacity control and booking state machine.
- Deposit payments via Paystack, refunds, provider payout ledger.
- SMS notifications and scheduled reminders.
- Delivery module with partner-based, manually dispatched delivery.
- Ratings.
- Marketplace data layer: tables and opt-in capture at booking. No public marketplace.
- Admin dashboard.
- Re-pointing the existing WhatsApp bot to the new API (deferred; see `docs/decisions.md`).

### Out of scope (do not build)
- Public marketplace UI, buyer accounts, buyer payments.
- USSD (design for it, do not build it).
- Real-time GPS tracking of deliveries.
- Predictive spoilage model.
- Market price analytics screens.
- Mobile native apps.
- Multi-language UI (externalise strings so it can be added later).
- Farmer training enrolment and payments.

---

## 3. Users and roles

| Role | Can do |
|---|---|
| `farmer` | Register, search, book, pay, request delivery, view own bookings, rate, opt in produce to the presale data layer |
| `provider` | Onboard a facility, manage capacity and prices, accept or reject bookings, check produce in and out, view earnings |
| `delivery_partner` | Receive job requests, accept, update status through a link or a simple page |
| `admin` | Approve providers, view and manage everything, assign deliveries, record payouts, edit config |

A single phone number may hold more than one role (for example a farmer who also lists a spare freezer).

---

## 4. Architecture and stack

### 4.1 Stack
- **Frontend:** React + **TypeScript (strict)**, built with Vite (if the current project uses Create React App or similar, migrate to Vite after the audit). React Router. TanStack Query for server state. React Hook Form + Zod for forms. Tailwind CSS using the design tokens in Section 9.3. Leaflet + OpenStreetMap for maps (no paid map keys).
- **Backend:** Node.js + Express, written in **TypeScript** (recommended so types are shared with the frontend; see Section 14).
- **Database:** PostgreSQL on **Supabase**, with the **PostGIS** extension enabled for distance queries. Supabase is used as managed Postgres, plus Storage for facility photos. Supabase Auth is **not** used; the Express API issues its own sessions (Section 7.1).
- **Payments:** Paystack.
- **SMS:** Termii as the default provider behind an interface, so Africa's Talking can be swapped in.
- **Validation:** Zod schemas shared between frontend and backend.
- **Query layer:** SQL migrations are the source of truth (Supabase CLI). Use a typed query builder (Kysely or Drizzle) with raw SQL for PostGIS queries. Choose one and document it in `docs/decisions.md`.

### 4.2 Repository layout (monorepo, pnpm workspaces)
```
coldlink/
  apps/
    web/            # React + TS frontend
    api/            # Express + TS backend
  packages/
    shared/         # Zod schemas, TS types, constants, enums (single source of truth)
  supabase/
    migrations/     # SQL migrations
    seed.sql        # Crop types, config defaults, dev seed data
  docs/
    current-state.md
    discrepancies.md
    decisions.md
    api.md
  .github/workflows/
```

### 4.3 Hosting
- Frontend stays on Vercel.
- The Express API is a long-running Node service and handles webhooks and scheduled jobs, so host it on Render, Railway or Fly.io, not as Vercel serverless functions. Confirm in Section 14.
- Three environments: `dev`, `staging`, `production`, each with its own Supabase project and its own Paystack and SMS keys. Paystack stays in test mode until the business is registered and verified.

### 4.4 Request flow
Browser or WhatsApp bot → Express API (validates, applies business rules, writes to Postgres with the service-role connection) → Postgres. The browser never talks to Supabase directly. Enable Row Level Security on every table with no policies for the `anon` key (deny by default) as a safety net.

---

## 5. Data model

All tables have `id uuid primary key default gen_random_uuid()`, `created_at timestamptz default now()` and `updated_at timestamptz` (trigger-maintained) unless stated. Money is stored as **integer kobo** (`bigint`), never floats. Display in naira. Dates for storage periods are `date`; event timestamps are `timestamptz` (store UTC, display Africa/Lagos).

### 5.1 `users`
```
phone              text unique not null      -- E.164, e.g. +2348012345678
coldlink_id        text unique not null      -- 7-digit numeric, random, non-sequential (USSD-ready)
full_name          text
roles              text[] not null default '{farmer}'   -- farmer | provider | delivery_partner | admin
preferred_channel  text default 'web'        -- web | whatsapp | sms
home_lga           text
home_lat, home_lng double precision          -- optional saved location
consented_at       timestamptz               -- data-protection consent
last_login_at      timestamptz
is_active          boolean default true
```

### 5.2 `otp_codes`
`phone`, `code_hash`, `expires_at`, `attempts int default 0`, `consumed_at`. Codes are 6 digits, hashed, expire in 10 minutes, max 5 attempts.

### 5.3 `providers`
```
owner_user_id        uuid references users
business_name        text                    -- nullable for individuals
display_name         text not null
facility_type        text not null           -- cold_room | chest_freezer | fridge | fridge_fleet | other
description          text
phone                text not null           -- SMS notifications go here
whatsapp             text
address_text         text not null
landmark             text
lga                  text
location             geography(Point,4326) not null   -- GiST index
capacity_total       numeric not null        -- in capacity_unit
capacity_unit        text not null           -- sqm | crates | kg
price_per_unit_per_day_kobo bigint not null
min_storage_days     int default 1
temp_min_c, temp_max_c numeric               -- optional, for future spoilage logic
has_backup_power     text                    -- generator | solar | none | unknown
verification_status  text default 'pending'  -- pending | approved | suspended | rejected
verified_at          timestamptz
is_accepting_bookings boolean default true   -- provider can pause
avg_rating           numeric(3,2) default 0
rating_count         int default 0
photos               text[]                  -- Supabase Storage paths
```
Indexes: GiST on `location`; btree on `verification_status`, `is_accepting_bookings`.

### 5.4 `crop_categories`, `crops`, `provider_crop_support`
```
crop_categories(id, slug, name)        -- vegetables, fruits, tubers, fish, meat_poultry, dairy, other
crops(id, category_id, name, local_names text[], shelf_life_days_ambient int, recommended_temp_min_c, recommended_temp_max_c)
provider_crop_support(provider_id, category_id)   -- providers declare supported categories
```
Search compatibility is by category. The shelf-life and temperature columns are nullable and stored for the future spoilage model; do not use them for filtering yet.

### 5.5 `bookings`
```
code                 text unique not null    -- human code, e.g. CL-7K3Q9 (alphabet without 0/O/1/I)
farmer_id            uuid references users
provider_id          uuid references providers
crop_id              uuid references crops
quantity             numeric not null        -- in provider's capacity_unit
capacity_unit        text not null           -- copied from provider at booking time
start_date           date not null
duration_days        int not null
end_date             date not null           -- start_date + duration_days
status               text not null           -- see state machine, Section 6.5
unit_price_kobo      bigint not null         -- snapshot at booking time
storage_subtotal_kobo bigint not null
commission_rate      numeric not null        -- snapshot (e.g. 0.075)
commission_kobo      bigint not null
service_fee_kobo     bigint not null
deposit_percent      numeric not null        -- snapshot
deposit_kobo         bigint not null         -- storage deposit
balance_due_kobo     bigint not null         -- paid to provider at the facility
delivery_fee_kobo    bigint default 0
total_charged_online_kobo bigint not null    -- deposit + service fee + delivery fee
payment_expires_at   timestamptz             -- capacity hold window while awaiting payment
provider_response_due_at timestamptz
checked_in_at, collected_at timestamptz
cancelled_by         text                    -- farmer | provider | system | admin
cancel_reason        text
notes                text
```
All price and fee fields are **snapshots**; later config or price changes must never alter existing bookings.

### 5.6 `booking_events`
Append-only audit log: `booking_id`, `from_status`, `to_status`, `actor_type`, `actor_id`, `metadata jsonb`. Every status change writes a row.

### 5.7 `payments`
```
booking_id, delivery_request_id (nullable)
provider_ref        text unique   -- Paystack reference
purpose             text          -- booking_deposit | refund
amount_kobo         bigint
status              text          -- initiated | success | failed | refunded | partially_refunded
paystack_payload    jsonb
paid_at             timestamptz
```

### 5.8 `payouts`
Records what ColdLink owes and has paid providers: `provider_id`, `booking_id`, `amount_kobo`, `status` (`owed | paid`), `paid_at`, `reference`, `recorded_by`. Created when a booking is checked in (Section 6.4). Marked paid manually by an admin for now.

### 5.9 `ratings`
`booking_id unique`, `farmer_id`, `provider_id`, `stars int check 1..5`, `comment`. Updates the provider's `avg_rating` and `rating_count`.

### 5.10 Delivery tables
```
delivery_partners
  user_id, company_name, phone, vehicle_types text[], coverage_lgas text[],
  is_active, avg_rating

delivery_requests
  context_type    text   -- booking_inbound | booking_outbound | marketplace_order (reserved)
  context_id      uuid   -- the booking (or future order) this belongs to
  requested_by    uuid references users
  partner_id      uuid references delivery_partners (nullable until assigned)
  pickup_text, pickup_location geography(Point)
  dropoff_text, dropoff_location geography(Point)
  contact_name, contact_phone       -- person at pickup / dropoff
  load_description text, load_quantity numeric, load_unit text
  distance_km     numeric
  vehicle_type    text      -- bike | tricycle | van | truck
  fee_kobo        bigint    -- what the customer pays
  partner_payout_kobo bigint
  platform_margin_kobo bigint
  status          text      -- requested | assigned | accepted | picked_up | delivered | cancelled | failed
  handover_code   text      -- 4-digit code the recipient gives the driver to confirm delivery
  scheduled_for   timestamptz
  assigned_at, picked_up_at, delivered_at timestamptz
  notes text
```
`context_type` and `context_id` let the future marketplace reuse this table.

### 5.11 Marketplace data layer (tables only, no public API or UI)
```
produce_listings
  farmer_id, provider_id, booking_id unique
  crop_id, title text
  quantity numeric, unit text          -- tuber, crate, kg, basket...
  unit_price_kobo bigint
  available_quantity numeric
  available_from date                  -- = booking end_date (when produce leaves storage)
  status text default 'draft'          -- draft | active | sold_out | expired | cancelled
  pickup_provider_id (= provider_id; pickup point is the storage facility)

listing_reservations     -- reserved for phase 2; create the table, no endpoints
  listing_id, buyer_name, buyer_phone,
  quantity, total_kobo, deposit_percent default 0.20, deposit_kobo,
  status text, pickup_code text
```
Rules: a listing is created in `draft` status only when the farmer opts in at booking. Nothing in `draft` is visible to anyone except the farmer (own bookings) and admins. Activation belongs to a later phase.

A SQL view `v_listing_price_observations` (`crop_id`, `week`, `unit_price_kobo`, `unit`) should be created now over `produce_listings` so market price analytics can be built later without changing the schema.

### 5.12 `notifications`
Outbound log: `user_id`, `channel` (`sms | whatsapp`), `template`, `payload`, `status`, `provider_message_id`, `error`, `sent_at`.

### 5.13 `action_tokens`
Single-use signed tokens for link-based actions that do not need a login: `token_hash`, `purpose` (`provider_accept_booking | provider_reject_booking | delivery_accept | delivery_update`), `subject_id`, `expires_at`, `used_at`.

### 5.14 `search_logs`
`user_id` (nullable), `lat`, `lng`, `crop_id`, `quantity`, `duration_days`, `result_count`, `channel`. Used for demand analytics and for measuring unmet demand (searches with zero results).

### 5.15 `app_config`
Key-value JSON table, admin-editable, cached in the API for 60 seconds. Seed with these **placeholders** and flag each as unconfirmed:

| Key | Placeholder | Meaning |
|---|---|---|
| `commission_rate` | 0.075 | Platform commission on storage subtotal |
| `service_fee_kobo` | 0 | Flat farmer service fee (TBD) |
| `deposit_percent` | 0.30 | Share of storage subtotal paid online (must be greater than `commission_rate`) |
| `provider_response_minutes` | 120 | Time a provider has to accept or reject |
| `payment_hold_minutes` | 15 | Capacity hold while awaiting payment |
| `search_default_radius_km` | 25 | Default search radius |
| `search_max_radius_km` | 100 | Maximum radius |
| `delivery_base_fee_kobo` | 100000 | Delivery base fee (TBD) |
| `delivery_per_km_kobo` | 10000 | Delivery per-km fee (TBD) |
| `delivery_min_fee_kobo` | 100000 | Delivery minimum fee (TBD) |
| `delivery_partner_share` | 0.80 | Share of delivery fee paid to partner (TBD) |
| `road_distance_factor` | 1.3 | Multiplier from straight-line to estimated road distance |
| `require_provider_approval` | true | Providers need admin approval before appearing in search |
| `otp_required` | true | Require OTP at registration and login |
| `farmer_free_cancel_hours` | 24 | Free cancellation window before start date |

---

## 6. Business rules

### 6.1 Pricing
```
storage_subtotal = quantity × duration_days × unit_price
commission       = commission_rate × storage_subtotal      (deducted from the provider's side)
service_fee      = app_config.service_fee_kobo             (paid by the farmer, on top)
deposit          = deposit_percent × storage_subtotal      (paid online now)
balance_due      = storage_subtotal − deposit              (paid to the provider at the facility)
charged_online   = deposit + service_fee + delivery_fee
provider_payout  = deposit − commission                    (settled by ColdLink after check-in)
platform_revenue = commission + service_fee + delivery margin
```
Round to whole kobo. Validate at config time that `deposit_percent > commission_rate`, otherwise ColdLink could owe the provider more than it holds.

**Worked example (use as a unit test).** 2 sqm × 30 days × ₦2,258/day = ₦135,480 subtotal. Commission at 7.5% = ₦10,161. Deposit at 30% = ₦40,644. Balance at facility = ₦94,836. Provider payout = ₦40,644 − ₦10,161 = ₦30,483.

### 6.2 Availability
Capacity is checked per day, not by summing overlapping bookings. For a requested range `[start_date, end_date)`, available quantity = `capacity_total` minus the **peak daily occupancy** across that range, where occupancy counts bookings in statuses `payment_pending` (unexpired), `pending_provider`, `confirmed` and `in_storage`. Implement as a SQL function using `generate_series` over the range.

### 6.3 Concurrency
Booking creation runs in one transaction that locks the provider row (`SELECT ... FOR UPDATE`), re-checks availability, then inserts. Two farmers must never both book the last capacity. A `payment_pending` booking holds capacity until `payment_expires_at`, after which a scheduled job sets it to `expired` and frees the capacity.

### 6.4 Money flow
1. Farmer pays `charged_online` through Paystack into ColdLink's account.
2. If the provider accepts, the booking is `confirmed`.
3. If the provider rejects or does not respond in time, the farmer is refunded in full automatically and the booking is `rejected` or `expired`.
4. When the provider marks the produce checked in, a `payouts` row (`owed`) is created for `provider_payout`.
5. The farmer pays `balance_due` to the provider directly at the facility. The provider confirms collection in the app; ColdLink does not process the balance.
6. Admins record payouts as paid.

### 6.5 Booking state machine
```
payment_pending ──(paid)──────────▶ pending_provider
payment_pending ──(hold expires)──▶ expired
pending_provider ─(accept)────────▶ confirmed
pending_provider ─(reject)────────▶ rejected      → full refund
pending_provider ─(timeout)───────▶ expired       → full refund
confirmed ─(provider checks in)───▶ in_storage    → payout owed created
confirmed ─(farmer cancels)───────▶ cancelled     → refund per policy
confirmed ─(provider cancels)─────▶ cancelled     → full refund
confirmed ─(no show past start)───▶ no_show       → deposit forfeited (admin can override)
in_storage ─(provider marks collected)▶ completed
```
Only the listed transitions are allowed, enforced in one service function. Each writes a `booking_events` row.

### 6.6 Cancellation
Default policy (configurable, see Section 14): before provider acceptance, full refund. After acceptance and at least `farmer_free_cancel_hours` before `start_date`, refund the storage deposit but not the service fee. Later than that, the deposit is forfeited. Provider-initiated cancellation always refunds everything and increments a provider `cancellation_count` shown to admins.

### 6.7 Ratings
A farmer can rate a provider once per booking, only when it is `completed`. Recompute `avg_rating` and `rating_count` transactionally.

### 6.8 Search ranking
1. Hard filters: provider `approved` (if `require_provider_approval`), `is_accepting_bookings`, supports the crop's category, `available_quantity >= requested quantity` for the date range, within radius.
2. Sort by distance ascending. Ties broken by `avg_rating` descending.
3. Return distance (km), available quantity, total estimated price, deposit amount, rating, and facility type.
4. If no results within the default radius, retry once at `search_max_radius_km` and flag the response as `expanded_radius: true`. If still empty, log it in `search_logs` and return a clear empty state.

---

## 7. Functional requirements

### 7.1 Authentication and identity
- A user enters a phone number. The API normalises to E.164 (+234) and sends a 6-digit OTP by SMS.
- On first verification, create the user and assign a `coldlink_id` (7-digit numeric, random, non-sequential). Show the ID prominently, because it will be the identity for a future USSD channel and for support calls.
- Issue a short-lived access token (JWT, 15 minutes) and a refresh token in an httpOnly secure cookie (30 days). Farmers should rarely have to re-enter an OTP.
- `otp_required` is a config flag. **Default on.** Reason: bookings involve money, and without OTP anyone could register as another person's number and view or cancel their bookings.
- Rate limit OTP requests (per phone and per IP). Never reveal whether a phone number is registered in error messages.
- Collect data-protection consent at registration (see Section 10).
- Roles are checked by middleware on every protected route.

### 7.2 Provider onboarding
- Wizard of at most 5 short steps: contact and facility type, location (map pin plus address text), capacity and price, supported crops (category chips), photos (optional, up to 4).
- On submit, the provider is `pending`. If `require_provider_approval` is true, admins approve before the facility appears in search. If false, it goes live immediately.
- Providers can edit capacity, price and `is_accepting_bookings` at any time. Price changes affect new bookings only.
- Provider dashboard: today's occupancy, upcoming bookings, pending requests with accept and reject buttons, check-in and collected actions, earnings summary (owed and paid).

### 7.3 Farmer search
- Inputs: location (device geolocation, or pick area from a list, or drop a pin), crop, quantity, number of days, start date (default today).
- Show results as cards: facility name, facility type icon, distance, available quantity, total price estimate, rating. One primary button: "Book".
- Search must return in under 500 ms at the 95th percentile for up to 500 providers.

### 7.4 Booking flow
1. Review screen: facility, quantity, dates, price breakdown (storage subtotal, deposit due now, balance at facility, service fee), clear "You pay now: ₦X".
2. Optional **delivery**: "Do you need pickup from your farm?" (Section 7.7).
3. Optional **presale opt-in**: "List this produce for presale (coming soon)." If ticked, ask for unit price and quantity. See 7.10. The copy must not promise buyers.
4. Pay deposit with Paystack. Show a payment-in-progress state, then confirmation.
5. Confirmation shows the booking code, the facility address and phone number, and a "Share on WhatsApp" button. The booking code is sent by SMS.
6. The booking moves to `pending_provider`. The farmer sees "Waiting for [facility] to confirm" with the response deadline.

Target: a returning farmer reaches payment in 4 taps or fewer from the home screen, using "Book again" (7.9).

### 7.5 Payments
- Initialise Paystack transactions from the API, never from the browser with secret keys.
- Verify every payment through the **webhook** (check the HMAC SHA-512 signature) and also by verifying the reference server-side on redirect. The webhook is the source of truth.
- Idempotent: processing the same event twice must not double-update a booking.
- Refunds use the Paystack refund API and are recorded in `payments`.
- Amounts in kobo end to end.

### 7.6 Notifications (SMS)
All sends go through an `SmsProvider` interface with a Termii implementation and a console implementation for development. Log every send to `notifications`. Keep messages short and in plain English.

| Template | To | When |
|---|---|---|
| `otp` | user | Login or registration |
| `booking_received` | provider | Booking enters `pending_provider`; includes crop, quantity, dates and an accept/reject link (`action_tokens`) |
| `booking_confirmed` | farmer | Provider accepts; includes code and address |
| `booking_rejected` | farmer | Rejected or expired; says refund is on its way |
| `expiry_reminder` | farmer | 2 days before `end_date`, and again on the last day |
| `collection_reminder` | provider | On `end_date` |
| `delivery_job` | delivery partner | Delivery assigned; accept link |
| `delivery_update` | farmer | Delivery accepted, picked up, delivered |

Providers accept or reject through a **link in the SMS** (single-use token, 12-hour expiry) that opens a simple page, so individuals who rent spare freezers do not need to log in. Do not rely on parsing SMS replies.

### 7.7 Delivery (partner-based, manually dispatched)
ColdLink does not own vehicles. Delivery is carried out by partner logistics providers, and in this build dispatch is manual.

**Flow**
1. At booking, or later from a confirmed booking, the farmer can request **inbound delivery** (farm to facility). Outbound delivery (facility to farmer, or later to a buyer) can be requested before `end_date`.
2. The farmer enters pickup address and pin, contact phone, load description and quantity. The API estimates distance (Haversine × `road_distance_factor`) and calculates the fee:
   `fee = max(delivery_min_fee, delivery_base_fee + per_km × distance_km)`. Choose vehicle type by load size (configurable table; default bike under a set size, van above).
3. The fee is added to `charged_online` when requested at booking, or paid through a separate Paystack transaction when requested later.
4. The request appears in the admin delivery queue with status `requested`. An admin assigns a partner, which sends the `delivery_job` SMS with an accept link.
5. The partner accepts, picks up, and delivers, updating status through link-based pages. On delivery the recipient gives the 4-digit `handover_code` to the driver, who enters it to complete the job.
6. Partner payout is `fee × delivery_partner_share`, recorded for admin settlement. Platform margin is the remainder.

**Rules**
- A delivery tied to a booking cannot be scheduled outside the booking window (inbound on or before `start_date`, outbound on or after the day it is requested and before the facility's cut-off).
- If a delivery fails or is cancelled, the farmer is refunded per policy and admins are alerted.
- No live GPS in this build. Status updates only.
- The delivery table is built so marketplace orders can reuse it later (`context_type`).

### 7.8 Ratings
After `completed`, the farmer sees a one-tap 1-to-5 rating screen with an optional comment, delivered through the app and a follow-up SMS link.

### 7.9 Retention features in scope
- **My bookings** screen with status, countdown to `end_date`, and booking code.
- **Expiry reminders** by SMS (7.6).
- **Book again:** one tap from a past booking pre-fills facility, crop, quantity and duration. If that facility lacks capacity, fall back to normal search with the same inputs.

### 7.10 Marketplace data layer (no public marketplace)
- During booking the farmer may opt in to presale and enter `unit_price` and `quantity` for the produce. Create a `produce_listings` row with `status = 'draft'`, `available_from = end_date`, linked to the booking.
- Provide admin read access to listings so the team can review the data. Provide no public endpoints, no buyer accounts, no buyer UI.
- UI copy: "Presale is coming soon. We'll save your listing and let you know when buyers can see it." Do not tell farmers that buyers can currently reserve produce.
- Pickup for future buyers is the storage facility, so `provider_id` doubles as the pickup point. Any later delivery uses the delivery module.
- Keep `listing_reservations` and `v_listing_price_observations` in the schema (5.11) so activating the marketplace later needs no migration of existing data.
- Track opt-in rate as a product metric.

### 7.11 Admin dashboard
Minimal and functional, not polished:
- Providers: approve, reject, suspend, view photos, edit.
- Bookings: list with filters and status, view event history, force-cancel with reason.
- Delivery queue: assign partner, view status.
- Payouts: list owed and paid, mark paid with reference.
- Listings (draft): read-only table.
- Config: edit `app_config` values with a change log.
- Basic stats: the success metrics in Section 1.

### 7.12 WhatsApp bot
**Deferred from this sprint** (see `docs/decisions.md`). The requirements below stay as the target for when it is picked up.

The bot already exists. Re-point it to the API instead of rebuilding it. After auditing how it works today, the bot should be able to: register or look up a user by phone, run a search (crop, quantity, days, location), show top results, create a booking and return a Paystack payment link, and show booking status. The bot uses a service credential limited to a dedicated bot role and acts on behalf of the phone number it is chatting with. Every bot capability must call the same API endpoints and business rules as the web app; no logic is duplicated in the bot.

### 7.13 Scheduled jobs
Run in the API process (node-cron) or through a protected cron-trigger endpoint. Each job must be idempotent.
- Release expired `payment_pending` holds (every minute).
- Expire `pending_provider` bookings past `provider_response_due_at` and refund (every minute).
- Send expiry and collection reminders (hourly, tracked so none sends twice).
- Mark overdue confirmed bookings as `no_show` candidates for admin review (daily).

---

## 8. API surface

Base path `/api/v1`. JSON only. Consistent error shape `{ error: { code, message, details? } }`. Paginated lists use `limit` and `cursor`. Document with OpenAPI in `docs/api.md`.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /auth/refresh`, `POST /auth/logout`, `GET /me`, `PATCH /me` |
| Reference | `GET /crops`, `GET /crop-categories`, `GET /config/public` |
| Search | `POST /search` |
| Providers (public) | `GET /providers/:id` |
| Providers (own) | `POST /providers`, `GET /providers/mine`, `PATCH /providers/:id`, `POST /providers/:id/photos`, `GET /providers/:id/dashboard` |
| Bookings | `POST /bookings/quote` (price calculation, no side effects), `POST /bookings`, `GET /bookings`, `GET /bookings/:id`, `POST /bookings/:id/cancel` |
| Provider actions | `POST /bookings/:id/accept`, `POST /bookings/:id/reject`, `POST /bookings/:id/check-in`, `POST /bookings/:id/collect` |
| Link actions | `GET/POST /actions/:token` (provider accept/reject, delivery accept/update) |
| Payments | `POST /payments/initialize`, `POST /webhooks/paystack` |
| Ratings | `POST /bookings/:id/rating` |
| Delivery | `POST /deliveries/quote`, `POST /deliveries`, `GET /deliveries/:id`, `POST /deliveries/:id/cancel` |
| Admin | `GET/PATCH /admin/providers…`, `GET /admin/bookings…`, `POST /admin/deliveries/:id/assign`, `GET /admin/payouts`, `POST /admin/payouts/:id/mark-paid`, `GET /admin/listings`, `GET/PATCH /admin/config`, `GET /admin/stats` |
| Bot | Same endpoints, called with the bot service credential |

Webhook and link-action routes are not behind the normal login but are protected by signature verification or single-use tokens respectively.

---

## 9. Frontend requirements

### 9.1 TypeScript migration
- `strict: true`, `noUncheckedIndexedAccess: true`. No `any` without a justified `// eslint-disable` comment. ESLint (typescript-eslint) and Prettier configured and run in CI.
- Convert every `.js`/`.jsx` file to `.ts`/`.tsx`. Replace PropTypes, if used, with types.
- All API request and response types come from `packages/shared` (Zod schemas with inferred types). The frontend must not hand-write types that duplicate them.
- Remove all hardcoded and mock provider data once the API is live. A seed script loads dev data instead.
- Environment variables are typed and validated at startup.

### 9.2 Structure
Feature-based folders (`features/search`, `features/booking`, `features/provider`, `features/delivery`, `features/admin`), shared UI components, an API client module, and route-level code splitting. Keep the bundle small, since farmers use limited data.

### 9.3 Design system
The existing screens keep their layouts and components; the palette and type below replace their current colours and font (see `docs/decisions.md`). New screens must look like they belong with the existing ones.
- Palette: primary light green `#7FB069`, warm off-white background `#F6F7EE`, card `#FFFDF7`, amber accent for primary actions `#F0A93E`, deep text green `#233D22`, alert coral `#E2654A` used sparingly.
- Type: Fraunces for headings and the wordmark, Nunito for UI text.
- Logo and icon files are in the design assets; do not redraw them.
- Define the colors and type scale as design tokens (Tailwind theme), not scattered hex values.

### 9.4 UX principles (farmers come first)
- One primary action per screen. Primary buttons at least 48 px tall, full width on mobile.
- Short plain-English copy, no jargon. Icons paired with labels. Large readable text (16 px minimum for body).
- Mobile-first (design at 360 px width), works on low-end Android devices and slow connections: skeleton loaders, retry on failed requests, no layout shift.
- Show progress in multi-step flows. Always show the exact amount the farmer will pay before they pay.
- Error messages say what happened and what to do next. Never show raw errors.
- Wrap all text for future translation (Yoruba, Pidgin) using an i18n library with English strings only for now.
- Accessible by default: contrast, focus states, labels on inputs, semantic HTML.

### 9.5 Screens
**Farmer:** Home with search entry, phone and OTP, search form, results list, facility detail, booking review (with delivery and presale options), payment, booking confirmation, My bookings, booking detail, rating.
**Provider:** onboarding wizard, dashboard, bookings list, booking detail with check-in and collect, facility settings, earnings.
**Link pages (no login):** provider accept or reject, delivery partner accept and update status.
**Admin:** the sections in 7.11.

---

## 10. Security, privacy and compliance

- Helmet, strict CORS allowlist, rate limiting on all auth, search and booking routes, request size limits.
- Validate all input with Zod on the server. Parameterised queries only.
- Secrets in environment variables, never committed. Separate keys per environment.
- Verify Paystack webhook signatures. Reject unsigned or replayed events.
- Row Level Security on every table with deny-by-default for the `anon` role.
- Log with structured logging (pino). Never log OTPs, tokens, or full phone numbers.
- Phone numbers are personal data. Follow the Nigeria Data Protection Act 2023: record consent, publish a short privacy notice in plain language, collect only what is needed, support deletion requests, and restrict admin access to phone numbers by role.
- Facility photos are stored in a Supabase Storage bucket with size and type limits.
- Keep an audit trail (`booking_events`, admin change log).

---

## 11. Non-functional requirements

- **Performance:** search p95 under 500 ms; booking creation p95 under 1.5 s excluding payment; API errors under 1% of requests.
- **Reliability:** webhook handling is idempotent; all jobs are idempotent; the SMS provider failing must not fail a booking (queue and retry, then alert).
- **Observability:** Sentry (or equivalent) for frontend and backend, request logging with correlation IDs, a health endpoint.
- **Testing:**
  - Unit tests (Vitest) for pricing, availability, state machine and ranking.
  - API integration tests (Supertest) against a test database.
  - End-to-end tests (Playwright) for the core flows: register, search, book, pay (Paystack test mode), provider accepts, check-in, collect, rate.
  - The worked example in 6.1 is a required test.
- **CI/CD:** GitHub Actions runs lint, typecheck, tests and migrations check on every pull request. Deploy to staging on merge to `main`, production by tagged release.
- **Migrations:** forward-only SQL migrations, reviewed like code. Never edit a migration that has run in production.

---

## 12. Delivery plan and acceptance criteria

**Phase 0: Audit and setup.** `docs/current-state.md` and `docs/discrepancies.md` written. Monorepo created, CI running, three Supabase projects set up.
*Accept:* the team can read how the current app and bot work without opening the code.

**Phase 1: TypeScript migration of the frontend.** Convert, keep behaviour the same, still on mock data. Adopt design tokens.
*Accept:* `tsc` passes in strict mode, no `any` outside justified exceptions, the app looks and behaves as before.

**Phase 2: Database.** Migrations for all tables in Section 5, PostGIS enabled, RLS on, seed data (crops, config, dev providers).
*Accept:* migrations run clean on a fresh project; seed loads; geo query returns providers sorted by distance.

**Phase 3: Core API.** Auth with OTP, users, providers, crops, search, quote.
*Accept:* a new user can register by OTP and search; search respects availability, crop category and radius; ranking matches 6.8.

**Phase 4: Booking and payments.** Booking engine, capacity locking, state machine, Paystack initialise and webhook, refunds, SMS notifications, jobs.
*Accept:* the worked example in 6.1 produces exact figures; two simultaneous bookings for the last capacity cannot both succeed; a rejected or expired booking refunds automatically; webhook replays are harmless.

**Phase 5: Frontend integration and provider side.** Connect screens to the API, provider onboarding and dashboard, link-based accept and reject, ratings, My bookings and Book again.
*Accept:* the end-to-end Playwright test passes on staging in Paystack test mode.

**Phase 6: Delivery module.** Delivery quote, requests, admin assignment, partner link pages, handover code, payouts record.
*Accept:* a delivery can be requested at booking, assigned, completed with a handover code, and shows correct fee and partner payout.

**Phase 7: Marketplace data layer and admin.** Presale opt-in at booking creating draft listings, admin listing view, price observations view, admin dashboard, config editing.
*Accept:* opting in creates a `draft` listing visible only to admins; no public route exposes it.

**Phase 8: Hardening and launch.** Security review, load test of search, error monitoring, production deploy, runbook.
*Accept:* checklist in Section 10 complete. (Re-pointing the WhatsApp bot is deferred; see `docs/decisions.md`.)

---

## 13. Seed data

- **Crop categories:** vegetables, fruits, tubers, fish, meat and poultry, dairy, other.
- **Crops (examples, extend after the audit):** tomatoes, peppers (tatashe, rodo, shombo), leafy vegetables (ugu, efo, amaranth), okra, cabbage, carrots, oranges, pineapples, watermelon, plantains, yam, cassava, fresh fish, chicken.
- **Dev providers:** 8 to 10 sample providers around Ibadan (Bodija, Oje, Dugbe, Apata, Iwo Road) with a mix of facility types. Mark all dev data clearly and keep it out of production seed. Real provider details may be added only with each provider's consent.
- **Config:** placeholders from Section 5.15.

---

## 14. Open decisions (defaults used if unanswered)

| # | Decision | Default in this PRD |
|---|---|---|
| 1 | Backend language | TypeScript (the team said JavaScript; TypeScript is recommended so types are shared) |
| 2 | OTP at login | On. Can be turned off with `otp_required`, but not recommended while real money is involved |
| 3 | Deposit percentage | 30% of storage subtotal (earlier discussion said "half now"; it must stay above the commission rate) |
| 4 | Service fee amount | 0 until the team decides |
| 5 | Delivery fees and partner share | Placeholders in 5.15 |
| 6 | Delivery model | Third-party partners with manual dispatch (no own fleet) |
| 7 | Capacity unit | Provider chooses `sqm`, `crates` or `kg`; the revenue model so far uses price per sqm per day |
| 8 | Cancellation policy | As in 6.6 |
| 9 | Provider response window | 120 minutes |
| 10 | API hosting | Render or Railway, not Vercel serverless |
| 11 | Provider approval before listing | On |
| 12 | Paystack live mode | Needs a registered business; test mode until then |

---

## 15. Roadmap (not in this build, but do not design against)

- Public presale marketplace: buyer browsing, 20% reservation deposits, pickup codes, delivery through the existing delivery module.
- Market price analytics from the price observations view.
- USSD access using the `coldlink_id` (add a PIN) and the same API.
- Predictive spoilage warnings using crop shelf life, season and time since harvest.
- Provider verification visits, photo and temperature checks, and automatic suspension for low ratings.
- Training programme enrolment and payment.
- Additional languages.
- Expansion to other cities and states.
