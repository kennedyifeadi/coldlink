# UX writing

Copy rules for every ColdLink screen and message. They sit alongside the UX principles in `docs/prd.md` (9.4), which take precedence if the two ever disagree. Carried over from the archived MVP specification (`docs/archive/mvp-specification-v1.md`, sections 24, 41, 42 and 43).

## Plain language

Use the words a farmer would use. Say what they get or what to do, not how the system works.

| Prefer | Avoid |
|---|---|
| "10 spaces available" | "50% unallocated storage capacity" |
| "Choose a cold room" | "Select storage provider" |
| "How long do you need storage?" | "Configure storage duration" |
| "Pay ₦[amount]", with the exact amount | "Proceed with transaction" |

## Status

Never show status by colour alone. Every status indicator pairs a colour with a text label (an icon is optional on top). Use the booking states in `docs/prd.md` (6.5), written in plain words for the farmer.

## Error states

Every error says what happened and what the user can do next, with one action to recover. Never show a raw error.

Cases to handle:

- Invalid phone number
- Location unavailable
- No cold rooms nearby
- No cold room that suits the produce
- Produce not supported
- Not enough space
- Payment failed
- No network connection
- Booking rejected by the provider
- Booking expired

Example:

> **No cold rooms with space for tomatoes were found nearby.**
>
> Button: Try another location

## Loading states

Keep loading states light and say what is happening. Avoid unnecessary animation.

- "Finding cold rooms near you..."
- "Checking available space..."
- "Processing your payment..."
