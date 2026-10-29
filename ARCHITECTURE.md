# Architecture

## Components

- `client/`: React single-page application, routing, six CSS-variable themes, and responsive UI.
- `server/`: Express API, validation, bcrypt authentication, cookie session verification, and parameterized MySQL queries.
- `database/schema.sql`: MySQL database and indexed `users`/`tasks` tables.
- `vercel.json`: same-origin frontend rewrite for `/api/*` and SPA fallback.

## Request flow

The browser calls `/api/v1/...` with credentials included. In development Vite proxies that path to Express. In production Vercel rewrites it to the Render service, so from the browser's perspective it remains same-origin. Express issues a signed seven-day JWT in an HTTP-only cookie; the frontend cannot read the session token. Protected routes verify it and use its user ID in every task query. Passwords use bcrypt hashes and are never returned.

## Data relationships

One user owns many tasks. `tasks.user_id` references `users.id` with `ON DELETE CASCADE`. Optional subject is a text label attached to a task. Theme is an enum-constrained user preference.

## Deployment

Vercel serves the static client and forwards `/api/*` to Render. Render runs Express and connects to separately provisioned persistent MySQL. The rewrite hostname and Render/MySQL environment variables must be set by the project owner. Production cookie behavior and database persistence require live deployment verification.

Email verification uses six-digit codes with a ten-minute expiry. The challenge ID is random; MySQL stores its SHA-256 hash, and stores an HMAC of the code. Brevo sends through HTTPS, SMTP is a fallback, and local development prints codes to the API terminal when no provider is configured.

## Authentication and profile updates

Registration creates an unverified user and a time-limited code challenge. The code and challenge ID are never stored in plaintext: MySQL stores an HMAC of the code and SHA-256 of the challenge ID. After verification, Express issues the session cookie. Sign-in email MFA uses the same one-time challenge flow when enabled; the student can turn it off only after confirming the current password. MFA is enabled for new users by default.

Profile name and username are ordinary authenticated updates. Profile photos are compressed in the browser, size/type-checked by the API, stored as a MySQL BLOB, and served only from an authenticated endpoint for the current user. Brevo delivery uses HTTPS; the existing local mode prints OTP codes to the API terminal when no provider is configured.

