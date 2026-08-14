# ColdLink — Product & MVP Specification

**Version:** 1.0  
**Date:** August 2026  
**Product:** ColdLink  
**Primary Market:** Ibadan, Oyo State, Nigeria  
**Primary MVP:** Farmer-to-cold-room marketplace

---

## 1. Product Overview

### What is ColdLink?

ColdLink is a **mobile-first platform that connects farmers with nearby cold-storage facilities that have available capacity**.

The platform is designed to help farmers preserve harvested produce before it spoils by making nearby cold-storage capacity easy to discover, compare, and book.

The initial MVP focuses specifically on **cold rooms/warehouse-style storage facilities** rather than the broader long-term vision of supporting every type of fridge, freezer, or storage provider.

### Core Value Proposition

> **ColdLink makes available cold-storage capacity visible and accessible to farmers.**

The problem is not necessarily that every farmer has no cold storage available to them. A major issue is that farmers may not know:

- Which cold rooms are nearby
- Which ones currently have space
- Which ones accept their type of produce
- How much storage costs
- How much space is available
- How far the facility is
- What delivery will cost

ColdLink brings this information into one simple interface.

### One-Sentence Product Description

> **ColdLink is a mobile-first marketplace that helps farmers discover and book nearby available cold-storage space that matches their produce, while helping storage providers make their available capacity visible.**

---

# 2. Problem Statement

Farmers in Ibadan, Oyo State lose significant amounts of produce to post-harvest spoilage.

A key contributor is poor visibility and access to suitable cold-storage capacity. Farmers may be aware of only one storage facility, while other closer or more suitable facilities may have unused capacity.

This creates a gap between:

**Available storage capacity**

and

**Farmers who need storage.**

ColdLink addresses this visibility and matching problem by centralizing available cold-storage options and allowing farmers to find and book suitable storage based on location, produce, capacity, duration, and cost.

---

# 3. Need Statement

Farmers need a fast and simple way to:

- Discover nearby cold rooms
- Know whether storage is currently available
- Confirm that the facility supports their produce
- See available capacity
- Compare prices
- Understand delivery costs
- Book storage
- Pay a deposit
- Receive a confirmation code

The experience must work with minimal friction because farmers may be using basic smartphones and may be accessing the service while actively trying to preserve harvested produce.

---

# 4. Solution Statement

ColdLink provides a centralized platform where farmers can enter their phone number, select their location and produce, discover suitable nearby cold rooms, select available storage capacity, choose a storage duration, calculate delivery and storage costs, and book with an initial payment.

Storage providers can list their facilities, manage capacity, receive booking requests, and accept or reject bookings.

---

# 5. Product Principles

ColdLink should always follow these principles:

### 5.1 Fast

A farmer should be able to move from opening the app to finding available storage quickly.

### 5.2 Simple

The interface should ask for one important piece of information at a time.

### 5.3 Low Friction

No unnecessary:

- Passwords
- Email addresses
- Long registration forms
- Complex profiles
- Technical terminology

### 5.4 Mobile First

The primary experience is a mobile browser.

The product must work well on approximately 360–430px wide screens.

### 5.5 Accessible

The interface should be usable by people with limited digital literacy.

### 5.6 Trustworthy

Pricing, availability, booking status, payment amounts, and balance should always be clear.

### 5.7 Local

The product should use Nigerian:

- Naira pricing
- Phone numbers
- Locations
- Payment methods
- Communication channels

### 5.8 Explainable

The farmer should understand why a cold room appears in the results.

---

# 6. Target Users

## 6.1 Farmer

The primary user.

A farmer uses ColdLink to:

- Find storage
- Compare cold rooms
- Select storage capacity
- Select duration
- Arrange delivery
- Pay
- Receive confirmation
- Manage existing bookings

Farmers may use:

- Smartphones
- Basic smartphones
- Future USSD
- Future WhatsApp chatbot

---

## 6.2 Storage Provider / Vendor

A business or individual operating a cold-storage facility.

The MVP focuses on cold-room/warehouse-style providers.

A provider can:

- Register
- Add their facility
- Specify capacity
- Specify price
- Specify supported produce
- Receive booking requests
- Accept/reject bookings
- Monitor available capacity
- Monitor active bookings

