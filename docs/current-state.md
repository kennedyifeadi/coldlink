# Current state of the ColdLink web app

How the frontend in this repository works today, written so the team can understand it without opening the code. Later issues use it as the reference for "keep the existing behaviour". It describes facts only; differences from `docs/prd.md` are covered separately.

Audited at commit `2a71022` on `main`. Line numbers refer to that commit.

The WhatsApp bot lives outside this repository and is not covered here (decision 3 in `docs/decisions.md`).

## Contents

1. [Summary](#1-summary)
2. [Stack and project layout](#2-stack-and-project-layout)
3. [Layout and shared components](#3-layout-and-shared-components)
4. [Routes and screens in flow order](#4-routes-and-screens-in-flow-order)
5. [Forms, inputs and validation](#5-forms-inputs-and-validation)
6. [State](#6-state)
7. [Search, filtering and ranking](#7-search-filtering-and-ranking)
8. [Booking, pricing and payment](#8-booking-pricing-and-payment)
9. [Hardcoded and mock data](#9-hardcoded-and-mock-data)
10. [Values that disagree between screens](#10-values-that-disagree-between-screens)
11. [Third-party libraries and remote assets](#11-third-party-libraries-and-remote-assets)
12. [Unused files and dependencies](#12-unused-files-and-dependencies)

---

## 1. Summary

- A front-end-only React app: no backend, no API calls, no `fetch`, no storage. Nothing a user enters is saved or sent anywhere.
- Ten screens are wired as a linear click-through: phone number → user ID → location → produce → list of cold rooms → facility details → duration → review → payment → confirmation.
- Each screen keeps its own local state, and nothing is passed between screens. Choices made on one screen (phone, location, produce, facility, units, days) never appear on a later one.
- Only two screens read the shared mock data file (`src/data/mockData.js`): Produce and Discovery. Every other screen hardcodes its own facility, quantities and amounts, and these values disagree with each other (see [section 10](#10-values-that-disagree-between-screens)).
- Only one screen calculates money: Duration (`days × 1500 + 800 + 100`). Every amount on Review, Payment and Confirmation is a hardcoded string.
- The app only renders at a viewport width of 768px or less. Wider screens see a "Mobile Experience Only" message.

## 2. Stack and project layout

| Item | Value | Source |
|---|---|---|
| Language | JavaScript (`.jsx`/`.js`), no TypeScript | `src/` |
| Framework | React 19.2.8 with `StrictMode` | `package.json`, `src/main.jsx:6-10` |
| Build tool | Vite 8 with `@vitejs/plugin-react` and `@tailwindcss/vite` | `vite.config.js:6-11` |
| Routing | `react-router-dom` 7, `BrowserRouter` | `src/App.jsx:2`, `src/App.jsx:17` |
| Styling | Tailwind CSS 4, utility classes inline in JSX, hex colours written directly in class names (no theme tokens) | `src/index.css:1` |
| Icons | `lucide-react` | every page |
| Lint | `oxlint` with the `react` and `oxc` plugins (`npm run lint`, currently reports nothing) | `.oxlintrc.json`, `package.json:10` |
| Tests | None. No test runner, no test files | `package.json:6-11` |
| Scripts | `dev`, `build`, `lint`, `preview` | `package.json:6-11` |

```
src/
  main.jsx                  entry; mounts <App /> and imports index.css
  App.jsx                   all routes
  index.css                 `@import "tailwindcss";` only
  App.css                   unused (see section 12)
  assets/                   two logo PNGs, unused
  components/
    MobileOnlyLayout.jsx    mobile gate + 430px frame, wraps every route
    TopNavBar.jsx           top bar with logo, title, optional back / avatar
    BottomNav.jsx           three-tab bottom bar
  data/
    mockData.js             produceOptions, coldRooms
  pages/                    one file per screen (10 files)
```

`npm run build` succeeds. It produces a single JavaScript bundle of about 915 kB (241 kB gzipped) and Vite warns that the chunk is over 500 kB. The likely cause is `import * as Icons from 'lucide-react'` in `src/pages/Produce.jsx:3`, which pulls in the whole icon set instead of only the icons used.

## 3. Layout and shared components

### 3.1 Mobile-only gate and frame (`src/components/MobileOnlyLayout.jsx`)

Every route is nested under this layout (`src/App.jsx:19`).

- **Gate:** `isMobile` is `window.innerWidth <= 768`, read on first render and updated on every `resize` event (`MobileOnlyLayout.jsx:5-14`). At 769px and wider the app is replaced by a dark full-screen card titled "Mobile Experience Only" with the text "ColdLink is designed as a mobile-first platform. Please revert to mobile view or resize your browser window to continue. Desktop screen isn't available." (`MobileOnlyLayout.jsx:16-32`). There is no way past it other than narrowing the window. The phone icon in the card is an inline SVG (`MobileOnlyLayout.jsx:21-23`).
- **Frame:** at 768px or less, routes render inside a white, centred column with `max-w-107.5` (430px), `min-h-screen`, a shadow and `overflow-hidden` (`MobileOnlyLayout.jsx:35-37`).
- Fixed bars (bottom nav and the sticky action areas) repeat the same width themselves with `fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px]` so they line up with the frame (for example `BottomNav.jsx:9`, `Produce.jsx:80`).

### 3.2 Top bar (`src/components/TopNavBar.jsx`)

Props: `title`, `showBack` (default `false`), `showProfile` (default `false`) (`TopNavBar.jsx:5`).

- Sticky at the top (`sticky top-0 z-10`, `TopNavBar.jsx:13`).
- **Back button** (when `showBack`): `navigate(-1)`, one step back in browser history (`TopNavBar.jsx:8-10`, `17-21`). If the screen was opened directly by URL, there is no in-app history to go back to.
- **Logo:** not an image. A green square with a `Snowflake` icon, the word "Cold" in dark green and "Link" in orange, and the tagline "STORAGE, NEARBY" (`TopNavBar.jsx:26-39`). Not clickable.
- **Title:** after a `|` separator, truncated at 120px (`TopNavBar.jsx:42-43`).
- **Profile avatar** (when `showProfile`): a green circle with a `User` icon (`TopNavBar.jsx:48-52`). It is a `div`, not a button, and does nothing.

### 3.3 Bottom nav (`src/components/BottomNav.jsx`)

Prop: `activeTab`, one of `find` (default), `bookings`, `profile` (`BottomNav.jsx:5`). The active tab is shown in green `#68a042`.

| Tab | Icon | Action | Source |
|---|---|---|---|
| Find Cold | `Snowflake` | Go to `/discovery` | `BottomNav.jsx:11-17` |
| Bookings | `ShoppingBag` | **Nothing.** The button has no `onClick`, and there is no bookings route | `BottomNav.jsx:19-24` |
| Profile | `User` | Go to `/userid` | `BottomNav.jsx:26-32` |

### 3.4 Which screen uses which bar

| Screen | Top bar | Top bar title | Back | Avatar | Bottom nav (active tab) |
|---|---|---|---|---|---|
| Onboarding | none (own logo) | | | | none |
| UserId | yes | "User Id" | no | yes | yes (`profile`) |
| Location | yes | "Location" | yes | no | none |
| Produce | yes | "Produce" | yes | no | none |
| Discovery | yes | "Cold Rooms" | no | yes | yes (`find`) |
| Details | yes | "Details" | yes | no | none |
| Duration | yes | "Duration" | yes | no | none |
| Review | yes | "Review" | **no** | yes | yes (`bookings`) |
| Payment | yes | "Payment" | yes | no | none |
| Confirmation | none (own centred logo) | | | | none |

The logo markup (snowflake square plus "Cold"/"Link" plus tagline) is copied three times at different sizes: `TopNavBar.jsx:26-39`, `Onboarding.jsx:20-33`, `Confirmation.jsx:12-27`.

### 3.5 Sticky bottom action areas

Most screens put their primary button in a bottom area with a white-to-transparent gradient (`bg-gradient-to-t from-white via-white to-transparent`).

- `fixed`, 430px wide, `z-20`: Produce (`Produce.jsx:80`), Details (`Details.jsx:113`), Duration (`Duration.jsx:102`), Payment (`Payment.jsx:142`).
- `absolute` at the bottom of the page container instead of `fixed`: Location (`Location.jsx:176`).
- In normal page flow (not sticky): Onboarding, UserId, Review, Confirmation.

These areas and `BottomNav` use a `pb-safe` class, and Discovery's filter row uses `scrollbar-hide`. Neither class is defined anywhere (no plugin or custom CSS), so both have no effect.

## 4. Routes and screens in flow order

Routes are declared in `src/App.jsx:19-31`. There are no route guards: every screen can be opened directly by URL and shows the same hardcoded content. There is no catch-all route, so an unknown path renders a blank page.

| Path | Screen | File |
|---|---|---|
| `/` | Redirects to `/onboarding` (`replace`) | `App.jsx:20` |
| `/onboarding` | Onboarding (phone number) | `src/pages/Onboarding.jsx` |
| `/userid` | UserId | `src/pages/UserId.jsx` |
| `/location` | Location | `src/pages/Location.jsx` |
| `/produce` | Produce | `src/pages/Produce.jsx` |
| `/discovery` | Discovery (cold room list) | `src/pages/Discovery.jsx` |
| `/details` | Details (facility and units) | `src/pages/Details.jsx` |
| `/duration` | Duration (days and cost) | `src/pages/Duration.jsx` |
| `/review` | Review | `src/pages/Review.jsx` |
| `/payment` | Payment | `src/pages/Payment.jsx` |
| `/confirmation` | Confirmation | `src/pages/Confirmation.jsx` |

Main flow: `/onboarding → /userid → /location → /produce → /discovery → /details → /duration → /review → /payment → /confirmation → /discovery`.

### 4.1 Onboarding (`/onboarding`)

Shows: the ColdLink logo, the heading "Find cold storage near you.", the line "Keep your harvest fresh by finding available cold storage nearby.", a phone number field with a fixed "+234" prefix and a CSS-drawn Nigerian flag (`Onboarding.jsx:56-64`), a Continue button, and the footer "Your phone number creates your ColdLink User ID. No password required." (`Onboarding.jsx:93-95`).

| Control | Action |
|---|---|
| Continue (form submit, also Enter in the field) | Goes to `/userid` if the field has more than 5 characters (`Onboarding.jsx:9-14`). See [5.1](#51-onboarding-phone-number) |

### 4.2 UserId (`/userid`)

Shows: a green check icon with two decorative orange "spark" lines (`UserId.jsx:33-40`), "You're all set!", a gradient card titled "Your ColdLink ID" containing the fixed ID `CL-482731` (`UserId.jsx:12`, `48-64`), and the text "This ID works across ColdLink Web, WhatsApp and USSD." (`UserId.jsx:67-69`). The ID does not depend on the phone number entered.

| Control | Action |
|---|---|
| Copy ID | Writes `CL-482731` to the clipboard with `navigator.clipboard.writeText`, and shows "Copied!" for 2 seconds (`UserId.jsx:14-18`). The promise is not awaited and errors are not handled, so "Copied!" shows even if the copy fails; where the Clipboard API is unavailable (non-HTTPS origins other than localhost) the click throws |
| Find storage | Goes to `/location` (`UserId.jsx:20-22`) |
| Bottom nav | See [3.3](#33-bottom-nav-srccomponentsbottomnavjsx). Profile is active |

### 4.3 Location (`/location`)

Shows: a map-pin icon, "Where are you storing from?", "We'll use your location to find the closest available cold rooms and calculate delivery." (`Location.jsx:62-67`), two options separated by "OR", and a Continue button.

| Control | Action |
|---|---|
| Use my current location ("Recommended for accuracy") | Does **not** use device geolocation. Sets the location to the fixed string "Supreme School, Magodo, Lagos" and shows it in a badge under the button (`Location.jsx:13-18`, `97-102`) |
| Enter location manually | Shows a text field (autofocused) and three fixed suggestions (`Location.jsx:20-24`, `125-170`) |
| A suggestion | Sets the location to that suggestion, fills the field with it, hides the list and shows a confirmed badge (`Location.jsx:26-30`) |
| Continue | Disabled until a location is set; then goes to `/produce` (`Location.jsx:32-36`, `177-189`) |
| Back | Browser back |

The chosen location is not used anywhere after this screen.

### 4.4 Produce (`/produce`)

Shows: "What do you want to store?", "Select the produce you're looking to preserve.", and a two-column grid of ten tiles: the nine `produceOptions` from `src/data/mockData.js:1-11` plus an "Other" tile added on this screen (`Produce.jsx:9`). Each tile shows a lucide icon looked up by name from the data, falling back to `HelpCircle` (`Produce.jsx:43`).

| Control | Action |
|---|---|
| A produce tile | Selects it (single choice); shows a check mark (`Produce.jsx:48`, `56-60`) |
| Find cold storage | Disabled until a tile is selected; then goes to `/discovery` (`Produce.jsx:15-19`, `81-93`) |
| Back | Browser back |

The selected produce is not used anywhere after this screen.

### 4.5 Discovery (`/discovery`)

Shows: "Cold storage near you", three filter pills ("Tomatoes", "Ibadan", "Filters") (`Discovery.jsx:39-49`), and one card per entry in `coldRooms` (`Discovery.jsx:53-109`). Each card shows the room's photo, name, rating, "{distance} km away", "₦{pricePerDay} / day", and an availability line and bar (see [7](#7-search-filtering-and-ranking)).

| Control | Action |
|---|---|
| Filter pills | **Nothing.** They are buttons without `onClick` |
| View storage (on every card) | Goes to `/details` (`Discovery.jsx:100-105`). The room's identity is not passed, so every card opens the same Details screen. The button is shown and enabled even on the full room (0 spaces) |
| Bottom nav | Find Cold is active |

This screen is also where "View booking" and "Back to home" on Confirmation lead, and where the Find Cold tab leads.

### 4.6 Details (`/details`)

Shows: a hero photo with a dark gradient overlay, the name "Abuja Central Cold Hub", "Garki Area 1, Abuja", a 4.8 rating (`Details.jsx:29-52`); a "Storage Capacity" card with "10 of 20 units available", a progress bar fixed at 50% width, and two feature pills "Frozen (-18°C)" and "Insured" (`Details.jsx:55-75`); a "How much storage?" section with "₦1,500 / unit / day", "Max 10 units" and a units stepper (`Details.jsx:78-108`).

| Control | Action |
|---|---|
| − | Decreases units, minimum 1 (disabled at 1) (`Details.jsx:12-14`, `87-93`) |
| + | Increases units, maximum 10 (disabled at 10) (`Details.jsx:16-18`, `100-106`) |
| Continue | Goes to `/duration` (`Details.jsx:114-123`). The units value is not passed on |
| Back | Browser back |

### 4.7 Duration (`/duration`)

Shows: "How long do you need storage?", "Select the number of days you need to store your goods.", a days stepper, and a "Cost Breakdown" card with Storage, Delivery, Booking fee, Total, and the note "Delivery is calculated based on the distance between your location and the cold room." (`Duration.jsx:65-97`). This is the only screen whose amounts change; see [8.1](#81-duration-the-only-calculation).

| Control | Action |
|---|---|
| − | Decreases days, minimum 1 (disabled at 1) (`Duration.jsx:15-17`, `43-49`) |
| + | Increases days with no maximum (`Duration.jsx:19-21`, `56-61`) |
| Continue to payment | Goes to `/review` (not `/payment`) (`Duration.jsx:103-108`). The days value is not passed on |
| Back | Browser back |

### 4.8 Review (`/review`)

Shows: "Review your booking", "Please confirm your storage details before payment.", a facility card ("Mile 12 Mega Cold Store", "Ketu, Lagos (2.4km)", Produce "Tomato", Quantity "2 Crates (100kg)", Duration "3 Days") (`Review.jsx:29-56`), a "Cost Summary" card (`Review.jsx:59-83`), and an amber "Split Payment Plan" card saying "You'll pay 50% now to secure the space, and the remaining 50% according to the storage provider's arrangement." with Pay now (50%) and Balance (`Review.jsx:86-108`). All values are hardcoded; see [8.2](#82-review).

| Control | Action |
|---|---|
| Pay ₦2,700 | Goes to `/payment` (`Review.jsx:112-121`) |
| Edit booking | Browser back (`navigate(-1)`) (`Review.jsx:122-127`). Coming from Duration, this returns to Duration with days reset to 3, because state is not kept |
| Bottom nav | Bookings is shown as active (`Review.jsx:132`), but the tab itself does nothing |

There is no back arrow in the top bar on this screen.

### 4.9 Payment (`/payment`)

Shows: "Total to pay ₦2,700" and "Order #882-991A" (`Payment.jsx:20-26`); three method tabs Card, Transfer, USSD (`Payment.jsx:29-62`); under Card, fields for Card Number, Expiry Date and CVV, a decorative two-circle card-brand placeholder (`Payment.jsx:80-86`), and a "Save card for future payments" toggle (`Payment.jsx:65-131`); under Transfer or USSD only the text "Select card to view the mock flow." (`Payment.jsx:133-137`); above the button, "Secured by Paystack. 256-bit encryption." (`Payment.jsx:144-147`).

| Control | Action |
|---|---|
| Card / Transfer / USSD | Switches the visible tab (`Payment.jsx:8`) |
| Save card toggle | Flips a local boolean; the value is not used (`Payment.jsx:9`, `119-126`) |
| Pay ₦2,700 | Goes to `/confirmation` (`Payment.jsx:149-158`) on any tab, with the card fields empty or not |
| Back | Browser back |

No payment is made. There is no Paystack script, SDK or key anywhere in the repository; the Paystack line is text only.

### 4.10 Confirmation (`/confirmation`)

Shows: a centred logo, a check icon, "Booking confirmed!", "A confirmation has been sent to your phone." (nothing is sent) (`Confirmation.jsx:32-42`); "Your Booking Code" `CL-847291` with "Show this code when you arrive" (`Confirmation.jsx:45-58`); "Booking Details": Cold Room "Standard Chilled Unit #4", Location "Kano Central Hub", Produce "Tomatoes (50 Crates)", Duration "Oct 12 - Oct 15 (3 days)" (`Confirmation.jsx:61-97`); "Payment Summary": Total Cost ₦5,400, Amount Paid − ₦2,700, Balance Due ₦2,700, "To be paid on arrival" (`Confirmation.jsx:100-123`).

| Control | Action |
|---|---|
| View booking | Goes to `/discovery` (`Confirmation.jsx:127-136`). There is no booking screen |
| Back to home | Goes to `/discovery` (`Confirmation.jsx:137-142`) |

## 5. Forms, inputs and validation

Only one element is a real `<form>` (Onboarding). No input has `required`, `maxLength`, `pattern`, `inputMode` or an error message anywhere in the app. No input has an `id`/`htmlFor` link to its label.

### 5.1 Onboarding: phone number

`Onboarding.jsx:46-97`

- Field: `<input type="tel">`, placeholder "800 000 0000", controlled by `phoneNumber` (`Onboarding.jsx:67-73`). Any characters are accepted (letters, spaces, symbols), with no length limit and no formatting.
- "+234" is a static label, not part of the value.
- The Continue button is disabled while the value is **shorter than 5** characters (`Onboarding.jsx:80`).
- On submit, it navigates only when the value is **longer than 5** characters (`Onboarding.jsx:11`).
- So at exactly 5 characters the button looks enabled but pressing it does nothing. At 6 or more characters of anything, it continues.
- The value is discarded on navigation.

### 5.2 Location: manual search

`Location.jsx:132-143`

- `<input type="text">`, placeholder "Search for a location...", autofocused, controlled by `manualSearch`.
- Typing does not filter or search: the same three suggestions are always listed (`Location.jsx:39-43`, `147-160`). Typing also clears any confirmed location (`Location.jsx:139`).
- Free text alone cannot continue. A location only counts once "Use my current location" or a suggestion is clicked.
- Choosing "Use my current location" clears the typed text (`Location.jsx:17`). Choosing "Enter location manually" again clears the confirmed location but keeps the typed text (`Location.jsx:20-24`).

### 5.3 Produce: tile selection

Single choice among ten tiles, required to continue (`Produce.jsx:13`, `83`). No other validation.

### 5.4 Details: units stepper

Integer from 1 to 10, default 2 (`Details.jsx:8-18`). The maximum of 10 is a constant on the screen (`Details.jsx:9`), not taken from any facility data.

### 5.5 Duration: days stepper

Integer of 1 or more, default 3, no upper limit (`Duration.jsx:8`, `15-21`).

### 5.6 Payment: card form

`Payment.jsx:65-131`

- Card Number, Expiry Date (placeholder "MM/YY") and CVV (placeholder "123") are all `<input type="text">` with no `value`, no `onChange` and no validation. What is typed stays in the DOM only and is never read.
- The "checkbox" is a styled `<button>` toggling `saveCard`, not an `<input type="checkbox">` (`Payment.jsx:119-126`).
- Pay works without any card details.

## 6. State

All state is local `useState` inside each screen. There is no context, store, URL parameter, route state, `localStorage` or `sessionStorage`. Leaving a screen unmounts it, so its state is lost, and coming back (including with the browser back button) starts again from the defaults.

| Screen | State | Default | Used for |
|---|---|---|---|
| MobileOnlyLayout | `isMobile` | `window.innerWidth <= 768` | Gate (`MobileOnlyLayout.jsx:5`) |
| Onboarding | `phoneNumber` | `''` | Button enable and submit check (`Onboarding.jsx:6`) |
| UserId | `copied` | `false` | "Copied!" label for 2 s (`UserId.jsx:9`) |
| Location | `selectedOption` (`'current'`/`'manual'`/`null`), `manualSearch`, `showSuggestions`, `confirmedLocation` | `null`, `''`, `false`, `''` | Option highlight, field, list, Continue enable (`Location.jsx:8-11`) |
| Produce | `selectedProduce` | `null` | Highlight and Continue enable (`Produce.jsx:13`) |
| Discovery | none | | |
| Details | `units` | `2` | Stepper display only (`Details.jsx:8`) |
| Duration | `days` | `3` | Stepper and cost breakdown (`Duration.jsx:8`) |
| Review | none | | |
| Payment | `activeTab`, `saveCard` | `'card'`, `false` | Tab display, toggle display (`Payment.jsx:8-9`) |
| Confirmation | none | | |

Nothing chosen on one screen reaches another:

- The phone number does not produce the user ID.
- Location, produce, the selected cold room, units and days are not shown or used on any later screen.
- Review, Payment and Confirmation show their own hardcoded values regardless of what was chosen.

## 7. Search, filtering and ranking

There is no search, filtering or ranking logic.

- Discovery lists every entry in `coldRooms` (`Discovery.jsx:53`) in the order they appear in `src/data/mockData.js:13-50`. That order happens to be ascending by distance (2.4, 5.1, 8.5 km), but nothing sorts it.
- The chosen location and produce are not used. Each room has a `supportedProduce` list (`mockData.js:22`, `34`, `46`), but nothing reads it, so rooms are not filtered by crop.
- Distance is a fixed number per room in the mock data, not calculated from a location.
- The filter pills "Tomatoes", "Ibadan" and "Filters" are static text on buttons with no handler (`Discovery.jsx:40-48`). The pill always says "Tomatoes", whatever produce was picked, and "Ibadan" even after picking a Lagos location.
- A room with no space is still listed and can still be opened. Moniya Hub Coolers has `availableCapacity: 0` and shows "Only 0 spaces left" with an enabled "View storage" button.
- Location "suggestions" are a fixed list of three Lagos addresses, not a search (`Location.jsx:39-43`).

**Availability display** (the only logic on Discovery):

- `percentage = availableCapacity / totalCapacity × 100` sets the bar width (`Discovery.jsx:12`, `19`).
- A room is "low" when the ratio is 10% or less (`Discovery.jsx:13`, `54`). A low room shows "Only {available} spaces left" in red and a red bar; otherwise "{available} of {total} spaces" in dark green with a green bar (`Discovery.jsx:92-94`, `18`).
- With the current data: Oyo Fresh Store 10 of 20 (50%, normal); Ibadan North Cold Storage 2 of 50 (4%, low); Moniya Hub Coolers 0 of 30 (0%, low).
- If `totalCapacity` were 0 the division would produce `NaN`/`Infinity`; no current entry has 0.

## 8. Booking, pricing and payment

No booking is created and no payment is taken. The flow is a sequence of screens joined by `navigate()` calls. Every amount below is either computed on Duration or written as a literal string in the JSX.

### 8.1 Duration (the only calculation)

`Duration.jsx:10-13`

| Line | Value | How it is produced |
|---|---|---|
| Storage | `days × 1500` | Calculated. 1500 is a literal on this screen. It does not use the units chosen on Details or any room's `pricePerDay` |
| Delivery | ₦800 | Hardcoded constant. Not distance-based, despite the note under the card |
| Booking fee | ₦100 | Hardcoded constant |
| Total | Storage + 800 + 100 | Calculated |

At the default of 3 days: Storage ₦4,500, Delivery ₦800, Booking fee ₦100, Total ₦5,400. Each extra day adds ₦1,500. Amounts are formatted with `toLocaleString()` and a "₦" prefix, so the thousands separator depends on the browser locale.

### 8.2 Review

All hardcoded strings (`Review.jsx:64-105`, `116`). None are calculated, and none change with the days chosen on Duration.

| Line | Value shown | How it is produced |
|---|---|---|
| Storage (3 days) | ₦4,500 | Hardcoded |
| Delivery | ₦600 | Hardcoded |
| Service Fee | ₦300 | Hardcoded |
| Total | ₦5,400 | Hardcoded (the three lines do add up to it) |
| Pay now (50%) | ₦2,700 | Hardcoded (equals 50% of ₦5,400) |
| Balance | ₦2,700 | Hardcoded |
| Button | "Pay ₦2,700" | Hardcoded |

The total ₦5,400 matches Duration's default total, but the parts differ: Duration has Delivery ₦800 and Booking fee ₦100; Review has Delivery ₦600 and Service Fee ₦300.

### 8.3 Payment

| Value shown | How it is produced |
|---|---|
| Total to pay ₦2,700 | Hardcoded (`Payment.jsx:22`) |
| Order #882-991A | Hardcoded (`Payment.jsx:24`) |
| Button "Pay ₦2,700" | Hardcoded (`Payment.jsx:153`) |

### 8.4 Confirmation

| Value shown | How it is produced |
|---|---|
| Booking code CL-847291 | Hardcoded (`Confirmation.jsx:53`) |
| Total Cost ₦5,400 | Hardcoded (`Confirmation.jsx:106`) |
| Amount Paid − ₦2,700 | Hardcoded (`Confirmation.jsx:110`) |
| Balance Due ₦2,700, "To be paid on arrival" | Hardcoded (`Confirmation.jsx:118`, `121`) |
| Duration "Oct 12 - Oct 15 (3 days)" | Hardcoded (`Confirmation.jsx:93`). Not derived from today's date or from Duration |

### 8.5 Other amounts

| Screen | Value | How it is produced |
|---|---|---|
| Discovery | ₦1,500 / ₦1,200 / ₦1,000 per day | `room.pricePerDay` from mock data, formatted with `toLocaleString()` (`Discovery.jsx:84`) |
| Details | ₦1,500 / unit / day | Constant `pricePerUnit = 1500` on the screen (`Details.jsx:10`, `81`) |

The ₦1,500 on Details is a separate literal from the ₦1,500 on Duration (`Duration.jsx:10`) and from Oyo Fresh Store's `pricePerDay` (`mockData.js:19`); they are not linked.

## 9. Hardcoded and mock data

### 9.1 `src/data/mockData.js`

**`produceOptions`** (`mockData.js:1-11`), used only by Produce (`Produce.jsx:5`, `9`):

| id | name | icon |
|---|---|---|
| `tomato` | Tomatoes | Apple |
| `pepper` | Peppers | Flame |
| `onion` | Onions | CircleDot |
| `vegetables` | Leafy Vegetables | Leaf |
| `fruits` | Fruits | Cherry |
| `yam` | Yams / Tubers | Carrot |
| `meat` | Meat & Poultry | Drumstick |
| `fish` | Fish & Seafood | Fish |
| `dairy` | Dairy Products | Milk |
| `other` | Other | Shapes (added in `Produce.jsx:9`, not in the data file) |

Icons are lucide component names stored as strings (the data file marks them as placeholders, `mockData.js:2`).

**`coldRooms`** (`mockData.js:13-50`), used only by Discovery (`Discovery.jsx:4`, `53`):

| Field | cr-001 | cr-002 | cr-003 | Shown on Discovery? |
|---|---|---|---|---|
| `name` | Oyo Fresh Store | Ibadan North Cold Storage | Moniya Hub Coolers | Yes |
| `location` | Bodija Market, Ibadan | Oje Market, Ibadan | Moniya, Ibadan | **No** (never read) |
| `distance` (km) | 2.4 | 5.1 | 8.5 | Yes |
| `pricePerDay` (₦) | 1500 | 1200 | 1000 | Yes |
| `totalCapacity` (units) | 20 | 50 | 30 | Yes (in availability) |
| `availableCapacity` | 10 | 2 | 0 | Yes |
| `supportedProduce` | tomato, pepper, vegetables | onion, pepper, tomato | fruits, vegetables, tomato | **No** (never read) |
| `rating` | 4.7 | 4.5 | 4.9 | Yes |
| `image` | Unsplash `photo-1586528116311…` | Unsplash `photo-1605600659908…` | Unsplash `photo-1565610222536…` | Yes |

### 9.2 Values hardcoded in screens

| Screen | Value | Source |
|---|---|---|
| UserId | ColdLink ID `CL-482731` | `UserId.jsx:12` |
| Location | "Use my current location" result: "Supreme School, Magodo, Lagos" | `Location.jsx:15` |
| Location | Suggestions: "Supreme School, Magodo, Lagos", "Magodo Phase 2, Lagos", "Magodo Brooks Estate, Lagos" | `Location.jsx:39-43` |
| Discovery | Filter pills "Tomatoes", "Ibadan", "Filters" | `Discovery.jsx:40-48` |
| Details | Facility "Abuja Central Cold Hub", "Garki Area 1, Abuja", rating 4.8 | `Details.jsx:42`, `45`, `49` |
| Details | Hero image (same Unsplash photo as cr-001, at 800px wide) | `Details.jsx:31` |
| Details | "10 of 20 units available", bar at 50% | `Details.jsx:58`, `63` |
| Details | Features "Frozen (-18°C)", "Insured" | `Details.jsx:69`, `72` |
| Details | Price ₦1,500/unit/day, max 10 units, default 2 units | `Details.jsx:8-10` |
| Duration | Storage rate 1500, delivery 800, booking fee 100, default 3 days | `Duration.jsx:8-12` |
| Review | Facility "Mile 12 Mega Cold Store", "Ketu, Lagos (2.4km)" | `Review.jsx:35`, `37` |
| Review | Produce "Tomato", Quantity "2 Crates (100kg)", Duration "3 Days" | `Review.jsx:45`, `49`, `53` |
| Review | Amounts (see 8.2) and "50%" split text | `Review.jsx:64-105` |
| Payment | ₦2,700, "Order #882-991A", "Secured by Paystack. 256-bit encryption." | `Payment.jsx:22`, `24`, `146`, `153` |
| Confirmation | Booking code `CL-847291` | `Confirmation.jsx:53` |
| Confirmation | Cold Room "Standard Chilled Unit #4", Location "Kano Central Hub", Produce "Tomatoes (50 Crates)", Duration "Oct 12 - Oct 15 (3 days)" | `Confirmation.jsx:69`, `77`, `85`, `93` |
| Confirmation | Total ₦5,400, Paid ₦2,700, Balance ₦2,700 | `Confirmation.jsx:106`, `110`, `118` |

### 9.3 Copy that describes behaviour the app does not have

These are facts about the current text, listed so nobody mistakes them for working features:

- "Your phone number creates your ColdLink User ID." The ID is a constant (`Onboarding.jsx:94`, `UserId.jsx:12`).
- "This ID works across ColdLink Web, WhatsApp and USSD." (`UserId.jsx:68`).
- "We'll use your location to find the closest available cold rooms and calculate delivery." Location is not used (`Location.jsx:66`).
- "Delivery is calculated based on the distance between your location and the cold room." Delivery is a constant (`Duration.jsx:94`).
- "Secured by Paystack. 256-bit encryption." There is no Paystack integration (`Payment.jsx:146`).
- "A confirmation has been sent to your phone." Nothing is sent (`Confirmation.jsx:40`).

## 10. Values that disagree between screens

| Item | Discovery / mock data | Details | Review | Confirmation | Other |
|---|---|---|---|---|---|
| Facility name | Oyo Fresh Store, Ibadan North Cold Storage, Moniya Hub Coolers | Abuja Central Cold Hub | Mile 12 Mega Cold Store | Standard Chilled Unit #4 | |
| City / area | Ibadan (Bodija, Oje, Moniya; only in unused `location` field); "Ibadan" pill | Garki Area 1, Abuja | Ketu, Lagos | Kano Central Hub | Location screen: Magodo, Lagos |
| Distance | 2.4 / 5.1 / 8.5 km | not shown | 2.4 km | not shown | |
| Rating | 4.7 / 4.5 / 4.9 | 4.8 | not shown | not shown | |
| Price per day | ₦1,500 / ₦1,200 / ₦1,000 | ₦1,500 per unit | not shown | not shown | Duration: ₦1,500 per day, ignores units |
| Capacity | 10 of 20, 2 of 50, 0 of 30 | 10 of 20 units, max 10 | | | |
| Produce | pill always says "Tomatoes" | | "Tomato" | "Tomatoes" | |
| Quantity | | 1–10 units, default 2 | "2 Crates (100kg)" | "50 Crates" | Duration: not used |
| Duration | | | "3 Days" | "Oct 12 - Oct 15 (3 days)" | Duration: default 3, adjustable |
| Storage cost | | | ₦4,500 | | Duration: `days × 1500` (₦4,500 at 3 days) |
| Delivery fee | | | ₦600 | | Duration: ₦800 |
| Booking / service fee | | | Service Fee ₦300 | | Duration: Booking fee ₦100 |
| Total | | | ₦5,400 | ₦5,400 | Duration: ₦5,400 at 3 days, changes with days |
| Pay now | | | ₦2,700 (50%) | Paid ₦2,700 | Payment: ₦2,700 |
| Reference codes | | | | Booking `CL-847291` | UserId: `CL-482731`; Payment: Order `#882-991A` |

Notes:

- Details uses the photo and capacity (10 of 20) of Oyo Fresh Store but a different name, city and rating.
- Review's "2 Crates" matches Details' default of 2 units by coincidence; it is not read from Details.
- On Details the price is per unit per day; on Duration storage is charged per day only, so changing units on Details never changes any amount.

## 11. Third-party libraries and remote assets

### 11.1 Runtime dependencies (`package.json:12-20`)

| Package | Version installed | Used for |
|---|---|---|
| `react`, `react-dom` | 19.2.8 | UI |
| `react-router-dom` | 7.18.2 | Routing, `useNavigate`, `Outlet`, `Navigate` |
| `lucide-react` | 1.31.0 | All icons. Named imports on every screen; Produce also does `import * as Icons` to look icons up by string (`Produce.jsx:3`, `43`) |
| `tailwindcss`, `@tailwindcss/vite` | 4.3.3 | Styling. Listed under `dependencies` rather than `devDependencies` |
| `framer-motion` | 13.1.0 | **Not used** (no import anywhere) |

Dev dependencies: `vite`, `@vitejs/plugin-react`, `oxlint`, `@types/react`, `@types/react-dom` (`package.json:21-27`). The `@types` packages have no effect on a JavaScript build.

### 11.2 Remote assets

| Asset | Where | Source |
|---|---|---|
| Unsplash photo `photo-1586528116311-ad8ed7c83a7f` (600px) | Discovery card for Oyo Fresh Store | `mockData.js:24` |
| Unsplash photo `photo-1605600659908-0ef719419d41` (600px) | Discovery card for Ibadan North Cold Storage | `mockData.js:36` |
| Unsplash photo `photo-1565610222536-f1d1796be4b0` (600px) | Discovery card for Moniya Hub Coolers | `mockData.js:48` |
| Unsplash photo `photo-1586528116311-ad8ed7c83a7f` (800px) | Details hero | `Details.jsx:31` |

All images are hot-linked from `images.unsplash.com` with no fallback image or error handling; if one fails to load, the browser's broken-image state shows (over a grey background on Discovery, `Discovery.jsx:60`).

There are no other external requests: no web fonts, no analytics, no maps, no payment SDK, no CDN scripts.

### 11.3 Fonts and colours

- No font is loaded. Text uses Tailwind's default sans-serif system font stack.
- Colours are hex values written into class names on each screen, for example greens `#68a042`, `#7ba962`, `#82b467`, `#80b368`, disabled green `#a3c993`, dark text `#1a3622`, logo orange `#ff9800`, amber `#fab94a`/`#fac66b`/`#f59e0b`, low-availability red `#c9302c`. There is no shared palette or theme config.

### 11.4 Icons and logo

- Icons: `lucide-react` throughout; one inline SVG in the desktop gate (`MobileOnlyLayout.jsx:21-23`).
- The logo is drawn with markup and a `Snowflake` icon in three places (see [3.4](#34-which-screen-uses-which-bar)). The logo image files are not used.
- The Nigerian flag on Onboarding is drawn with three `div`s (`Onboarding.jsx:58-62`).

## 12. Unused files and dependencies

| Item | Status |
|---|---|
| `src/App.css` | Not imported anywhere. Contains Vite starter-template styles (`.counter`, `.hero`, `#next-steps`, etc.) |
| `src/assets/logo_main.png` | Not referenced |
| `src/assets/logo-short.png` | Not referenced |
| `public/favicon.ico` | Not referenced by `index.html`. It is a PNG file (564×442) with an `.ico` name, byte-identical to `src/assets/logo-short.png`. Browsers may still request `/favicon.ico` on their own |
| `index.html` favicon link | Points to `/favicon.svg` (`index.html:5`), which does not exist |
| `index.html` title | "coldlink" (`index.html:7`) |
| `README.md` | Unchanged Vite "React + Vite" template text; says nothing about ColdLink |
| `framer-motion` | Installed, never imported |
| `mockData.js` fields `location` and `supportedProduce` | Never read |
| `App.jsx:31` | Placeholder comment "Add more routes here as we build the app" |
| `pb-safe`, `scrollbar-hide` classes | Used in markup but not defined, so they do nothing (see [3.5](#35-sticky-bottom-action-areas)) |
| Bookings tab | Rendered but inert (see [3.3](#33-bottom-nav-srccomponentsbottomnavjsx)) |

Also in the repository root: `ColdLink_Product_MVP_Specification.md`, an earlier product specification (v1.0, August 2026). It is not referenced by the code.
