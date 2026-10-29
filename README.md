# TaskMate — Your Tasks. Your Progress.

TaskMate is a student task and deadline manager built as a React/Vite client and Express REST API backed by MySQL. It includes student accounts, private task CRUD, a dashboard, profile and password settings, and six saved appearance themes.

## What’s included

- Registration and sign in with bcrypt password hashing and a seven-day, HTTP-only signed session cookie.
- User-scoped task list, details, create/edit/delete, status changes, search, status/priority filters, and sorting.
- Dashboard totals, upcoming deadlines, recently added tasks, and recent completions from MySQL.
- Profile name and password updates, and six themes persisted in MySQL.
- Responsive layouts for narrow phones through desktop widths.

## Requirements

Install Node.js 20 or newer, npm, Git, and MySQL 8 (or compatible MySQL server). VS Code is recommended. No third-party database service is included.

## Run locally

1. Start MySQL with your local installation, XAMPP, or WAMP.
2. In MySQL Workbench or the MySQL command line, import `database/schema.sql`. The schema creates the `taskmate` database and its tables.
3. Copy `server/.env.example` to `server/.env`. Set database credentials and replace `SESSION_SECRET` with a random value of at least 32 characters. Keep `.env` private.
4. From the project root, install and start:

   ```bash
   npm install
   npm install --prefix client
   npm install --prefix server
   npm run dev
   ```

   The React site is at http://localhost:5173 and the API listens on http://localhost:4000. Vite forwards `/api` requests to Express.
5. Register an account, add/edit/complete/delete tasks, try the search and filters, then visit Settings to select all six themes. Use a second account to confirm each account sees only its own data.

If you prefer separate terminals, run `npm run dev --prefix server` and `npm run dev --prefix client` from the root.

## Environment settings

Backend variables are documented in `server/.env.example`: `PORT`, `NODE_ENV`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `SESSION_SECRET`, and `FRONTEND_URL`. The API uses same-origin browser requests; local Vite proxies API calls. `FRONTEND_URL` is reserved for hosting configuration and is not currently needed by the API middleware.

The session cookie is HTTP-only, `SameSite=Lax`, and `Secure` in production. For deployment, Vercel's rewrite proxies `/api/*` to the Render service, keeping browser requests on the Vercel origin. This avoids relying on third-party cookies. Update the placeholder Render hostname in `vercel.json` before deployment. The API uses `trust proxy` so secure cookies work behind Render's proxy.

## API overview

All routes are under `/api/v1`:

- `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- `PUT /auth/profile`, `PUT /auth/theme`, `PUT /auth/password`
- `GET /dashboard/stats`
- `GET/POST /tasks`, `GET/PUT/DELETE /tasks/:id`, `PATCH /tasks/:id/status`
- `GET /health`

Task endpoints require the signed session cookie. SQL uses parameterized statements, and every task query scopes by the authenticated user ID.

## Database notes

`users` stores account fields and the validated theme key. `tasks` stores a task and its owner; the foreign key cascades task deletion when its user is deleted. Task indexes cover common user/status, due-date, creation, and priority lookups. Subject/category is an optional per-task label (not a separate category table), so a student cannot accidentally attach another student's category.

Deadlines are currently stored and compared in UTC. The dashboard considers a task overdue when its deadline is earlier than the current UTC time and its status is not Completed. The client formats deadline display in the browser's local timezone. A production deployment requiring exact local-midnight semantics should add an explicit user timezone preference.

## Deploy

### MySQL

Provision a persistent hosted MySQL database separately. Import `database/schema.sql`, then copy its host, port, database, username, and password into the Render service environment. Never place these values in the frontend or commit `.env` files.

### Render API

Create a Web Service from this repository, set its root directory to `server`, build command to `npm install`, and start command to `npm start`. Add the database variables, `NODE_ENV=production`, and a unique `SESSION_SECRET` of 32+ characters. Render provides `PORT`. Set a health check path of `/api/v1/health`. Confirm the health check reports the database as connected.

### Vercel frontend

Import the repository into Vercel and set the root directory to `client` only if Vercel is configured to read the root `vercel.json`; otherwise keep the repository root as project root and set the build command to `npm run build --prefix client` and output directory to `client/dist`. Set the Render rewrite destination in root `vercel.json` to the actual API hostname. Deploy, then verify registration, sign-in, reload/session restoration, logout, and account isolation using the deployed domains.

Do not claim deployment is complete until the database is provisioned and those real-host checks pass. Vercel and Render accounts, a database host, and real deployment values are needed for production verification.

## GitHub

```bash
git init
git add .
git commit -m "Build TaskMate student task manager"
```

Check that neither `server/.env` nor any credentials are staged before pushing.

## Troubleshooting

- **Database connection refused:** ensure MySQL is running, the port is right, and credentials/database match the environment file.
- **Unknown database/table:** import `database/schema.sql` into the configured MySQL server.
- **Port in use:** set another `PORT` for Express or stop the process using port 4000/5173.
- **Login returns an error:** ensure `SESSION_SECRET` is at least 32 characters and MySQL is reachable.
- **Vercel API requests fail:** replace the placeholder rewrite hostname, redeploy, and check Render logs and `/api/v1/health`.
- **Cookie/session not restored:** use the Vercel same-origin `/api` rewrite and test on the deployed HTTPS URL; do not call the Render hostname directly from the browser.

## Checks and current limits

The React production build passed, Node syntax checks passed, and server unit tests cover OTP generation and challenge/code hashing. Full authentication/profile integration still requires MySQL with migration 002 applied and a configured email provider.

## Email verification and sign-in codes

Every new account must enter a six-digit email verification code. Codes expire after 10 minutes, are single-use, are stored only as keyed hashes, and allow at most five guesses. New accounts require an email code after the password at every sign-in by default. In Settings, the checkbox is **Skip the email code after password sign-in**: leave it unchecked to require a code; check it and confirm the current password to opt out. Signup email verification remains mandatory either way.

TaskMate supports Brevo's HTTPS transactional email API, SMTP, or a local development mode. Local mode prints the code in the API terminal when no provider settings are configured.

### Update the existing database

If this database already has `email_verified` (as in the earlier schema), import `database/migrations/002_email_codes_profile.sql` once through phpMyAdmin. It adds usernames, email sign-in preference, private profile image storage, and the challenge table; it gives existing accounts a generated username and keeps them verified. Do not import `schema.sql` over an existing database. For a brand-new database, use the updated `database/schema.sql` instead.

### Free email with Brevo

Brevo currently lists 300 sends per day on its Free plan. It requires a registered and verified sender; authenticating a domain can improve delivery. A free mailbox sender may be filtered or rewritten by recipient providers.

1. Create a Brevo account, verify a sender address you control, and create an API key for transactional email.
2. In `server/.env`, set `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, and optionally `BREVO_SENDER_NAME`. Use the API key, not an SMTP password. Never commit it.
3. Restart the API. Register a new account or sign in with email codes enabled. Check Brevo's transactional email logs if the message does not arrive.
4. For Render, put those same settings in the API service's environment variables. TaskMate sends via HTTPS API, since Render Free blocks outbound SMTP on ports 25, 465, and 587.

With no provider configured locally, copy the code from the API terminal. For deployed email, use Brevo or another provider that works through HTTPS. Provider quotas and sender requirements can change.

## Student profile and privacy

Students can edit full name and username and upload/remove a profile image. The browser resizes uploaded images; the API accepts PNG, JPEG, or WebP up to 512 KB, verifies the image signature, and stores it in the student's MySQL row. The authenticated avatar endpoint serves only the signed-in student's image.

## Deployment and testing

After importing the database migration, restart the local app and test: new account plus signup code; wrong, expired, and resent codes; sign-in with MFA on; sign-in after switching MFA off in Settings; username changes; avatar upload/removal; and task ownership. The existing Render blueprint includes Brevo environment placeholders. Keep the API key and session secret in the server's environment only.