---

## 6.3 Admin

The ColdLink internal team.

Admin functionality is primarily operational and can remain outside the farmer-facing MVP.

Potential responsibilities:

- Monitor providers
- Monitor bookings
- Resolve disputes
- Manage provider verification
- Manage platform data
- Suspend problematic providers

---

# 7. Core User Loops

ColdLink has two primary loops.

## Farmer Loop

**Find → Match → Book → Store**

1. Enter phone number
2. Get User ID
3. Select location
4. Select produce
5. View suitable cold rooms
6. Select cold room
7. Select storage quantity
8. Select duration
9. Review delivery
10. Review total
11. Pay 50%
12. Receive booking confirmation
13. Deliver/drop off produce

---

## Provider Loop

**List → Receive → Accept → Manage**

1. Register
2. List storage
3. Specify capacity
4. Receive booking
5. Accept/reject
6. Capacity updates
7. Manage active bookings

---

# 8. Farmer Features

## 8.1 Phone Number Entry

The farmer starts with their phone number.

No password is required for the MVP.

### Purpose

- Reduce onboarding friction
- Create persistent farmer identity
- Enable future SMS/USSD/WhatsApp access

---

# 9. Cross-Channel User ID

Each farmer receives a unique ColdLink User ID associated with their phone number.

Example:

`CL-482731`

The same identity is intended to work across:

- Web
- USSD
- WhatsApp chatbot

### Purpose

A farmer should not need separate accounts for each access channel.

### Example Future Experience

A farmer can use their ColdLink ID through USSD or WhatsApp and retrieve:

- Saved location
- Previous bookings
- Booking status
- Relevant nearby cold rooms

---

# 10. Location Selection

The farmer selects their location.

Options:

- Use current location
- Enter location manually

The location is used to:

1. Find nearby cold rooms
2. Rank storage options
3. Calculate distance
4. Calculate delivery cost

Manual location should support recognizable Nigerian locations such as:

- Area
- Town
- Landmark
- City

Example:

`Ibadan, Oyo`

---

# 11. Produce Selection

The farmer selects what they want to store.

Initial examples:

- Tomato
- Pepper
- Onion
- Vegetables
- Fruits
- Other

The produce selection determines which cold rooms are suitable.

A cold room that does not support the selected produce should not appear as a suitable option.

---

# 12. Cold Room Discovery

After selecting location and produce, the farmer sees nearby cold rooms.

Each result should clearly communicate:

- Cold-room name
- Distance
- Price
- Available capacity
- Total capacity
- Produce compatibility
- Rating where available
- Location

Example:

> **AgroFresh Cold Room**  
> 2.4 km away  
> Tomatoes supported  
> ₦1,500/day  
> 10 of 20 spaces available

---

# 13. Availability & Capacity

Capacity is a major part of the ColdLink experience.

Each cold room has:

- Total storage capacity
- Occupied capacity
- Available capacity

Example:

**Total:** 20 units  
**Occupied:** 10 units  
**Available:** 10 units

The system must prevent farmers from booking more capacity than is available.

### Capacity Status

#### Healthy availability

Example:

`10 of 20 spaces available`

Use subtle green/neutral visual treatment.

#### Low availability

Example:

`2 of 20 spaces available`

Use a warning treatment.

#### Full

Example:

`No spaces available`

The farmer cannot book the facility.

---

# 14. Cold Room Matching

The MVP should use simple, explainable matching.

### Step 1 — Hard Filter

Only show cold rooms that:

1. Support the selected produce
2. Have available capacity

### Step 2 — Ranking

Sort remaining cold rooms primarily by:

1. Distance
2. Availability
3. Price where appropriate

The default ranking should prioritize proximity.

### Example

A farmer searches for tomatoes.

Cold room A:
- 2 km away
- Tomato compatible
- Available

Cold room B:
- 8 km away
- Tomato compatible
- Available

Cold room A appears first.

---

# 15. Cold Room Details

When a farmer selects a cold room, they should see:

- Name
- Location
- Distance
- Price per day
- Available capacity
- Total capacity
- Supported produce
- Rating
- Basic facility information

The farmer then selects the amount of storage they need.

---

# 16. Storage Quantity

The farmer selects how much storage they require.

