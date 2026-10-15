# Architecture

Empatia Care is a single-process Node.js application that serves a browser portal and a same-origin JSON API. TypeScript is compiled separately for the server and browser; SQLite is the only application database.

## Components

- `public/index.html`, `public/style.css`, `public/app.ts`, and `public/cnp.ts` implement the public website, booking workflow, admin UI, and browser-side SHA-256 CNP hashing. The browser build is emitted to `public/build/`.
- `server.ts` serves static assets and owns booking validation, slot availability, admin authentication, request security, SQLite persistence, and SMTP confirmation delivery.
- `scripts/import-cnps.ts` reads a clinic-supplied CSV, hashes each 13-digit CNP in memory, and adds only hashes to the authorization table.
- `data/empatia.sqlite` contains exactly two application tables: `authorized_patients` stores only CNP hashes; `appointments` stores appointment ID, CNP hash, clinician, time, status, and creation time. Email is not persisted.

## Request and data flow

The browser validates and hashes the CNP locally with Web Crypto, then sends the hash, email, clinician, selected slot, and bot challenge to the same-origin API. The server verifies that the hash is allow-listed, checks that the slot is still available and the CNP has no other active booking, and inserts a pending appointment. It sends a confirmation email containing the appointment ID and cancellation link; the appointment becomes active only after delivery succeeds. A mail failure removes the pending row.

Appointments use 30-minute UTC intervals generated for weekdays from 09:00 to 17:00 in `Europe/Bucharest`. Partial unique indexes prevent concurrent active bookings for the same CNP or clinician/time. Cancellation is a same-origin POST that uses the random 256-bit appointment ID from the email as a bearer capability.

An administrator authenticates with environment-configured credentials. The server keeps only a short-lived, signed admin cookie in the browser; it stores no user accounts or sessions. The admin API returns future active appointment details without CNP hashes or email addresses.

On startup, a legacy database schema is dropped and vacuumed before the new tables are created so former account, session, and appointment personal data is not carried forward.

## Runtime and boundaries

`npm run build` compiles the server to `dist/` and the browser application to `public/build/`; `npm start` runs the compiled server. Production expects one application instance with durable local SQLite storage, behind a TLS-terminating reverse proxy. SQLite is not configured for horizontally scaled application replicas.

Production booking requires server-side Cloudflare Turnstile verification, valid SMTP settings, and environment-configured admin credentials. All writes use same-origin checks; admin writes also use CSRF tokens. Rate limiting is per application process. Do not log CNPs, CNP hashes, email addresses, appointment IDs, session cookies, passwords, or Turnstile tokens.

Run `npm test` to build the TypeScript and execute the server and CSV import tests.
