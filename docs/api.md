# ColdLink API reference

The API contract, written as an OpenAPI 3.1 document in the YAML block below. Each issue that adds or changes an endpoint updates it in the same pull request. To view it in Swagger UI or Redocly, paste the block into a file.

## Conventions

- **Base path:** every endpoint is under `/api/v1`. JSON only.
- **Errors:** every error response has the shape `{ error: { code, message, details? } }`. The schema and the list of codes live in `packages/shared/src/errors.ts` (`errorResponseSchema`, `errorCodes`); the table below must match them.
- **Correlation ID:** send `X-Request-Id` to tag a request (1 to 128 characters from `A-Z a-z 0-9 . _ : -`). Anything else, or no header, gets a generated UUID. The response always echoes the ID in `X-Request-Id`, and every log line for the request carries it, so quote it when reporting a problem.
- **Pagination:** lists take `limit` and `cursor` (PRD 8). No list endpoint exists yet.
- **Rate limits:** limited routes send `RateLimit` and `RateLimit-Policy` headers, and `Retry-After` with a 429.

| Code | Status | When |
|---|---|---|
| `bad_request` | 400 | The body is not valid JSON or cannot be read. |
| `validation_failed` | 400 | Params, query or body fail validation. `details` lists every issue as `{ location, path, message }`. |
| `not_found` | 404 | No such route, or no such resource. |
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
      summary: Liveness check
      tags: [System]
      responses:
        '200':
          description: The API is running.
          headers:
            X-Request-Id:
              $ref: '#/components/headers/XRequestId'
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Health'
components:
  headers:
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
      required: [status, version]
      properties:
        status:
          const: ok
        version:
          type: string
          examples: ['0.0.0']
    ErrorCode:
      type: string
      enum: [bad_request, validation_failed, not_found, payload_too_large, rate_limited, internal]
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