The exact unit should correspond to a physical storage unit defined by ColdLink/provider operations.

Possible UI:

`−  2 units  +`

The system must display:

- Selected quantity
- Available quantity
- Price impact

Example:

> 10 units available  
> You selected 3 units

If only 2 units are available, the farmer must not be allowed to select 3.

---

# 17. Storage Duration

The farmer chooses how many days they want to store their produce.

Example:

`− 3 days +`

The duration affects the storage charge.

### Storage Calculation

Conceptually:

**Storage quantity × storage rate × number of days**

The exact pricing formula can be adapted to the provider's defined pricing model.

---

# 18. Delivery

ColdLink includes a delivery fee.

The delivery fee depends on:

- Farmer location
- Selected cold-room location
- Distance

The farmer must see delivery as a separate cost.

Example:

| Cost | Amount |
|---|---:|
| Storage | ₦4,500 |
| Delivery | ₦800 |
| Booking fee | ₦100 |
| Total | ₦5,400 |

The exact delivery calculation may be implemented as a simple distance-based rule in the MVP.

---

# 19. Farmer Booking Fee

ColdLink charges the farmer a flat:

**₦100 booking fee**

This fee is independent of storage duration.

It should always appear as a separate line item in the booking summary.

---

# 20. Payment Structure

The farmer pays **50% initially**.

The remaining 50% is paid later according to the agreed storage/payment arrangement.

Example:

Total booking:

`₦5,400`

Initial payment:

`₦2,700`

Remaining balance:

`₦2,700`

The UI must clearly distinguish:

- Total
- Amount due now
- Remaining balance

---

# 21. Booking Summary

Before payment, the farmer sees a complete summary.

### Cold Room

- Name
- Location
- Distance

### Storage

- Produce
- Quantity
- Duration

### Cost

- Storage cost
- Delivery fee
- ₦100 booking fee
- Total

### Payment

- 50% due now
- Remaining 50% balance

The farmer can edit the booking before payment.

---

# 22. Payment

The MVP may use a sandbox/test payment system.

Potential Nigerian payment provider:

- Paystack
- Flutterwave

Possible methods:

- Card
- Bank transfer
- Other supported payment methods

The final button should state the exact amount.

Example:

**Pay ₦2,700**

---

# 23. Booking Confirmation

After successful payment:

> **Booking confirmed!**

The farmer receives a booking code.

Example:

`CL-847291`

The booking confirmation contains:

- Booking code
- Cold room
- Location
- Produce
- Storage quantity
- Duration
- Total cost
- Amount paid
- Remaining balance
- Delivery information

The farmer can show the booking code when arriving at the cold room.

---

# 24. Booking Status

Possible booking states:

- Pending
- Confirmed
- Active
- Completed
- Rejected
- Cancelled

The interface must use both:

- Text status
- Color/status indicator

Never communicate status through color alone.

---

# 25. My Bookings

The farmer can view their booking history.

Suggested categories:

- Upcoming
- Active
- Completed

Each booking card can display:

- Cold room
- Produce
- Date
- Duration
- Status
- Booking code

---

# 26. Booking Details

A detailed booking screen should show:

- Booking code
- Cold room
- Location
- Produce
- Quantity
- Start date
- End date
- Storage cost
- Delivery cost
- Booking fee
- Total
- Amount paid
- Remaining balance
- Booking status

Possible actions:

- Get directions
- Contact provider
- Rate booking
- Book again

---

# 27. Book Again

The farmer can quickly repeat a previous booking.

The system can reuse:

- Previous provider
- Previous produce
- Previous storage preference

The farmer can modify:

- Quantity
- Duration
- Location if necessary

This feature is intended to reduce friction for repeat users.

---

# 28. SMS Communication

SMS is an important communication channel.

Possible notifications include:

### Booking Confirmation

> Your ColdLink booking CL-847291 is confirmed.

### Provider Update

> Your booking has been accepted by AgroFresh Cold Room.

### Rejection

> Your ColdLink booking was not accepted. Please select another available cold room.

### Reminder

> Your storage at AgroFresh Cold Room expires in 2 days.

The actual SMS gateway can use services such as Termii or Africa's Talking.

---

# 29. Provider Features

Although the initial UI design may focus on farmers, the overall product includes a provider experience.

