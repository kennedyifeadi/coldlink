# ColdLink API reference

The API contract, written as an OpenAPI 3.1 document in the YAML block below. Each issue that adds or changes an endpoint updates it in the same pull request. To view it in Swagger UI or Redocly, paste the block into a file.

## Conventions

- **Base path:** every endpoint is under `/api/v1`. JSON only.
- **Errors:** every error response has the shape `{ error: { code, message, details? } }`. The schema and the list of codes live in `packages/shared/src/errors.ts` (`errorResponseSchema`, `errorCodes`); the table below must match them.
- **Correlation ID:** send `X-Request-Id` to tag a request (1 to 128 characters from `A-Z a-z 0-9 . _ : -`). Anything else, or no header, gets a generated UUID. The response always echoes the ID in `X-Request-Id`, and every log line for the request carries it, so quote it when reporting a problem.
- **Lists:** a list response is `{ data: [...] }`, so a cursor can sit next to `data` later without changing the shape.
- **Pagination:** paginated lists take `limit` and `cursor` (PRD 8). The reference lists (`/crops`, `/crop-categories`) are not paginated: they are small, admin-managed reference data (22 crops, 7 categories) that a client loads whole.
- **Caching:** the public reference endpoints send `Cache-Control: public` with a short `max-age` (5 minutes for crops and categories, 60 seconds for config). Other responses, and every error, send none.
- **Rate limits:** limited routes send `RateLimit` and `RateLimit-Policy` headers, and `Retry-After` with a 429. The reference endpoints are not limited yet: they are cheap, cacheable reads.
- **Response schemas:** the Zod schemas for response bodies live in `packages/shared` (`cropCategoriesResponseSchema`, `cropsResponseSchema`, `publicConfigSchema`), for the web app to parse responses with.

| Code | Status | When |
|---|---|---|
| `bad_request` | 400 | The body is not valid JSON or cannot be read. |
| `validation_failed` | 400 | Params, query or body fail validation. `details` lists every issue as `{ location, path, message }`. |
| `not_found` | 404 | No such route, or no such resource. |
| `conflict` | 409 | The request clashes with the resource's current state, such as a booking status change the state machine does not allow from its current status or for this actor. `details` names the booking, `from`, `to` and `actor_type`. |
| `payload_too_large` | 413 | The JSON body is over 100 kB. |
| `rate_limited` | 429 | Too many requests from this client; retry after `Retry-After` seconds. |
| `internal` | 500 | An unexpected error. The message is always generic; details are only in the server log, under the request ID. |

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
components:
  headers:
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
    ErrorCode:
      type: string
      enum: [bad_request, validation_failed, not_found, conflict, payload_too_large, rate_limited, internal]
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
    PayloadTooLarge:
      description: The JSON body is over 100 kB.
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
    Internal:
      description: An unexpected error. The message is generic.
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
```
