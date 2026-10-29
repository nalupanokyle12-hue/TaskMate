# Changelog

## 1.0.0 — Initial implementation

- Added React/Vite client, Express API, and MySQL schema.
- Added student registration/login, signed HTTP-only session cookie, password hashing, account settings, and theme persistence.
- Added task CRUD, status updates, search/filter/sort, and live dashboard aggregates.
- Added responsive dashboard, task management, authentication, and settings screens with six themes.
- Added Vercel rewrite, environment example, and beginner setup/deployment documentation.

## 1.1.0 — Email verification

- Added pending email verification for new accounts, hashed single-use tokens, and a 24-hour expiry.
- Added confirmation and rate-limited resend endpoints; blocked sign-in until verification.
- Added email confirmation UI and local development verification links.
- Added a migration that preserves existing accounts as verified.

## 1.2.0 — Email codes and student profile

- Replaced signup confirmation links with short-lived six-digit email codes.
- Added optional email-code MFA for each sign-in, enabled by default and configurable in settings.
- Added per-account usernames and private profile image upload/removal.
- Added Brevo HTTPS transactional email support for deployments that block SMTP ports.