## Provider Onboarding

Provider enters:

- Name/business name
- Phone number
- Location
- Storage type
- Number of units
- Capacity
- Price
- Supported produce

---

## Provider Dashboard

The provider should see:

- Total capacity
- Available capacity
- Occupied capacity
- Active bookings
- Pending bookings

Example:

**20 total spaces**

**10 available**

**10 occupied**

---

## Booking Requests

Provider sees:

- Farmer booking
- Produce
- Quantity
- Duration
- Payment status
- Booking request status

Actions:

**Accept**

**Reject**

---

## Capacity Management

When a booking is accepted:

**Available capacity decreases.**

When a booking is completed/expired:

**Available capacity increases.**

Capacity should update automatically based on active bookings.

---

# 30. Provider SMS

When a farmer books, the provider receives an SMS notification.

Example:

> ColdLink: New booking request from farmer CL-482731. 3 storage units for tomatoes for 5 days. Open ColdLink to accept or reject.

---

# 31. USSD — Future Channel

USSD is a roadmap feature, not a live MVP requirement.

The future flow can be:

1. Farmer dials a short code
2. Enters/selects produce
3. System identifies farmer by phone/User ID
4. System uses saved location
5. System finds nearest suitable cold rooms
6. Farmer selects an option
7. Farmer confirms duration
8. Booking is created
9. Confirmation is sent by SMS

Example:

> What do you want to store?
>
> 1. Tomato  
> 2. Pepper  
> 3. Onion  
> 4. Other

The same ColdLink User ID should work across web and USSD.

---

# 32. WhatsApp Chatbot — Future Channel

WhatsApp can provide another low-friction access channel.

A farmer should eventually be able to:

- Identify themselves using their ColdLink ID/phone
- Retrieve saved location
- Search for cold rooms
- Check availability
- Book storage
- Check booking status
- Receive reminders

The same backend and User ID system should power this channel.

---

# 33. Farmer UI/UX

## Design Personality

The interface should be:

- Warm
- Friendly
- Simple
- Trustworthy
- Clean
- Modern
- Agricultural
- Practical

It should NOT feel:

- Corporate
- Industrial
- Technical
- Cold
- Overly futuristic
- Like an enterprise SaaS dashboard

---

# 34. Color Palette

## Primary Green

`#7FB069`

Fresh, light agricultural green.

Use for:

- Primary buttons
- Brand elements
- Selected states
- Important positive actions
- Subtle accents

Do not use as the entire page background.

---

## Warm Off-White

`#F6F7EE`

Use for:

- Selected backgrounds
- Soft information sections
- Subtle highlights

---

## Warm Amber

`#F0A93E`

Use sparingly for:

- Highlights
- Secondary accents
- Warnings/information where appropriate

---

## Deep Warm Green

`#233D22`

Primary text color.

Use instead of pure black for most text.

---

## White

`#FFFFFF`

The dominant UI background.

Most app screens should feel predominantly white.

---

## Red

Use only for:

- Low capacity
- Full storage
- Errors
- Failed payments
- Rejections

Do not use red as a decorative color.

---

# 35. Color Balance

The app should be primarily white.

Suggested visual balance:

- 70–80% white/neutral
- 10–15% soft off-white/light green
- 5–10% primary green
- Small amber usage
- Red only for meaningful warnings/errors

The green should feel **subtle and fresh**, not overwhelming.

---

# 36. Typography

Use a highly legible modern sans-serif font.

Typography should prioritize:

- Readability
- Strong hierarchy
- Large touch-friendly labels
- Clear headings
- Short copy

Use:

`#233D22`

for primary text.

Avoid thin typography.

Buttons should generally use medium/semibold text.

---

# 37. UI Components

## Buttons

- Rounded corners
- Large touch targets
- Clear labels
- Strong visual hierarchy

Primary:

`#7FB069`

Secondary:

White with subtle border.

---

## Cards

Use:

- White background
- Soft border
- Rounded corners
- Minimal shadow

Avoid excessive floating cards.

---

## Inputs

Use:

- White background
- Subtle border
- Rounded corners
- Large readable text
- Clear focus state

---

## Selected States

Use:

- `#F6F7EE`
- `#7FB069` border/accent

