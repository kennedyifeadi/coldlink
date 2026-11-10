# ColdLink API reference

The API contract, written as an OpenAPI 3.1 document in the YAML block below. Each issue that adds or changes an endpoint updates it in the same pull request. To view it in Swagger UI or Redocly, paste the block into a file.

## Conventions

- **Base path:** every endpoint is under `/api/v1`. JSON only.
- **Errors:** every error response has the shape `{ error: { code, message, details? } }`. The schema and the list of codes live in `packages/shared/src/errors.ts` (`errorResponseSchema`, `errorCodes`); the table below must match them.
- **Correlation ID:** send `X-Request-Id` to tag a request (1 to 128 characters from `A-Z a-z 0-9 . _ : -`). Anything else, or no header, gets a generated UUID. The response always echoes the ID in `X-Request-Id`, and every log line for the request carries it, so quote it when reporting a problem.
- **Lists:** a list response is `{ data: [...] }`, so a cursor can sit next to `data` later without changing the shape.
- **Pagination:** paginated lists take `limit` and `cursor` (PRD 8). The reference lists (`/crops`, `/crop-categories`) are not paginated: they are small, admin-managed reference data (22 crops, 7 categories) that a client loads whole.
- **Caching:** the public reference endpoints send `Cache-Control: public` with a short `max-age` (5 minutes for crops and categories, 60 seconds for config). Responses for the signed-in user (`/me`, the owner's provider views) send `no-store`. Other responses, and every error, send none.
- **Rate limits:** limited routes send `RateLimit` and `RateLimit-Policy` headers, and `Retry-After` with a 429. The reference endpoints are not limited yet: they are cheap, cacheable reads. The auth routes are limited per IP (decision 56); `POST /auth/otp/request` is also limited per phone number, and its 429 adds `details.retry_after_seconds`. `POST /search` is limited to 300 requests per IP per 15 minutes (decision 74).
- **Response schemas:** the Zod schemas for request and response bodies live in `packages/shared` (`cropCategoriesResponseSchema`, `cropsResponseSchema`, `publicConfigSchema`, `otpRequestBodySchema`, `otpRequestResponseSchema`, `otpVerifyBodySchema`, `sessionResponseSchema`, `userProfileSchema`, `updateProfileBodySchema`, `createProviderBodySchema`, `updateProviderBodySchema`, `publicProviderSchema`, `ownProviderSchema`, `ownProvidersResponseSchema`, `searchBodySchema`, `searchResponseSchema`), for the web app to validate forms and parse responses with.
- **Phone numbers:** send them as people type them: `08031234567`, `8031234567`, `2348031234567` or `+2348031234567`, with or without spaces or hyphens. The API stores `+234` and ten digits, and accepts only mobile numbers (70x, 80x, 81x, 90x, 91x). `normalisePhone` and `phoneSchema` in `packages/shared` do the same in the browser. Responses never contain a full phone number; a profile has `phone_masked` (`+234803***4567`).

## Authentication

Sign-in is by phone and a 6-digit code sent by SMS (PRD 7.1; decisions 54 to 61).

1. `POST /auth/otp/request` with the phone number. The answer is the same whether or not the number has an account. The code expires in 10 minutes; a new request makes the previous code unusable.
2. `POST /auth/otp/verify` with the phone number and the code. The first verification of a number creates the account and needs `consent: true` (the privacy notice; PRD 10). The response holds an access token and the user's profile, and sets the refresh cookie.
3. Send the access token as `Authorization: Bearer <token>`. It lasts 15 minutes. Keep it in memory, never in `localStorage`.
4. When it expires (a 401 `unauthorized`), `POST /auth/refresh` with the cookie for a new access token. Each refresh replaces the refresh token; send one refresh at a time, because presenting a replaced token signs out every copy of the session.
5. `POST /auth/logout` ends the session and clears the cookie.

**Refresh cookie:** `coldlink_refresh`, `HttpOnly`, `Secure`, `Path=/api/v1/auth`, `Max-Age` 30 days (renewed on each refresh), and `SameSite` from `AUTH_COOKIE_SAME_SITE` (`Strict` by default). The browser sends it only to the auth routes. Cross-origin calls need `credentials: 'include'`; the API allows credentials for the origins in `CORS_ORIGINS` and refuses refresh and logout from any other origin.

**Development only:** with `NODE_ENV=development` and `SMS_PROVIDER=console`, `POST /auth/otp/request` also returns the code as `dev_code`, since the console provider sends no SMS. It is never returned in any other setup (decision 57).

| Code | Status | When |
|---|---|---|
| `bad_request` | 400 | The body is not valid JSON or cannot be read; or a photo upload is empty, not JPEG, PNG or WebP, or not the type its `Content-Type` claims. |
| `validation_failed` | 400 | Params, query or body fail validation. `details` lists every issue as `{ location, path, message }`. |
| `not_found` | 404 | No such route, or no such resource. |
| `conflict` | 409 | The request clashes with the resource's current state: a booking status change the state machine does not allow from its current status or for this actor (`details` names the booking, `from`, `to` and `actor_type`), or a fifth photo for a facility. |
| `payload_too_large` | 413 | The JSON body is over 100 kB, or a photo is over 5 MB. |
| `rate_limited` | 429 | Too many requests from this client, or too many codes for this phone number; retry after `Retry-After` seconds. |
| `unauthorized` | 401 | No access token, or it is invalid or expired, or its user is gone or inactive; or the refresh cookie is missing, expired, revoked or reused. Sign in or refresh. Access-token routes add `WWW-Authenticate: Bearer`. |
| `forbidden` | 403 | Signed in, but without a role the route needs, or changing a facility you neither own nor administer; or a refresh or logout from an origin outside `CORS_ORIGINS`. |
| `otp_invalid` | 400 | The code is wrong, expired, used, out of attempts, or there is none. Always the same message, so the cases cannot be told apart. |
| `consent_required` | 400 | The code was right, but creating the account (or using an account with no consent on record) needs `consent: true`. Send it again with consent and the same code. |
| `account_disabled` | 403 | The code was right, but the account has been deactivated. Refresh returns it too. |
| `internal` | 500 | An unexpected error. The message is always generic; details are only in the server log, under the request ID. |

## Providers

A provider is a storage facility (PRD 5.3, 7.2; decisions 62 to 66).

- **Onboarding:** any signed-in user can `POST /providers`; the user gets the `provider` role. The facility starts `pending` and appears to farmers once an admin approves it, or at once when the platform does not require approval. The response's `verification_status` says which.
- **Two views:** `GET /providers/:id` is public and only finds `approved` facilities. It never shows a phone number or the owner. The owner's view, returned by every signed-in provider route, adds the masked notification numbers and the approval status.
- **Editing:** only the owner or an admin can `PATCH` a facility or change its photos; another provider gets 403. A price change applies to new bookings only: a booking keeps the prices it was made with.
- **Photos:** up to 4 per facility. Send one photo per `POST /providers/:id/photos` as the raw request body with its `Content-Type` (`image/jpeg`, `image/png` or `image/webp`), at most 5 MB; the file must really be that type. Remove one with `DELETE /providers/:id/photos/:photoId`. Each photo is `{ id, url }`, and the URL loads without a token.

## Search

`POST /search` finds storage for a crop near a point (PRD 6.8, 7.3; decisions 70 to 74).

- **Signing in is optional.** Anyone can search. Send the access token when there is one: the search is then logged against the user. A token that is sent must be valid; an expired one gets 401, so refresh and search again.
- **Quantity is in the facility's unit.** Send `capacity_unit` (`crates`, `kg` or `sqm`) with `quantity`; only facilities listed in that unit are returned.
- **Dates:** `start_date` defaults to today in Lagos, and may not be earlier. The period is `days` days, up to 365; the response gives `start_date` and `end_date` (the day the produce is collected, as on a booking).
- **What matches:** the facility is approved (or awaiting approval, when the platform does not require it), taking bookings, stores the crop's category, is listed in the unit, has `quantity` free on every day of the period, and is within `search_default_radius_km`. If none is, the search is retried once within `search_max_radius_km` and the response has `expanded_radius: true`. An empty `data` after that means nothing was found; `radius_km` says how far was searched.
- **Order:** nearest first, by the distance shown (to 0.1 km); facilities at the same distance, the higher rated first.
- **Prices** are estimates for this quantity and period at today's prices: `total_estimate_kobo` is the storage subtotal plus the service fee, before any delivery, and `deposit_kobo` is what is paid online when booking. `POST /bookings/quote` gives the exact figures.
- Every search is logged for demand analytics, including those that find nothing.

## OpenAPI

```yaml
openapi: 3.1.0
info:
  title: ColdLink API
  version: 0.0.0
servers:
  - url: /api/v1
paths:
  /health:
    get:
      operationId: getHealth
      summary: Health check
      description: >-
        Reports whether the API is running and can reach the database, checked with a trivial
        query that gives up after 2 seconds. Never fails with a 500 because the database is down.
      tags: [System]
      responses:
        '200':
          description: The API is running and the database answered.
          headers:
            X-Request-Id:
              $ref: '#/components/headers/XRequestId'
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Health'
              example: { status: ok, version: 0.0.0, database: up }
        '503':
          description: The API is running but the database did not answer in time or failed.
          headers:
            X-Request-Id:
              $ref: '#/components/headers/XRequestId'
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Health'
              example: { status: degraded, version: 0.0.0, database: down }
  /crop-categories:
    get:
      operationId: listCropCategories
      summary: List crop categories
      description: >-
        Every crop category, alphabetically by name with the catch-all `other` last. Not
        paginated. Search matches providers to crops by category (PRD 5.4).
      tags: [Reference]
      responses:
        '200':
          description: All categories.
          headers:
            Cache-Control:
              $ref: '#/components/headers/ReferenceCacheControl'
            X-Request-Id:
              $ref: '#/components/headers/XRequestId'
          content:
            application/json:
              schema:
                type: object
                required: [data]
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/CropCategory'
              example:
                data:
                  - { id: ebf0acc5-bd55-43b3-a3a5-ed3e4e595019, slug: dairy, name: Dairy }
                  - { id: c0799a4b-ee12-4a3a-baf8-91ae18230ac1, slug: fish, name: Fish }
                  - { id: db3f82c1-0f01-4bad-95cb-a388ea1002d0, slug: other, name: Other }
        '500':
          $ref: '#/components/responses/Internal'
  /crops:
    get:
      operationId: listCrops
      summary: List crops
      description: >-
        Every crop, ordered by category (as in /crop-categories), then by name, with each
        category's generic "Other ..." crop last. Not paginated.
      tags: [Reference]
      parameters:
        - name: category
          in: query
          required: false
          description: Only crops in the category with this slug. An unknown slug is a 400.
          schema:
            type: string
          example: tubers
      responses:
        '200':
          description: All crops, or the crops in one category.
          headers:
            Cache-Control:
              $ref: '#/components/headers/ReferenceCacheControl'
            X-Request-Id:
              $ref: '#/components/headers/XRequestId'
          content:
            application/json:
              schema:
                type: object
                required: [data]
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/Crop'
              example:
                data:
                  - id: edf7f96a-8f75-4372-886b-23b94639be20
                    name: Cassava
                    local_names: [ege, gbaguda]
                    category_id: facbfc5b-ba4d-44f6-8953-81866964c721
                    category_slug: tubers
                  - id: e73b98df-0488-4fff-8812-473a9bd17c1c
                    name: Yam
                    local_names: [isu]
                    category_id: facbfc5b-ba4d-44f6-8953-81866964c721
                    category_slug: tubers
                  - id: 7abe6db2-6c90-4125-be1c-ce0e9e31a018
                    name: Other tubers
                    local_names: []
                    category_id: facbfc5b-ba4d-44f6-8953-81866964c721
                    category_slug: tubers
        '400':
          description: '`category` is not a known slug, is empty or is given more than once.'
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
              example:
                error:
                  code: validation_failed
                  message: Some fields are missing or invalid
                  details:
                    - location: query
                      path: category
                      message: >-
                        Unknown crop category. Use one of: dairy, fish, fruits, meat_poultry,
                        tubers, vegetables, other
        '500':
          $ref: '#/components/responses/Internal'
  /config/public:
    get:
      operationId: getPublicConfig
      summary: Public configuration
      description: >-
        The app_config values clients need: the search radius limits, the service fee and deposit
        share for showing a price before a quote, and the free cancellation window. Only these
        keys are returned; every other key, including any added later, stays private (decision
        48). Values come from the API's 60-second config cache.
      tags: [Reference]
      responses:
        '200':
          description: The public config values.
          headers:
            Cache-Control:
              description: Always `public, max-age=60`.
              schema:
                type: string
            X-Request-Id:
              $ref: '#/components/headers/XRequestId'
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PublicConfig'
              example:
                search_default_radius_km: 25
                search_max_radius_km: 100
                service_fee_kobo: 0
                deposit_percent: 0.3
                farmer_free_cancel_hours: 24
        '500':
          $ref: '#/components/responses/Internal'
  /auth/otp/request:
    post:
      operationId: requestOtp
      summary: Send a sign-in code
      description: >-
        Sends a 6-digit code by SMS to the number, valid for 10 minutes, and makes any earlier code
        for it unusable. The response is the same whether or not the number has an account. The SMS
        is sent after the response, so a 200 means the code was issued, not that the SMS arrived.
        Limited per IP (30 per 15 minutes) and per number (one every 60 seconds, 5 an hour, 10 a
        day).
      tags: [Auth]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/OtpRequest'
            example: { phone: 0803 123 4567 }
      responses:
        '200':
          description: The code was issued.
          headers:
            Cache-Control:
              $ref: '#/components/headers/NoStore'
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/OtpRequestResponse'
              example: { expires_in_seconds: 600, resend_after_seconds: 60 }
        '400':
          description: '`phone` is not a Nigerian mobile number.'
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
              example:
                error:
                  code: validation_failed
                  message: Some fields are missing or invalid
                  details:
                    - location: body
                      path: phone
                      message: Enter a Nigerian mobile number, like 0803 123 4567
        '429':
          description: Too many requests from this IP, or too many codes for this number.
          headers:
            Retry-After:
              schema:
                type: integer
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
              example:
                error:
                  code: rate_limited
                  message: Too many codes for this number. Wait a little, then try again.
                  details: { retry_after_seconds: 42 }
        '500':
          $ref: '#/components/responses/Internal'
  /auth/otp/verify:
    post:
      operationId: verifyOtp
      summary: Sign in with a code
      description: >-
        Checks the code against the latest live code for the number. A wrong code counts against
        it; after 5 it is dead. On success the code is used up, the account is created if this is
        the number's first sign-in (with a random 7-digit ColdLink ID and the farmer role), the
        login is recorded, and the refresh cookie is set. While app_config otp_required is off, a
        number with no account may leave out `code` (decision 58); an existing account always needs
        it. Limited per IP (60 per 15 minutes).
      tags: [Auth]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/OtpVerify'
            example: { phone: '08031234567', code: '482913', consent: true }
      responses:
        '200':
          description: Signed in.
          headers:
            Set-Cookie:
              $ref: '#/components/headers/RefreshCookie'
            Cache-Control:
              $ref: '#/components/headers/NoStore'
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Session'
        '400':
          description: >-
            `otp_invalid` for a wrong, expired, used, exhausted or missing code (one message for
            all), `consent_required` when the account would be created without consent, or
            `validation_failed`.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
              examples:
                otpInvalid:
                  value:
                    error:
                      code: otp_invalid
                      message: That code is wrong or has expired. Check the SMS or ask for a new code.
                consentRequired:
                  value:
                    error:
                      code: consent_required
                      message: To create your account, agree to the ColdLink privacy notice.
        '403':
          description: The account is deactivated.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
              example:
                error:
                  code: account_disabled
                  message: This account is turned off. Contact ColdLink support.
        '429':
          $ref: '#/components/responses/RateLimited'
        '500':
          $ref: '#/components/responses/Internal'
  /auth/refresh:
    post:
      operationId: refreshSession
      summary: Get a new access token
      description: >-
        Swaps the refresh cookie for a new one (another 30 days) and returns a new access token.
        A refresh token that was already swapped is a copy: the whole session is revoked and every
        holder must sign in again. Refused from an origin outside CORS_ORIGINS. Limited per IP (120
        per 15 minutes, shared with logout).
      tags: [Auth]
      security:
        - refreshCookie: []
      responses:
        '200':
          description: A new session; `is_new_user` is always false.
          headers:
            Set-Cookie:
              $ref: '#/components/headers/RefreshCookie'
            Cache-Control:
              $ref: '#/components/headers/NoStore'
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Session'
        '401':
          description: No cookie, or an unknown, expired, revoked or reused token. The cookie is cleared.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
              example:
                error:
                  code: unauthorized
                  message: Your session has ended. Sign in again.
        '403':
          description: '`account_disabled`, or `forbidden` for an origin outside CORS_ORIGINS.'
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '429':
          $ref: '#/components/responses/RateLimited'
        '500':
          $ref: '#/components/responses/Internal'
  /auth/logout:
    post:
      operationId: logout
      summary: Sign out
      description: >-
        Revokes the session the refresh cookie belongs to, on every copy, and clears the cookie.
        Succeeds with no cookie too. Refused from an origin outside CORS_ORIGINS.
      tags: [Auth]
      security:
        - refreshCookie: []
      responses:
        '204':
          description: Signed out; the cookie is cleared.
        '403':
          $ref: '#/components/responses/Forbidden'
        '429':
          $ref: '#/components/responses/RateLimited'
        '500':
          $ref: '#/components/responses/Internal'
  /me:
    get:
      operationId: getMe
      summary: The signed-in user's profile
      tags: [Profile]
      security:
        - bearerAuth: []
      responses:
        '200':
          description: The profile.
          headers:
            Cache-Control:
              $ref: '#/components/headers/NoStore'
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserProfile'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '500':
          $ref: '#/components/responses/Internal'
    patch:
      operationId: updateMe
      summary: Update the signed-in user's profile
      description: >-
        Changes any of the listed fields; send null to clear one. home_lat and home_lng go
        together. Any other field, such as phone or roles, is a 400.
      tags: [Profile]
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ProfileUpdate'
            example:
              full_name: Adebayo Ogunleye
              preferred_channel: whatsapp
              home_lga: Ibadan North
              home_lat: 7.4352
              home_lng: 3.9133
      responses:
        '200':
          description: The updated profile.
          headers:
            Cache-Control:
              $ref: '#/components/headers/NoStore'
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserProfile'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '500':
          $ref: '#/components/responses/Internal'
  /providers:
    post:
      operationId: createProvider
      summary: Onboard a storage facility
      description: >-
        Creates a facility owned by the signed-in user and gives them the provider role. It starts
        pending, or approved when app_config require_provider_approval is false. phone, where
        booking SMS go, defaults to the owner's own number.
      tags: [Providers]
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ProviderCreate'
            example:
              display_name: Bodija Cold Room
              facility_type: cold_room
              address_text: 12 Bodija Market Road
              landmark: Opposite the new market gate
              lga: Ibadan North
              lat: 7.4352
              lng: 3.9133
              capacity_total: 40
              capacity_unit: sqm
              price_per_unit_per_day_kobo: 225800
              has_backup_power: solar
              category_ids: [0b8f6a3e-2d4c-4b1a-9e7f-3c5d2a1b0e9f]
      responses:
        '201':
          description: The new facility, in the owner's view.
          headers:
            Cache-Control:
              $ref: '#/components/headers/NoStore'
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/OwnProvider'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '500':
          $ref: '#/components/responses/Internal'
  /providers/mine:
    get:
      operationId: listMyProviders
      summary: The signed-in user's facilities
      description: Every facility the user owns, in any status, oldest first. Not paginated.
      tags: [Providers]
      security:
        - bearerAuth: []
      responses:
        '200':
          description: The facilities, in the owner's view.
          headers:
            Cache-Control:
              $ref: '#/components/headers/NoStore'
          content:
            application/json:
              schema:
                type: object
                required: [data]
                additionalProperties: false
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/OwnProvider'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '500':
          $ref: '#/components/responses/Internal'
  /providers/{id}:
    parameters:
      - $ref: '#/components/parameters/ProviderId'
    get:
      operationId: getProvider
      summary: A facility, as farmers see it
      description: >-
        Approved facilities only; any other status is a 404, the same as an unknown id. No phone
        numbers or owner fields.
      tags: [Providers]
      responses:
        '200':
          description: The facility.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PublicProvider'
        '400':
          $ref: '#/components/responses/BadRequest'
        '404':
          $ref: '#/components/responses/NotFound'
        '500':
          $ref: '#/components/responses/Internal'
    patch:
      operationId: updateProvider
      summary: Edit a facility
      description: >-
        The owner or an admin only. Changes any of the listed fields; send null to clear an
        optional one. lat and lng go together, and category_ids replaces the whole set. A price
        change applies to new bookings only. Approval status, ratings, the owner and photos cannot
        be changed here.
      tags: [Providers]
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ProviderUpdate'
            example:
              price_per_unit_per_day_kobo: 250000
              is_accepting_bookings: false
      responses:
        '200':
          description: The updated facility, in the owner's view.
          headers:
            Cache-Control:
              $ref: '#/components/headers/NoStore'
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/OwnProvider'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          $ref: '#/components/responses/NotFound'
        '500':
          $ref: '#/components/responses/Internal'
  /providers/{id}/photos:
    parameters:
      - $ref: '#/components/parameters/ProviderId'
    post:
      operationId: addProviderPhoto
      summary: Add a facility photo
      description: >-
        The owner or an admin only. One photo as the raw body, at most 5 MB; the file must be the
        type its Content-Type names. At most 4 photos per facility.
      tags: [Providers]
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          image/jpeg:
            schema:
              type: string
              format: binary
          image/png:
            schema:
              type: string
              format: binary
          image/webp:
            schema:
              type: string
              format: binary
      responses:
        '201':
          description: The facility with the new photo last.
          headers:
            Cache-Control:
              $ref: '#/components/headers/NoStore'
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/OwnProvider'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          $ref: '#/components/responses/NotFound'
        '409':
          $ref: '#/components/responses/Conflict'
        '413':
          $ref: '#/components/responses/PayloadTooLarge'
        '500':
          $ref: '#/components/responses/Internal'
  /providers/{id}/photos/{photoId}:
    parameters:
      - $ref: '#/components/parameters/ProviderId'
      - name: photoId
        in: path
        required: true
        description: The photo's id from the facility's photos.
        schema:
          type: string
          pattern: '^[0-9a-f-]{36}\.(jpg|png|webp)$'
    delete:
      operationId: removeProviderPhoto
      summary: Remove a facility photo
      description: The owner or an admin only.
      tags: [Providers]
      security:
        - bearerAuth: []
      responses:
        '200':
          description: The facility without the photo.
          headers:
            Cache-Control:
              $ref: '#/components/headers/NoStore'
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/OwnProvider'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          $ref: '#/components/responses/NotFound'
        '500':
          $ref: '#/components/responses/Internal'
  /search:
    post:
      operationId: search
      summary: Find storage near a point
      description: >-
        Open to everyone; with a valid access token the search is logged against the user. Hard
        filters, order and the expanded-radius retry are described in the Search section. Rate
        limited per IP.
      tags: [Search]
      security:
        - {}
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/SearchRequest'
            example:
              lat: 7.3775
              lng: 3.947
              crop_id: 0b8f6a3e-2d4c-4b1a-9e7f-3c5d2a1b0e9f
              quantity: 20
              capacity_unit: crates
              days: 14
      responses:
        '200':
          description: >-
            Matching facilities, nearest first. Empty when nothing matches even at the maximum
            radius.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SearchResponse'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '429':
          $ref: '#/components/responses/RateLimited'
        '500':
          $ref: '#/components/responses/Internal'
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: >-
        The access token from /auth/otp/verify or /auth/refresh: HS256, 15 minutes, with claims
        sub (user id), roles and cid (ColdLink ID). Roles and the active flag are checked against
        the database on every request, not taken from the token.
    refreshCookie:
      type: apiKey
      in: cookie
      name: coldlink_refresh
      description: HttpOnly, Secure, Path=/api/v1/auth, 30 days, SameSite per AUTH_COOKIE_SAME_SITE.
  headers:
    NoStore:
      description: Always `no-store`.
      schema:
        type: string
    RefreshCookie:
      description: >-
        `coldlink_refresh=<token>; Max-Age=2592000; Path=/api/v1/auth; HttpOnly; Secure;
        SameSite=Strict`
      schema:
        type: string
    ReferenceCacheControl:
      description: Always `public, max-age=300`.
      schema:
        type: string
    XRequestId:
      description: The request's correlation ID, echoed from the request or generated.
      schema:
        type: string
        pattern: '^[A-Za-z0-9._:-]{1,128}$'
  parameters:
    ProviderId:
      name: id
      in: path
      required: true
      schema:
        type: string
        format: uuid
    XRequestId:
      name: X-Request-Id
      in: header
      required: false
      description: Correlation ID for the request. Malformed values are replaced.
      schema:
        type: string
        pattern: '^[A-Za-z0-9._:-]{1,128}$'
  schemas:
    Health:
      type: object
      required: [status, version, database]
      properties:
        status:
          type: string
          enum: [ok, degraded]
          description: degraded when any dependency is down.
        version:
          type: string
          examples: ['0.0.0']
        database:
          type: string
          enum: [up, down]
    CropCategory:
      type: object
      required: [id, slug, name]
      additionalProperties: false
      properties:
        id:
          type: string
          format: uuid
        slug:
          type: string
          pattern: '^[a-z][a-z0-9_]*$'
          examples: [vegetables, meat_poultry]
        name:
          type: string
          examples: [Vegetables]
    Crop:
      type: object
      required: [id, name, local_names, category_id, category_slug]
      additionalProperties: false
      properties:
        id:
          type: string
          format: uuid
        name:
          type: string
          examples: [Peppers]
        local_names:
          type: array
          items:
            type: string
          description: Local and Yoruba names, without tone marks; may be empty.
          examples: [[tatashe, rodo, shombo]]
        category_id:
          type: string
          format: uuid
        category_slug:
          type: string
          examples: [vegetables]
    PublicConfig:
      type: object
      required:
        - search_default_radius_km
        - search_max_radius_km
        - service_fee_kobo
        - deposit_percent
        - farmer_free_cancel_hours
      additionalProperties: false
      properties:
        search_default_radius_km:
          type: number
          exclusiveMinimum: 0
          description: Radius of a first search, in km. Never more than search_max_radius_km.
        search_max_radius_km:
          type: number
          exclusiveMinimum: 0
          description: Largest search radius, in km; an empty search is retried at it.
        service_fee_kobo:
          type: integer
          minimum: 0
          description: Flat fee the farmer pays per booking, in kobo.
        deposit_percent:
          type: number
          minimum: 0
          maximum: 1
          description: Share of the storage subtotal paid online at booking, as a fraction.
        farmer_free_cancel_hours:
          type: integer
          minimum: 0
          description: Hours before the start date until which a cancelling farmer gets the deposit back.
    OtpRequest:
      type: object
      required: [phone]
      additionalProperties: false
      properties:
        phone:
          type: string
          description: A Nigerian mobile number as typed; see Phone numbers above.
          examples: ['0803 123 4567', '+2348031234567']
    OtpRequestResponse:
      type: object
      required: [expires_in_seconds, resend_after_seconds]
      additionalProperties: false
      properties:
        expires_in_seconds:
          type: integer
          examples: [600]
        resend_after_seconds:
          type: integer
          description: How long to wait before offering to resend.
          examples: [60]
        dev_code:
          type: string
          pattern: '^[0-9]{6}$'
          description: Development with the console SMS provider only (decision 57).
    OtpVerify:
      type: object
      required: [phone]
      additionalProperties: false
      properties:
        phone:
          type: string
        code:
          type: string
          pattern: '^[0-9]{6}$'
          description: Required unless app_config otp_required is off and the number has no account.
        consent:
          type: boolean
          description: Data-protection consent; must be true to create an account.
    Session:
      type: object
      required: [access_token, token_type, expires_in, is_new_user, user]
      additionalProperties: false
      properties:
        access_token:
          type: string
        token_type:
          type: string
          enum: [Bearer]
        expires_in:
          type: integer
          description: Seconds until the access token expires.
          examples: [900]
        is_new_user:
          type: boolean
          description: True only on the sign-in that created the account, to show the new ColdLink ID.
        user:
          $ref: '#/components/schemas/UserProfile'
    UserProfile:
      type: object
      required:
        - id
        - coldlink_id
        - phone_masked
        - full_name
        - roles
        - preferred_channel
        - home_lga
        - home_lat
        - home_lng
        - consented_at
        - created_at
      additionalProperties: false
      properties:
        id:
          type: string
          format: uuid
        coldlink_id:
          type: string
          pattern: '^[0-9]{7}$'
          examples: ['4820193']
        phone_masked:
          type: string
          examples: ['+234803***4567']
        full_name:
          type: [string, 'null']
        roles:
          type: array
          minItems: 1
          items:
            type: string
            enum: [farmer, provider, delivery_partner, admin]
        preferred_channel:
          type: string
          enum: [web, whatsapp, sms]
        home_lga:
          type: [string, 'null']
        home_lat:
          type: [number, 'null']
        home_lng:
          type: [number, 'null']
        consented_at:
          type: [string, 'null']
          format: date-time
        created_at:
          type: string
          format: date-time
    ProfileUpdate:
      type: object
      minProperties: 1
      additionalProperties: false
      properties:
        full_name:
          type: [string, 'null']
          minLength: 1
          maxLength: 100
          description: Trimmed.
        preferred_channel:
          type: string
          enum: [web, whatsapp, sms]
        home_lga:
          type: [string, 'null']
          minLength: 1
          maxLength: 60
        home_lat:
          type: [number, 'null']
          minimum: -90
          maximum: 90
          description: Send with home_lng; both null clears the saved location.
        home_lng:
          type: [number, 'null']
          minimum: -180
          maximum: 180
    ProviderFields:
      type: object
      description: Fields shared by ProviderCreate and ProviderUpdate. Text is trimmed.
      properties:
        business_name:
          type: [string, 'null']
          minLength: 1
          maxLength: 120
          description: Registered business name; null for an individual.
        display_name:
          type: string
          minLength: 1
          maxLength: 80
          description: The name farmers see.
        facility_type:
          type: string
          enum: [cold_room, chest_freezer, fridge, fridge_fleet, other]
        description:
          type: [string, 'null']
          minLength: 1
          maxLength: 1000
        phone:
          type: string
          description: Where booking SMS go, as typed; see Phone numbers above.
        whatsapp:
          type: [string, 'null']
        address_text:
          type: string
          minLength: 1
          maxLength: 200
        landmark:
          type: [string, 'null']
          minLength: 1
          maxLength: 120
        lga:
          type: [string, 'null']
          minLength: 1
          maxLength: 60
        lat:
          type: number
          minimum: -90
          maximum: 90
        lng:
          type: number
          minimum: -180
          maximum: 180
        capacity_total:
          type: number
          exclusiveMinimum: 0
          description: In capacity_unit, at most 3 decimal places.
        capacity_unit:
          type: string
          enum: [sqm, crates, kg]
        price_per_unit_per_day_kobo:
          type: integer
          minimum: 1
          description: Price per capacity unit per day, in kobo.
        min_storage_days:
          type: integer
          minimum: 1
          maximum: 365
          description: Defaults to 1.
        temp_min_c:
          type: [number, 'null']
          minimum: -40
          maximum: 40
        temp_max_c:
          type: [number, 'null']
          minimum: -40
          maximum: 40
          description: Not below temp_min_c.
        has_backup_power:
          type: string
          enum: [generator, solar, none, unknown]
          description: Defaults to unknown.
        category_ids:
          type: array
          minItems: 1
          uniqueItems: true
          items:
            type: string
            format: uuid
          description: Crop categories the facility can store, from /crop-categories.
    ProviderCreate:
      allOf:
        - $ref: '#/components/schemas/ProviderFields'
        - type: object
          required:
            - display_name
            - facility_type
            - address_text
            - lat
            - lng
            - capacity_total
            - capacity_unit
            - price_per_unit_per_day_kobo
            - category_ids
      unevaluatedProperties: false
    ProviderUpdate:
      allOf:
        - $ref: '#/components/schemas/ProviderFields'
        - type: object
          minProperties: 1
          properties:
            is_accepting_bookings:
              type: boolean
              description: false pauses new bookings.
      unevaluatedProperties: false
    ProviderPhoto:
      type: object
      required: [id, url]
      additionalProperties: false
      properties:
        id:
          type: string
          examples: [6f1c1a8e-0c4b-4f5e-9a3d-2b7e8c9d0a1f.jpg]
        url:
          type: string
          format: uri
    PublicProvider:
      type: object
      required:
        - id
        - display_name
        - business_name
        - facility_type
        - description
        - address_text
        - landmark
        - lga
        - lat
        - lng
        - capacity_total
        - capacity_unit
        - price_per_unit_per_day_kobo
        - min_storage_days
        - temp_min_c
        - temp_max_c
        - has_backup_power
        - is_accepting_bookings
        - avg_rating
        - rating_count
        - photos
        - categories
      properties:
        id:
          type: string
          format: uuid
        display_name:
          type: string
        business_name:
          type: [string, 'null']
        facility_type:
          type: string
          enum: [cold_room, chest_freezer, fridge, fridge_fleet, other]
        description:
          type: [string, 'null']
        address_text:
          type: string
        landmark:
          type: [string, 'null']
        lga:
          type: [string, 'null']
        lat:
          type: number
        lng:
          type: number
        capacity_total:
          type: number
        capacity_unit:
          type: string
          enum: [sqm, crates, kg]
        price_per_unit_per_day_kobo:
          type: integer
        min_storage_days:
          type: integer
        temp_min_c:
          type: [number, 'null']
        temp_max_c:
          type: [number, 'null']
        has_backup_power:
          type: string
          enum: [generator, solar, none, unknown]
        is_accepting_bookings:
          type: boolean
        avg_rating:
          type: number
          minimum: 0
          maximum: 5
        rating_count:
          type: integer
        photos:
          type: array
          maxItems: 4
          items:
            $ref: '#/components/schemas/ProviderPhoto'
        categories:
          type: array
          items:
            $ref: '#/components/schemas/CropCategory'
    OwnProvider:
      allOf:
        - $ref: '#/components/schemas/PublicProvider'
        - type: object
          required:
            - phone_masked
            - whatsapp_masked
            - verification_status
            - verified_at
            - created_at
            - updated_at
          properties:
            phone_masked:
              type: string
              examples: ['+234803***4567']
            whatsapp_masked:
              type: [string, 'null']
            verification_status:
              type: string
              enum: [pending, approved, suspended, rejected]
              description: Farmers see the facility only while approved.
            verified_at:
              type: [string, 'null']
              format: date-time
              description: When an admin approved it; null if it went live without approval.
            created_at:
              type: string
              format: date-time
            updated_at:
              type: string
              format: date-time
      unevaluatedProperties: false
    SearchRequest:
      type: object
      additionalProperties: false
      required: [lat, lng, crop_id, quantity, capacity_unit, days]
      properties:
        lat:
          type: number
          minimum: -90
          maximum: 90
        lng:
          type: number
          minimum: -180
          maximum: 180
        crop_id:
          type: string
          format: uuid
          description: An unknown crop is a 400 validation_failed on crop_id.
        quantity:
          type: number
          exclusiveMinimum: 0
          description: In capacity_unit, at most 3 decimal places.
        capacity_unit:
          type: string
          enum: [sqm, crates, kg]
        days:
          type: integer
          minimum: 1
          maximum: 365
        start_date:
          type: string
          format: date
          description: Defaults to today in Africa/Lagos; earlier dates are refused.
    SearchResult:
      type: object
      additionalProperties: false
      required:
        - provider
        - distance_km
        - available_quantity
        - storage_subtotal_kobo
        - service_fee_kobo
        - total_estimate_kobo
        - deposit_kobo
      properties:
        provider:
          $ref: '#/components/schemas/PublicProvider'
        distance_km:
          type: number
          description: Straight-line distance, to 0.1 km.
        available_quantity:
          type: number
          description: Free on the busiest day of the period, in the facility's capacity_unit.
        storage_subtotal_kobo:
          type: integer
        service_fee_kobo:
          type: integer
        total_estimate_kobo:
          type: integer
          description: Storage subtotal plus the service fee, before any delivery.
        deposit_kobo:
          type: integer
          description: Paid online when booking.
    SearchResponse:
      type: object
      additionalProperties: false
      required: [data, expanded_radius, radius_km, start_date, end_date]
      properties:
        data:
          type: array
          items:
            $ref: '#/components/schemas/SearchResult'
        expanded_radius:
          type: boolean
          description: True when nothing was within the default radius and the search was retried.
        radius_km:
          type: number
          description: The radius the results come from.
        start_date:
          type: string
          format: date
        end_date:
          type: string
          format: date
          description: start_date plus days.
    ErrorCode:
      type: string
      enum:
        - bad_request
        - validation_failed
        - not_found
        - conflict
        - payload_too_large
        - rate_limited
        - internal
        - unauthorized
        - forbidden
        - otp_invalid
        - consent_required
        - account_disabled
    ValidationIssue:
      type: object
      required: [location, path, message]
      properties:
        location:
          type: string
          enum: [body, query, params]
        path:
          type: string
          description: Dot-separated path to the field; empty for the whole location.
          examples: [quantity, items.0.crop_id]
        message:
          type: string
    Error:
      type: object
      required: [error]
      properties:
        error:
          type: object
          required: [code, message]
          properties:
            code:
              $ref: '#/components/schemas/ErrorCode'
            message:
              type: string
            details:
              description: Extra context. For validation_failed, an array of ValidationIssue.
  responses:
    BadRequest:
      description: The body is not valid JSON, or validation failed.
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
    NotFound:
      description: No such route or resource.
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
    Conflict:
      description: The request clashes with the resource's current state.
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
    PayloadTooLarge:
      description: The JSON body is over 100 kB, or a photo is over 5 MB.
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
    RateLimited:
      description: Too many requests.
      headers:
        Retry-After:
          schema:
            type: integer
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
    Unauthorized:
      description: No valid access token.
      headers:
        WWW-Authenticate:
          schema:
            type: string
            enum: [Bearer]
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
          example:
            error:
              code: unauthorized
              message: Sign in to continue.
    Forbidden:
      description: A role the route needs is missing, or the origin is outside CORS_ORIGINS.
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
          example:
            error:
              code: forbidden
              message: You don't have access to this.
    Internal:
      description: An unexpected error. The message is generic.
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
```
