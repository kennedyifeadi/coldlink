# Discrepancies between the app and the PRD

Every place where the current web app and `docs/prd.md` disagree. The app is as described in `docs/current-state.md` (audited at `2a71022`), checked against the code where needed. Decisions already recorded in `docs/decisions.md` are linked, not reopened. The WhatsApp bot is out of scope (decision 3).

Each entry gives:

- **App:** what the app does today, with the file or the `current-state.md` section (CS).
- **PRD:** what the PRD says, with its section.
- **Resolution:** the open issue that will resolve it, or **Owner question** when no issue covers it or a choice is needed. Owner questions are collected at the end.
- **Proposal:** only where the current behaviour is better than the PRD, or where the PRD leaves a gap the app already fills.

Entries are numbered by area (for example `ID-1`) so the owner questions and later PRs can refer to them.

## Contents

1. [Identity and sign-in](#1-identity-and-sign-in)
2. [Search and matching](#2-search-and-matching)
3. [Booking and pricing](#3-booking-and-pricing)
4. [Payment](#4-payment)
5. [Data and units](#5-data-and-units)
6. [Design and UI](#6-design-and-ui)
7. [Platform and tooling](#7-platform-and-tooling)
8. [Missing screens and features](#8-missing-screens-and-features)
9. [Copy that promises things the app does not do](#9-copy-that-promises-things-the-app-does-not-do)
10. [The old MVP specification](#10-the-old-mvp-specification)
11. [Owner questions](#11-owner-questions)

---

## 1. Identity and sign-in

### ID-1. ColdLink ID format

- **App:** a fixed `CL-482731` (`CL-` plus 6 digits) shown to every user, unrelated to the phone number entered (`src/pages/UserId.jsx:12`; CS 4.2).
- **PRD:** `coldlink_id` is a 7-digit numeric ID, random and non-sequential, created on first OTP verification and shown prominently because it will be the USSD and support identity (PRD 5.1, 7.1).
- **Resolution:** #20 (generation), #31 (ID screen).
- **Note:** the PRD format is better. The app's user ID (`CL-482731`) and booking code (`CL-847291`) have the same shape, so a farmer reading one out on a support call can be mistaken for the other. A plain 7-digit number also suits USSD keypads. Do not add a `CL-` prefix to the 7-digit ID.

### ID-2. No OTP

- **App:** no verification at all. Any phone number goes straight to the ID screen (`src/pages/Onboarding.jsx:9-14`; CS 4.1).
- **PRD:** 6-digit SMS OTP, hashed, 10-minute expiry, 5 attempts, rate-limited; `otp_required` defaults on (PRD 5.2, 7.1, 14 #2).
- **Resolution:** #20 (API), #31 (OTP screen).

### ID-3. Phone number validation

- **App:** any characters are accepted with no length limit. The button enables at 5 characters but submit needs more than 5, so at exactly 5 it looks enabled and does nothing (`src/pages/Onboarding.jsx:11`, `80`; CS 5.1). No `inputMode`, no error message.
- **PRD:** normalise to E.164 (+234) on the server; validate every form with the shared Zod schemas; error messages say what happened and what to do (PRD 0.2, 7.1, 9.4).
- **Resolution:** #20 (normalisation), #31 (field validation and errors).
- **Proposal:** the PRD does not say what the farmer may type. Accept the forms Nigerians actually use (`08012345678`, `8012345678`, `+2348012345678`, with spaces) and normalise them, rather than rejecting a leading `0` next to the fixed "+234" label. Use `inputMode="numeric"`.

### ID-4. Sessions, route guards and sign-out

- **App:** no session. Every screen can be opened directly by URL; unknown paths render a blank page (`src/App.jsx:19-31`; CS 4).
- **PRD:** JWT access token plus refresh cookie, role middleware, route guards by role (PRD 7.1).
- **Resolution:** #20 (API), #31 (session handling and guards). The blank page on unknown routes is not covered: see [OQ-12](#11-owner-questions).

### ID-5. Data-protection consent

- **App:** no consent step or privacy notice.
- **PRD:** record consent at registration and publish a short plain-language privacy notice (PRD 7.1, 10).
- **Resolution:** #31 (UI), #20 (`consented_at`), #50 (deletion requests).

### ID-6. Profile tab

- **App:** the bottom nav has a Profile tab that opens the ColdLink ID screen (`src/components/BottomNav.jsx:26-32`; CS 3.3).
- **PRD:** no profile screen is listed (PRD 9.5), although 7.1 asks for the ID to be shown prominently and `PATCH /me` and `POST /auth/logout` exist with no screen that uses them (PRD 8).
- **Resolution:** Owner question ([OQ-9](#11-owner-questions)).
- **Proposal:** keep the Profile tab. Make it show the ColdLink ID, phone number and name (editable through `PATCH /me`) and a sign-out button. Add it to #31.

## 2. Search and matching

### SM-1. No filtering or ranking

- **App:** Discovery lists every mock room in file order. Location and produce are ignored; `supportedProduce` is never read; distance is a fixed number (`src/pages/Discovery.jsx:53`, `src/data/mockData.js:13-50`; CS 7).
- **PRD:** hard filters (approved, accepting bookings, crop category, available quantity for the date range, within radius), then distance ascending with rating as tie-break (PRD 6.8).
- **Resolution:** #23 (endpoint), #15 (SQL functions), #32 (screen).

### SM-2. Full rooms can be booked

- **App:** Moniya Hub Coolers (0 of 30) is listed with an enabled "View storage" button (CS 7).
- **PRD:** only providers with `available_quantity >= requested quantity` are returned (PRD 6.8 step 1), and capacity is re-checked under lock at booking (PRD 6.3).
- **Resolution:** #23, #26.

### SM-3. No radius and no empty state

- **App:** no radius. There is always a list because the data is fixed.
- **PRD:** default 25 km, retry once at 100 km with `expanded_radius: true`, then log and show a clear empty state (PRD 5.15, 6.8 step 4).
- **Resolution:** #23 (logic), #32 (expanded-radius notice and empty state).

### SM-4. Location is never real

- **App:** "Use my current location" sets the fixed string "Supreme School, Magodo, Lagos"; manual entry always shows the same three Lagos suggestions; the value is discarded (`src/pages/Location.jsx:13-18`, `39-43`; CS 4.3, 5.2).
- **PRD:** device geolocation, pick an area from a list, or drop a pin on a Leaflet/OpenStreetMap map (PRD 4.1, 7.3). The product is for Oyo State (PRD title, 13).
- **Resolution:** #32.

### SM-5. Search inputs and order of steps

- **App:** search takes location and produce only. Quantity is chosen after picking a facility (Details) and days after that (Duration). There is no start date (CS 4.3-4.7).
- **PRD:** the search form takes location, crop, quantity, days and start date (default today) up front, so results can be filtered by availability and show a total price (PRD 7.3).
- **Resolution:** #32.
- **Note:** the PRD order is needed for SM-1 and SM-2 to work, so it should win. Keep the app's one-question-per-screen pacing for the new inputs rather than one long form.

### SM-6. Result cards

- **App:** each card shows photo, name, rating, distance, price per day and "{available} of {total} spaces", with a "View storage" button (`src/pages/Discovery.jsx:53-109`; CS 4.5).
- **PRD:** name, facility type icon, distance, available quantity, total price estimate, rating, and one primary "Book" button (PRD 7.3, 6.8 step 3).
- **Resolution:** #32 (photos go in #8, decision 2). The primary button label is Owner question [OQ-11](#11-owner-questions).
- **Proposal:** keep two things from the app. (1) The low-availability warning ("Only N spaces left" when 10% or less remains, `src/pages/Discovery.jsx:13`, `54`) is useful and the PRD is silent on it; keep it, in alert coral. (2) The availability bar is a quick read for low-literacy users. Show providers with no ratings yet as "New" instead of "0.0", since `avg_rating` defaults to 0 (PRD 5.3).

### SM-7. Filter pills do nothing

- **App:** "Tomatoes", "Ibadan" and "Filters" are buttons with no handler and fixed text (`src/pages/Discovery.jsx:40-48`; CS 7).
- **PRD:** no filter pills; filtering is by the search inputs (PRD 7.3).
- **Resolution:** #32. Replace them with a summary of the current search (crop, quantity, days, area) that opens the search form to edit.

### SM-8. Matching by produce, not by category

- **App:** mock rooms list individual produce (`tomato`, `pepper`, `onion`) in `supportedProduce` (`src/data/mockData.js:22`, `34`, `46`), though nothing reads it.
- **PRD:** providers declare supported categories; compatibility is by category (PRD 5.4).
- **Resolution:** #12 (schema), #23 (filter), #37 (category chips in onboarding).

## 3. Booking and pricing

### BP-1. Deposit: 50% vs 30%

- **App:** "You'll pay 50% now to secure the space" (`src/pages/Review.jsx:92`; CS 8.2). The 50% is taken on the whole total, including delivery and the fee.
- **PRD:** `deposit_percent` placeholder 0.30 of the storage subtotal only; service fee and delivery are paid in full online (PRD 5.15, 6.1, 14 #3). The PRD notes "earlier discussion said half now".
- **Resolution:** Owner question ([OQ-1](#11-owner-questions)). The value lives in `app_config` (#16) and the formula in #18, so either answer needs no code change beyond the seed.
- **Note:** the PRD's structure is better regardless of the percentage. Splitting the fee and delivery 50/50 would make the provider collect ColdLink's fee and the delivery partner's fee at the facility.

### BP-2. Balance: "provider's arrangement" vs paid at the facility

- **App:** the remaining 50% is paid "according to the storage provider's arrangement" (`src/pages/Review.jsx:92`); Confirmation says "To be paid on arrival" (`src/pages/Confirmation.jsx:121`). The two screens already disagree.
- **PRD:** `balance_due` is paid to the provider at the facility; the provider confirms collection; ColdLink does not process it (PRD 6.1, 6.4 step 5).
- **Resolution:** #33 (review copy), #34 (confirmation copy). Use one plain line on both: "Pay the balance of ₦X to [facility] when you drop off your produce."

### BP-3. Booking fee ₦100 vs Service Fee ₦300 vs config

- **App:** Duration shows "Booking fee ₦100" (`src/pages/Duration.jsx:12`); Review shows "Service Fee ₦300" (`src/pages/Review.jsx:72-73`; CS 8.2, 10).
- **PRD:** `service_fee_kobo`, placeholder 0, amount TBD (PRD 1, 5.15, 14 #4). Never invent business values (PRD 0.2).
- **Resolution:** Owner question ([OQ-2](#11-owner-questions)) for the amount; #16 seeds it, #18 and #24 compute it, #33 shows it.
- **Proposal:** the old spec calls the ₦100 booking fee "a defined part of the current transaction model" (`ColdLink_Product_MVP_Specification.md` sections 19 and 46). If the owner confirms that, seed `service_fee_kobo = 10000` instead of 0. Use one label on every screen; the PRD says "service fee".

### BP-4. Commission

- **App:** no commission anywhere.
- **PRD:** 7.5% of the storage subtotal, deducted from the provider's side; provider payout = deposit − commission (PRD 1, 6.1).
- **Resolution:** #18 (pricing), #28 (payout on check-in), #39 (earnings screen). The farmer never sees the commission, so no farmer-screen change.

### BP-5. Only one screen calculates money

- **App:** Duration computes `days × 1500 + 800 + 100`; it ignores the units chosen on Details and the room's `pricePerDay`. Review, Payment and Confirmation show hardcoded strings (CS 8, 10).
- **PRD:** `storage_subtotal = quantity × duration_days × unit_price`, all amounts from `POST /bookings/quote` and snapshotted on the booking (PRD 5.5, 6.1).
- **Resolution:** #18 (formula and worked example), #24 (quote), #33 (amounts from the API only).

### BP-6. Delivery always included, at a flat fee

- **App:** Duration and Review always add delivery: ₦800 on Duration, ₦600 on Review (`src/pages/Duration.jsx:11`; CS 8.1, 8.2). The copy says it is distance-based; it is a constant.
- **PRD:** delivery is optional ("Do you need pickup from your farm?"), partner-based and manually dispatched; `fee = max(min_fee, base_fee + per_km × km)` with road-distance estimate; placeholders ₦1,000 base, ₦100/km, ₦1,000 minimum (PRD 5.15, 7.4 step 2, 7.7).
- **Resolution:** #42 (quote and request), #44 (booking flow). The fee values are Owner question ([OQ-3](#11-owner-questions)): the app's ₦600-₦800 is below the PRD's ₦1,000 placeholder minimum.

### BP-7. State is lost between screens

- **App:** every screen has local state only; phone, location, produce, facility, units and days never reach a later screen. "Edit booking" on Review returns to Duration reset to 3 days (CS 4.8, 6).
- **PRD:** the review screen shows the farmer's actual facility, quantity and dates (PRD 7.4 step 1); server state through TanStack Query (PRD 4.1).
- **Resolution:** #32, #33.
- **Proposal:** keep "Edit booking" on the review screen (the PRD does not mention it; the old spec section 21 asks for it), but make it keep the farmer's choices.

### BP-8. Quantity limits

- **App:** units 1-10, with 10 a constant on Details (`src/pages/Details.jsx:9`); days 1 or more with no maximum and no provider minimum (`src/pages/Duration.jsx:15-21`; CS 5.4, 5.5).
- **PRD:** quantity limited by available quantity for the date range; `min_storage_days` per provider (PRD 5.3, 6.2).
- **Resolution:** #32 (search inputs), #33 (detail and review), #24 (quote rejects insufficient capacity).

### BP-9. "Booking confirmed!" straight after payment

- **App:** Confirmation says "Booking confirmed!" as soon as Pay is pressed (`src/pages/Confirmation.jsx:32-42`).
- **PRD:** after payment the booking is `pending_provider`; the farmer sees "Waiting for [facility] to confirm" with the response deadline; `booking_confirmed` is sent when the provider accepts (PRD 6.5, 7.4 step 6, 7.6).
- **Resolution:** #34 (waiting state), #28 (accept), #29 (SMS).

### BP-10. Booking code format

- **App:** `CL-847291`, `CL-` plus 6 digits, hardcoded (`src/pages/Confirmation.jsx:53`); the Payment screen also shows "Order #882-991A" (`src/pages/Payment.jsx:24`).
- **PRD:** `CL-` plus 5 characters from an alphabet without 0/O/1/I, for example `CL-7K3Q9`, unique (PRD 5.5). No separate order number; the Paystack reference is internal.
- **Resolution:** #26 (generation), #34 (confirmation; drop the order number).
- **Note:** the PRD format is better: shorter to read out, no confusable characters, and visibly different from the ColdLink ID (see ID-1).

### BP-11. No cancellation

- **App:** no way to cancel.
- **PRD:** cancellation policy with free window and forfeits (PRD 6.6).
- **Resolution:** #26 (API), #35 (cancel from booking detail, with the policy shown first).

### BP-12. Dates

- **App:** Confirmation shows "Oct 12 - Oct 15 (3 days)", hardcoded and not related to today or the days chosen (`src/pages/Confirmation.jsx:93`).
- **PRD:** `start_date` (default today), `end_date = start_date + duration_days`, displayed in Africa/Lagos time (PRD 5, 5.5, 7.3).
- **Resolution:** #32 (start date input), #34 (confirmation from booking data).

## 4. Payment

### PA-1. Mock card, transfer and USSD tabs

- **App:** Card, Transfer and USSD tabs; the card tab has its own Card Number, Expiry and CVV fields that are never read; Transfer and USSD show "Select card to view the mock flow."; Pay works with empty fields (`src/pages/Payment.jsx:29-137`; CS 4.9, 5.6).
- **PRD:** the API initialises a Paystack transaction and the farmer pays in Paystack checkout; payment confirmed by webhook (PRD 7.4 step 4, 7.5).
- **Resolution:** #27 (API), #34 (screen). Card fields must not be collected on ColdLink's own page.
- **Note:** the app's idea of offering transfer and USSD is right for farmers without cards. Paystack checkout offers these itself, so the method tabs go but the methods stay. Which channels to enable is Owner question [OQ-4](#11-owner-questions).

### PA-2. "Save card for future payments"

- **App:** a toggle whose value is unused (`src/pages/Payment.jsx:9`, `119-126`).
- **PRD:** no saved cards. Book again (PRD 7.9) reaches payment in 4 taps without it.
- **Resolution:** #34 (remove).

### PA-3. Amount paid online

- **App:** ₦2,700, 50% of a total that includes delivery and the fee (CS 8.2, 8.3).
- **PRD:** `charged_online = deposit + service_fee + delivery_fee`, shown as "You pay now: ₦X" before paying (PRD 6.1, 7.4 step 1, 9.4).
- **Resolution:** #18, #33, #34. Percentage per [OQ-1](#11-owner-questions).

### PA-4. Refunds and failure states

- **App:** no failure, retry, refund or payment-in-progress states.
- **PRD:** payment-in-progress state; automatic full refund on reject or timeout; refunds through the Paystack API (PRD 6.4, 7.4, 7.5).
- **Resolution:** #27 (refunds), #34 (in-progress, failure and retry states).

## 5. Data and units

### DU-1. Produce list vs crop categories and crops

- **App:** nine produce tiles plus "Other" (`src/data/mockData.js:1-11`, `src/pages/Produce.jsx:9`; CS 9.1). The list mixes crops (Tomatoes, Peppers, Onions, Yams / Tubers) with categories (Leafy Vegetables, Fruits, Meat & Poultry, Fish & Seafood, Dairy Products).
- **PRD:** seven categories (vegetables, fruits, tubers, fish, meat_poultry, dairy, other) and a `crops` table with local names, e.g. tatashe, rodo, shombo, ugu, efo (PRD 5.4, 13). Bookings reference a `crop_id` (PRD 5.5).
- **Resolution:** #12 (schema), #16 (seed), #21 (`GET /crops`), #32 (picker).
- **Proposal:** (1) Keep the app's tile grid of common crops as the first thing farmers see; it is faster than a list for low-literacy users. Add search across `name` and `local_names` for the rest, and show the local name on each tile. (2) The PRD seed list (PRD 13) has no onions, which the app and the old spec both include and which are a major stored crop in Oyo State. Add onion to the seed in #16.

### DU-2. "Other" produce

- **App:** an "Other" tile with no further input (`src/pages/Produce.jsx:9`).
- **PRD:** an `other` category exists, but every booking needs a `crop_id` (PRD 5.4, 5.5), and the PRD does not say how a farmer books produce that is not in the crop list.
- **Resolution:** Owner question ([OQ-5](#11-owner-questions)).
- **Proposal:** seed one generic crop per category ("Other vegetables", "Other fruits", …), matched by category like any other crop, with an optional free-text note on the booking (`notes`, PRD 5.5).

### DU-3. Capacity units

- **App:** "units" on Details, "spaces" on Discovery, "2 Crates (100kg)" on Review, "50 Crates" on Confirmation (CS 10). No unit is defined anywhere.
- **PRD:** the provider chooses `sqm`, `crates` or `kg`; quantity is in the provider's unit and copied onto the booking (PRD 5.3, 5.5, 14 #7). The revenue model so far prices per sqm per day.
- **Resolution:** Owner question ([OQ-6](#11-owner-questions)); then #12, #18, #32, #37.
- **Note:** farmers count produce in crates, baskets and bags, not square metres. A search for "20 crates of tomatoes" cannot be matched against a provider listed in sqm without a conversion the PRD does not define.

### DU-4. Money as naira floats

- **App:** amounts are plain JavaScript numbers in naira, formatted with `toLocaleString()`, so separators depend on the browser locale (CS 8.1).
- **PRD:** integer kobo end to end, displayed in naira (PRD 5, 7.5).
- **Resolution:** #18 (money helpers), #10 (one naira formatter, `en-NG`).

### DU-5. Facility data

- **App:** no facility type, address, landmark or phone; mock `location` field is never read; Details invents "Frozen (-18°C)" and "Insured" pills (`src/pages/Details.jsx:69`, `72`; CS 9).
- **PRD:** `facility_type` (cold room, chest freezer, fridge, fridge fleet, other), address, landmark, phone, optional `temp_min_c`/`temp_max_c`, `has_backup_power`, photos. No insurance field (PRD 5.3).
- **Resolution:** #12 (schema), #33 (detail screen). The "Insured" claim is Owner question [OQ-7](#11-owner-questions).
- **Proposal:** backup power matters more to farmers in Oyo State than a temperature figure; show it on the detail screen when known.

### DU-6. Mock data across four cities

- **App:** facilities in Ibadan, Abuja, Lagos (Ketu) and Kano appear on different screens; locations are in Magodo, Lagos (CS 10).
- **PRD:** Oyo State; dev seed of 8-10 providers around Ibadan; mock provider data removed once the API is live (PRD 9.1, 13).
- **Resolution:** #8 (consistent Ibadan mock data until then), #16 (dev seed), #32 (remove mock data).

## 6. Design and UI

### DS-1. Colours and font

- **App:** scattered hex values (greens `#68a042`, `#7ba962`, `#82b467`, …, amber `#fab94a`, red `#c9302c`) and the system font (CS 11.3).
- **PRD:** PRD 9.3 palette and Fraunces/Nunito as tokens.
- **Resolution:** settled by **decision 1**; implemented in #7. Not reopened.
- **Note for #7:** primary buttons are green today (`bg-[#82b467]` on every main button, e.g. `src/pages/Duration.jsx:105`). PRD 9.3 makes amber `#F0A93E` the primary-action colour. White text on that amber is well below WCAG AA contrast, so primary buttons will need deep-green `#233D22` text. #7 already includes a contrast check.

### DS-2. Generated-looking UI

- **App:** decorative gradients and sparks, Unsplash photos, a fake card-brand logo (CS 4.2, 4.9, 11.2).
- **Resolution:** settled by **decision 2**; implemented in #8.

### DS-3. Logo drawn in markup

- **App:** the logo is a Snowflake icon plus text, copied in three places; the logo PNGs are unused (CS 3.4, 11.4, 12).
- **PRD:** use the logo files; do not redraw them (PRD 9.3).
- **Resolution:** #7.

### DS-4. Text size

- **App:** `text-sm` (14 px) appears 42 times, `text-xs` 5 times and `text-[11px]` 3 times across pages and components, including body copy such as the payment-plan explanation (`src/pages/Review.jsx:92`).
- **PRD:** 16 px minimum for body text (PRD 9.4).
- **Resolution:** #7 (type scale). Small text is fine for labels; body copy moves to 16 px.

### DS-5. Accessibility

- **App:** no input has a linked label; the profile avatar is a `div`; the "checkbox" on Payment is a styled button; `pb-safe` and `scrollbar-hide` are used but undefined (CS 3.2, 3.5, 5).
- **PRD:** labels on inputs, semantic HTML, focus states (PRD 9.4).
- **Resolution:** partly #9 (shared components) and #10 (aria labels); labels and semantics are not explicitly in any issue. Owner question [OQ-12](#11-owner-questions).

### DS-6. Progress, loading and errors

- **App:** no progress indicator, loading state, error message or retry anywhere (CS 5).
- **PRD:** show progress in multi-step flows; skeleton loaders, retry, no layout shift; plain error messages (PRD 9.4).
- **Resolution:** #33 (progress), #32 (skeletons, retry), #31 and #34 (error states).

### DS-7. Strings not externalised

- **App:** every string is hardcoded in JSX.
- **PRD:** wrap all text for translation, English only for now (PRD 2, 9.4).
- **Resolution:** #10.

## 7. Platform and tooling

### PT-1. Mobile-only gate

- **App:** at 769 px and wider the whole app is replaced by "Mobile Experience Only" (`src/components/MobileOnlyLayout.jsx:5-32`; CS 3.1).
- **PRD:** mobile-first, designed at 360 px (PRD 9.4). Not mobile-only: the admin dashboard (PRD 7.11) and provider dashboard (PRD 7.2) will be used on laptops, and a farmer on a tablet or a phone in landscape can be over 768 px.
- **Resolution:** #9 (render centred at mobile width on desktop). Admin and provider screens will also need a wider layout; #38 and #47 should not inherit the 430 px frame.

### PT-2. JavaScript vs strict TypeScript

- **App:** JavaScript `.jsx`/`.js`; `@types/react` installed but unused (CS 2, 11.1).
- **PRD:** strict TypeScript with `noUncheckedIndexedAccess`; shared Zod types (PRD 4.1, 9.1).
- **Resolution:** #6, #18.

### PT-3. oxlint vs ESLint and Prettier

- **App:** oxlint with `react` and `oxc` plugins; no formatter (`.oxlintrc.json`; CS 2).
- **PRD:** ESLint (typescript-eslint) and Prettier in CI (PRD 9.1).
- **Resolution:** #6, with Owner question [OQ-8](#11-owner-questions).
- **Proposal:** oxlint is much faster than ESLint and already clean. Rather than removing it, #6 could run oxlint first and ESLint only for the type-aware typescript-eslint rules (with `eslint-plugin-oxlint` turning off the overlapping rules). This still meets PRD 9.1. Record whichever is chosen in `docs/decisions.md`, as #6 already requires.

### PT-4. No tests

- **App:** no test runner and no tests (CS 2).
- **PRD:** Vitest unit tests, Supertest integration tests, Playwright end-to-end; the 6.1 worked example is a required test (PRD 11).
- **Resolution:** #5 (Vitest and CI), #17 (Supertest harness), #18 (worked example), #41 (Playwright).

### PT-5. Bundle size

- **App:** one 915 kB bundle (241 kB gzipped); Vite warns. Likely cause: `import * as Icons from 'lucide-react'` in `src/pages/Produce.jsx:3` (CS 2). Unsplash photos add more on top.
- **PRD:** keep the bundle small; route-level code splitting (PRD 9.2).
- **Resolution:** #9 (code splitting; bundle must shrink), #8 (photos). The icon import is not named in either issue; whichever lands first should replace it with named imports, since code splitting alone will not remove the whole icon set from the Produce chunk.

### PT-6. Repository layout and package manager

- **App:** a single Vite app at the root with npm and `package-lock.json`; Tailwind under `dependencies`; template README (CS 2, 11.1, 12).
- **PRD:** pnpm monorepo with `apps/web`, `apps/api`, `packages/shared`, `supabase/` (PRD 4.2).
- **Resolution:** #4 (layout, README), #8 (unused files and `framer-motion`).

### PT-7. Missing libraries from the PRD stack

- **App:** none of TanStack Query, React Hook Form, Zod, Leaflet, an i18n library or Sentry (CS 11.1).
- **PRD:** all of these (PRD 4.1, 9.4, 11).
- **Resolution:** #31 (TanStack Query), #6 (Zod env), #32 (Leaflet), #10 (i18n), #49 (Sentry). React Hook Form is not named in an issue; adopt it with the first real form in #31.

### PT-8. No backend, CI or environments

- **App:** front end only; no API, database, CI or environment variables (CS 1).
- **PRD:** Express API, Supabase Postgres, three environments, GitHub Actions (PRD 4, 11).
- **Resolution:** #3, #4, #5, #11, #17, #52.

### PT-9. Favicon and page title

- **App:** `index.html` points to a missing `/favicon.svg`; `public/favicon.ico` is a renamed PNG; the title is "coldlink" (CS 12).
- **PRD:** no specific rule; the logo files are the brand (PRD 9.3).
- **Resolution:** #8 covers the favicon reference. Set the title to "ColdLink" in the same change.

## 8. Missing screens and features

Screens in PRD 9.5 that the app does not have:

| Screen or feature | PRD | Resolution |
|---|---|---|
| Home with search entry (returning users currently land on phone entry every time) | 9.5, 7.9 | #32 |
| OTP entry | 7.1, 9.5 | #31 |
| Consent and privacy notice | 7.1, 10 | #31 |
| Search form with quantity, days and start date | 7.3 | #32 |
| Facility detail from real data | 9.5 | #33 |
| Delivery option on review | 7.4 step 2, 7.7 | #44 |
| Presale opt-in on review | 7.4 step 3, 7.10 | #45 |
| Payment in progress, failure and retry | 7.4 step 4 | #34 |
| "Waiting for [facility] to confirm" | 7.4 step 6 | #34 |
| My bookings (the Bookings tab is inert today, `BottomNav.jsx:19-24`) | 7.9, 9.5 | #35 |
| Booking detail and cancel (Confirmation's "View booking" goes to Discovery today) | 6.6, 9.5 | #35 |
| Book again | 7.9 | #35 |
| Rating | 6.7, 7.8 | #36 |
| Provider onboarding wizard | 7.2 | #37 |
| Provider dashboard, bookings list, booking detail with check-in and collect | 7.2, 9.5 | #38 |
| Provider facility settings and earnings | 7.2, 9.5 | #39 |
| Provider accept/reject link page | 7.6, 9.5 | #40 |
| Delivery partner accept and status link pages | 7.7, 9.5 | #43 |
| Admin: providers and bookings | 7.11 | #47 |
| Admin: delivery queue, payouts, listings, config, stats | 7.11 | #48 |
| SMS notifications and reminders | 7.6, 7.13 | #19, #29, #30 |
| Not-found page for unknown routes | 9.4 (errors say what to do next) | Owner question [OQ-12](#11-owner-questions) |

## 9. Copy that promises things the app does not do

From CS 9.3, plus three more found on screens. None of these should ship once real users are on the app.

| Copy | Where | Why it is wrong today | Resolution |
|---|---|---|---|
| "Your phone number creates your ColdLink User ID." | `Onboarding.jsx:94` | The ID is a constant | Becomes true with #20; keep the line (the "No password required" part stays true with OTP) |
| "This ID works across ColdLink Web, WhatsApp and USSD." | `UserId.jsx:68` | USSD is out of scope (PRD 2); the bot is deferred (decision 3) | #31. Proposal: "Keep this number. Use it when you contact ColdLink." |
| "We'll use your location to find the closest available cold rooms and calculate delivery." | `Location.jsx:66` | Location is not used | #32; drop "and calculate delivery" unless #44 has shipped |
| "Delivery is calculated based on the distance between your location and the cold room." | `Duration.jsx:94` | Delivery is a constant | #42, #44 |
| "Secured by Paystack. 256-bit encryption." | `Payment.jsx:146` | No Paystack integration | #34 (Paystack checkout shows its own trust mark); #8 removes fake trust marks |
| "A confirmation has been sent to your phone." | `Confirmation.jsx:40` | Nothing is sent | #29, #34 |
| "Booking confirmed!" | `Confirmation.jsx:32-42` | The provider has not accepted yet | #34 (see BP-9) |
| "the remaining 50% according to the storage provider's arrangement" | `Review.jsx:92` | Disagrees with Confirmation's "on arrival" and with PRD 6.4 | #33 (see BP-2) |
| "Insured" | `Details.jsx:72` | No facility is known to be insured; the PRD has no such field | [OQ-7](#11-owner-questions) |

## 10. The old MVP specification

`ColdLink_Product_MVP_Specification.md` (v1.0, August 2026) sits in the repository root. It is the source of the current screens and their copy, and much of it agrees with the PRD in spirit, but it conflicts with the PRD in these places:

| Topic | Old spec | PRD |
|---|---|---|
| ID format | `CL-482731` (section 9) | 7-digit numeric (5.1) |
| Sign-in | phone only, no verification (8.1) | phone + OTP (7.1) |
| Booking fee | flat ₦100, "a defined part of the current transaction model" (19, 46) | `service_fee_kobo` TBD, placeholder 0 (5.15) |
| Upfront payment | 50% of the total, balance "according to the agreed arrangement" (20) | 30% of storage subtotal; balance at the facility (6.1, 6.4) |
| Delivery | always part of the booking, simple distance rule (18) | optional, partner-based, manually dispatched (7.7) |
| Commission | percentage of completed transactions (46) | 7.5% deducted from the deposit, owed at check-in (6.1, 6.4) |
| Facilities | cold rooms only; a provider owns several cold rooms (1, 53) | any facility type; one `providers` row per facility (5.3) |
| Ranking | distance, then availability, then price (14) | distance, then rating (6.8) |
| Matching | by produce (11, 14) | by crop category (5.4) |
| Booking statuses | Pending, Confirmed, Active, Completed, Rejected, Cancelled (24) | the state machine in 6.5 |
| Provider approval | a roadmap item (47) | in scope, on by default (7.2, 14 #11) |
| Ratings, Book again, SMS | "nice to have" (50) | in scope (7.6, 7.8, 7.9) |
| Provider SMS | "Open ColdLink to accept or reject" (30) | single-use accept/reject link, no login (7.6) |
| Background and primary colour | predominantly white background; green primary buttons (34, 37) | off-white `#F6F7EE` background; amber primary actions (9.3), adopted by decision 1 |
| Stack | Firebase or PostgreSQL; Paystack or Flutterwave (52) | Supabase Postgres; Paystack (4.1) |

It also has useful material the PRD does not: UX writing rules with prefer/avoid examples (41), a list of error states with sample copy (42), loading-state copy (43), and the rule that status is never shown by colour alone (24).

- **Resolution:** Owner question ([OQ-10](#11-owner-questions)).
- **Proposal:** move it to `docs/archive/mvp-specification-v1.md` with a one-line banner saying it is superseded by `docs/prd.md` and kept for history, so nobody builds from it by mistake. Before archiving, copy sections 24 (status never by colour alone), 41, 42 and 43 into the PRD's UX principles (9.4) or a short `docs/ux-writing.md`, since #8 and the new screens will need them.

## 11. Owner questions

Each needs a decision from the team. Once answered, record it in `docs/decisions.md` and update the linked issue.

| # | Question | Entries | Recommendation |
|---|---|---|---|
| OQ-1 | Deposit: 50% (current app and old spec) or 30% (PRD default) of the storage subtotal? | BP-1, PA-3 | 30%. It is lower for smallholders, still above the 7.5% commission, and ColdLink refunds it if the provider rejects. Either way it is a config value. |
| OQ-2 | Service fee amount: ₦100 (old spec, Duration screen), ₦300 (Review screen), or 0 until decided (PRD)? | BP-3 | ₦100, named "Service fee" on every screen, if the old spec's figure still stands. |
| OQ-3 | Delivery fees: confirm base, per-km, minimum and partner share. The app shows ₦600-₦800 flat; the PRD placeholders give a ₦1,000 minimum. | BP-6 | Confirm with the first delivery partner before #42 ships. |
| OQ-4 | Which Paystack channels to enable at checkout: card, bank transfer, USSD, bank? | PA-1 | All four. Many farmers have no card, and the current design already promises transfer and USSD. |
| OQ-5 | How does a farmer book produce that is not in the crop list ("Other")? | DU-2 | One generic crop per category, matched by category, with an optional note. |
| OQ-6 | Should farmers see sqm? If a provider lists in sqm, how does a farmer searching in crates or kg get matched? | DU-3 | Let providers choose only `crates` or `kg` for chest freezers and fridges, and for cold rooms ask for an approximate crates-per-sqm figure so search works in crates. |
| OQ-7 | Is any facility actually insured? Do we want an "insured" attribute on providers? | DU-5, §9 | Remove "Insured" until there is a verified attribute behind it. |
| OQ-8 | Keep oxlint alongside ESLint, or replace it as #6 currently plans? | PT-3 | Keep it for speed; ESLint for type-aware rules only. |
| OQ-9 | Keep a Profile tab (ColdLink ID, name, phone, sign out)? It is not in PRD 9.5. | ID-6 | Keep it and add it to #31. |
| OQ-10 | Archive or delete `ColdLink_Product_MVP_Specification.md`? | §10 | Archive under `docs/archive/` with a superseded banner, after lifting its UX writing, error and loading copy. |
| OQ-11 | Results card: one primary "Book" button (PRD 7.3) or "View storage" then book from the detail screen (app)? | SM-6 | "Book" as the primary button; tapping the card body opens the detail screen. |
| OQ-12 | Which issue owns the items no issue covers: a not-found page for unknown routes, labelled inputs and semantic controls, and replacing the whole-library `lucide-react` import? | ID-4, DS-5, PT-5, §8 | Add all three to #9, which already extracts shared components and checks bundle size. |