Avoid strong saturated green blocks.

---

# 38. Navigation

The farmer flow should be guided.

The user should always understand:

- Current step
- Previous step
- Next action

A lightweight progress indicator can be used:

**Location → Produce → Storage → Duration → Payment**

Do not make navigation complicated.

---

# 39. Farmer Screen Inventory

## Primary Transaction Flow

1. Welcome / Phone Number
2. User ID Created
3. Location Selection
4. Produce Selection
5. Available Cold Rooms
6. Cold Room Details + Storage Selection
7. Duration + Delivery
8. Booking Summary
9. Payment
10. Booking Confirmation

## Supporting Screens

11. My Bookings
12. Booking Details
13. Profile / User ID

---

# 40. Farmer Screen Content

## Screen 1 — Phone Number

Headline:

> Find cold storage near you.

Input:

> Phone number

CTA:

> Continue

Supporting text:

> Your phone number creates your ColdLink User ID. No password required.

---

## Screen 2 — User ID

Headline:

> You're all set!

Show:

> Your ColdLink ID

Example:

`CL-482731`

Actions:

- Copy ID
- Find storage

Information:

> This ID works across ColdLink Web, WhatsApp and USSD.

---

## Screen 3 — Location

Headline:

> Where are you storing from?

Options:

- Use my current location
- Enter location manually

CTA:

> Continue

---

## Screen 4 — Produce

Headline:

> What do you want to store?

Options:

- Tomato
- Pepper
- Onion
- Vegetables
- Fruits
- Other

CTA:

> Find cold storage

---

## Screen 5 — Cold Rooms

Headline:

> Cold storage near you

Show:

- Name
- Distance
- Availability
- Price
- Produce compatibility
- Rating

CTA:

> View storage

Default sorting:

> Nearest

---

## Screen 6 — Storage Selection

Headline:

> How much storage do you need?

Show:

- Available capacity
- Quantity selector
- Price

CTA:

> Continue

---

## Screen 7 — Duration & Delivery

Headline:

> How long do you need storage?

Show:

- Duration
- Storage price
- Delivery
- Booking fee

CTA:

> Continue to payment

---

## Screen 8 — Summary

Headline:

> Review your booking

Show:

- Cold room
- Storage
- Duration
- Delivery
- Booking fee
- Total
- Amount due now
- Remaining balance

CTA:

> Pay ₦X

---

## Screen 9 — Payment

Headline:

> Complete payment

Show:

- Amount due
- Payment methods

CTA:

> Pay ₦X

---

## Screen 10 — Confirmation

Headline:

> Booking confirmed!

Show:

- Booking code
- Cold room
- Location
- Produce
- Storage
- Duration
- Amount paid
- Balance

CTA:

> View booking

---

# 41. UX Writing Rules

Use simple language.

### Prefer

"10 spaces available"

### Avoid

"50% unallocated storage capacity"

---

### Prefer

"Choose a cold room"

### Avoid

"Select storage provider"

---

### Prefer

"How long do you need storage?"

### Avoid

"Configure storage duration"

---

### Prefer

"Pay ₦2,700"

### Avoid

"Proceed with transaction"

---

# 42. Error States

The product should handle:

- Invalid phone number
- Location unavailable
- No cold rooms nearby
- No suitable cold rooms
- Produce not supported
- Insufficient capacity
- Payment failure
- Network failure
- Booking rejection
- Booking expiry

Example:

> **No cold rooms with space for tomatoes were found nearby.**

CTA:

> Try another location

---

# 43. Loading States

Use lightweight loading states.

Examples:

> Finding cold rooms near you...

> Checking available space...

> Processing your payment...

Avoid unnecessary animations.

---

# 44. Low Connectivity

The target audience may have unreliable internet.

The app should therefore:

- Keep pages lightweight
- Minimize images
- Avoid large background graphics
- Avoid unnecessary animations
- Keep critical information text-based
- Provide clear network failure states

---

# 45. Notifications

The system can send:

### Booking confirmation

> Your ColdLink booking CL-847291 is confirmed.

### Provider acceptance

> Your booking has been accepted by AgroFresh Cold Room.

### Provider rejection

> Your booking was not accepted. Please choose another available cold room.

### Storage reminder

