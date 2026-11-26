# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Farmers** in Oyo State: smallholder and medium-scale growers of perishable crops (tomatoes, peppers, leafy vegetables, fruit). Many use low-end Android phones on limited data and may have low digital literacy. They come to ColdLink after harvest, under time pressure, to find space before produce spoils.
- **Providers**: cold room operators and individuals renting spare freezer or fridge space. They onboard a facility, accept or reject bookings, check produce in and out, and track earnings.
- A single phone number may hold both roles.

## Product Purpose

ColdLink lets a farmer search by location, produce, quantity and dates, see nearby cold storage that has space and suits the produce, book it with a deposit and pay from a phone. Success is a farmer who did not know cold storage existed nearby completing a booking, and a provider answering it quickly.

## Positioning

The constraint ColdLink removes is discovery, not capacity: 70% of surveyed farmers did not know a nearby cold storage option existed. It is local to Oyo State, priced in naira with the exact amount shown before paying, and signs in with a phone number only.

## Operating Context

- Mobile-first at 360 px; wider screens render the same column centred (decision 14).
- Used outdoors and in markets, often in bright light, on slow connections.
- Payment goes to Paystack's hosted checkout; SMS carries booking codes and provider action links.
- Providers act from an SMS link without signing in, or from their dashboard.

## Capabilities and Constraints

- React + Vite + Tailwind v4 web app; all UI text through i18next (`en.json`), English only for now.
- Colours as tokens in `src/index.css`; raw hex in `.tsx` fails lint.
- Status is never shown by colour alone (`docs/ux-writing.md`).
- One primary action per screen, primary buttons at least 48 px, body text at least 16 px (PRD 9.4).
- Integrations (API, Paystack, SMS, session) are out of scope for design work.

## Brand Commitments

- The ColdLink logo files (`src/assets/logo_main.webp`, `logo-short.webp`) stay as they are: green leaf-snowflake mark, "Cold" in deep green, "Link" in amber, tagline "Storage, nearby".
- Palette, type and components are open to replacement (2026-11-26, supersedes decisions 1 and 12).
- Plain, local, trustworthy: no decorative gradients, stock photos, fake logos or filler copy (decision 2).

## Evidence on Hand

- No photographs of real facilities or farmers ship with the app; providers upload their own facility photos. Do not fabricate testimonials, partner logos or figures.

## Product Principles

1. Say what the farmer gets or must do, in the fewest words that stay clear.
2. The price is the decision: show the exact naira amount before every commitment.
3. Every error says what happened and the one thing to do next.
4. Work on a cheap phone in sunlight on a slow network.

## Accessibility & Inclusion

WCAG AA contrast, visible focus, labelled inputs, semantic controls, 44 px+ tap targets. Copy kept simple for low literacy; future Yoruba and Pidgin translations must fit.