> Your storage at AgroFresh Cold Room expires in 2 days.

---

# 46. Monetization

ColdLink uses a commission-based marketplace model.

The platform takes a percentage of completed storage transactions.

There is no required upfront fee for:

- Farmers joining
- Providers listing storage

The exact commission percentage is a business decision and does not need to be finalized in the MVP pitch unless specifically requested.

The farmer-facing **₦100 booking fee** is a defined part of the current transaction model.

---

# 47. Trust & Safety — Roadmap

Provider verification is not a core 2-day MVP feature.

Future verification can include:

- Storage-space photos
- Temperature verification
- ID verification
- Location confirmation
- Provider ratings
- Ongoing monitoring
- Suspension of poorly rated providers

The concept can be compared to marketplace/vendor verification models, but this should be positioned as a Phase 2 capability.

---

# 48. Ratings

After a completed booking, farmers can rate their experience.

Potential rating areas:

- Storage condition
- Provider experience
- Cleanliness
- Overall experience

For the MVP, ratings can be simplified to a basic star rating.

---

# 49. MVP Scope

## Must Have

- Phone number → User ID
- Location selection
- Produce selection
- Cold-room discovery
- Availability display
- Produce compatibility
- Distance ranking
- Storage quantity selection
- Duration selection
- Delivery fee
- ₦100 booking fee
- 50% initial payment
- Booking summary
- Payment
- Booking confirmation
- Booking code
- Provider onboarding
- Provider booking request
- Provider accept/reject
- Automatic capacity updates

---

# 50. Nice to Have

If time permits:

- Provider ratings
- Map view
- More advanced price calculations
- Better booking history
- Book again shortcut
- Basic SMS notifications
- More detailed provider information

---

# 51. Roadmap / Non-Goals

Do not attempt to fully build these during the 2-day MVP:

- Live USSD
- Full WhatsApp chatbot
- Full provider verification
- Delivery logistics network
- Full balance payment at pickup
- Advanced trust and safety
- Temperature IoT monitoring
- Waste-to-biomass marketplace
- Complex AI matching
- Large-scale logistics integration

These can be demonstrated as future opportunities.

---

# 52. Recommended MVP Architecture

## Frontend

React-based responsive web application.

Primary goal:

- Mobile-first
- Fast
- Simple
- Lightweight

---

## Backend

Possible:

- Node.js
- Express.js

The final choice can depend on team familiarity and implementation speed.

---

## Database

Possible:

- PostgreSQL
- Firebase

For a 2-day MVP, choose the option the team can implement fastest and most reliably.

---

## SMS

Possible:

- Termii
- Africa's Talking

---

## Payment

Possible:

- Paystack
- Flutterwave

Use sandbox/test mode for the MVP.

---

# 53. Core Data Model

## Farmer/User

Fields:

- User ID
- Phone number
- Location
- Optional name
- Optional farm information

---

## Provider

Fields:

- Provider ID
- Name/business name
- Phone
- Location
- Storage type
- Total capacity
- Available capacity
- Price
- Supported produce
- Rating

---

## Cold Room

Fields:

- Cold room ID
- Provider ID
- Name
- Location
- Capacity
- Available capacity
- Price
- Supported produce
- Status

---

## Booking

Fields:

- Booking ID
- Booking code
- Farmer/User ID
- Provider ID
- Cold room ID
- Produce type
- Storage quantity
- Start date
- End date
- Duration
- Storage cost
- Delivery fee
- Booking fee
- Total cost
- Initial payment
- Remaining balance
- Status

---

# 54. Capacity Logic

Example:

Cold room capacity:

`20 units`

Current active bookings:

`10 units`

Available:

`10 units`

If a farmer books 3 units:

Available becomes:

`7 units`

If another farmer books 2 units:

Available becomes:

`5 units`

The platform should automatically calculate available capacity from active bookings.

Conceptually:

**Available Capacity = Total Capacity − Active Booked Capacity**

---

# 55. Booking Logic

A booking should not be confirmed as active storage until the required booking/payment conditions are satisfied.

Basic flow:

1. Farmer selects storage
2. System checks capacity
3. Farmer selects duration
4. System calculates cost
5. Farmer pays required initial amount
6. Booking request is created
7. Provider accepts/rejects
8. Booking becomes confirmed or rejected
9. Capacity is updated appropriately

The exact handling of capacity between "pending" and "accepted" should be finalized by the team to prevent two farmers from booking the same remaining capacity.

---

# 56. Example End-to-End Farmer Journey

### Step 1

Farmer opens ColdLink.

### Step 2

Enters phone number.

### Step 3

Receives:

`CL-482731`

### Step 4

Selects:

`Apata, Ibadan`

### Step 5

Selects:

`Tomato`

### Step 6

ColdLink shows:

**AgroFresh Cold Room**

2.4 km away

₦1,500/day

10/20 spaces available

### Step 7

Farmer selects:

`3 storage units`

### Step 8

Farmer selects:

`3 days`

### Step 9

ColdLink calculates:

Storage: ₦4,500  
Delivery: ₦800  
Booking fee: ₦100  
Total: ₦5,400

### Step 10

Farmer pays:

`₦2,700`

### Step 11

Booking is confirmed.

Booking code:

`CL-847291`

### Step 12

Farmer receives confirmation and can present the code when using the cold room.

---

# 57. Success Metric for the MVP

The MVP should prove one fundamental hypothesis:

> **A farmer can quickly discover a suitable nearby cold room with available capacity and successfully book it through ColdLink.**

The product should therefore optimize for:

- Time to first relevant cold room
- Search completion
- Booking completion
- Payment completion
- Provider acceptance
- Capacity accuracy
- Farmer understanding

---

# 58. Demo Narrative

The strongest product demonstration should follow one farmer from beginning to end.

### Opening

Show the farmer entering a phone number.

### Identity

Show the generated ColdLink User ID.

### Search

Show location and produce selection.

### Discovery

Show multiple cold rooms ranked by proximity and availability.

### Decision

Show the farmer selecting storage quantity and duration.

### Cost

Show storage + delivery + ₦100 booking fee.

### Payment

Show the 50% initial payment.

### Confirmation

Show the booking code.

### Provider

Show the provider receiving and accepting the booking.

### Result

Show the updated storage capacity.

---

# 59. Product Positioning

ColdLink should not be positioned simply as:

> "An app for finding cold rooms."

A stronger positioning is:

> **A marketplace for discovering and accessing available cold-storage capacity.**

The platform creates visibility between two sides:

**Farmers who need storage**

and

**Storage providers with available capacity.**

---

# 60. Long-Term Vision

ColdLink can eventually become a broader agricultural preservation and logistics platform.

Potential future capabilities include:

- USSD
- WhatsApp
- Provider verification
- Temperature monitoring
- Delivery
- Transport partnerships
- Full digital payments
- Storage reminders
- Advanced matching
- Crop-specific storage recommendations
- Waste-to-biomass marketplace
- More states and regions

The MVP should not attempt to build all of these.

The immediate goal is to prove the fundamental marketplace loop.

---

# 61. Brand Identity Summary

ColdLink's visual identity is based on a unified **leaf + snowflake** concept.

The leaf represents:

- Fresh produce
- Agriculture
- Life
- Growth

The snowflake/vein structure represents:

- Cold storage
- Preservation
- Temperature control

The two ideas should form one recognizable symbol rather than two separate icons.

### Visual Style

- Flat
- Geometric
- Minimal
- Friendly
- Rounded
- Soft
- No gradients
- No 3D
- No photorealism
- No sharp aggressive edges

### App Icon

The icon sits inside a:

**Rounded-square badge**

It should remain recognizable at approximately:

**40 × 40 px**

---

# 62. Final Product Definition

ColdLink is a **mobile-first cold-storage marketplace for farmers**.

The MVP focuses on a simple problem:

> Farmers need to quickly find available cold storage that is close enough, suitable for their produce, and affordable.

ColdLink solves this through:

**Phone identity → Location → Produce → Available cold rooms → Storage quantity → Duration → Delivery → Payment → Confirmation**

The provider side creates the supply.

The farmer side creates the demand.

The User ID connects the system across future:

- Web
- USSD
- WhatsApp

The long-term vision is broader, but the MVP remains focused on one measurable outcome:

> **Make it significantly easier for a farmer to find and book available cold-storage capacity before their produce spoils.**
