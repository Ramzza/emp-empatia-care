# Empatia Care

A privacy-minimizing clinic website and booking portal for Empatia Medical Centre in Târgu Mureș. It uses React, the Next.js App Router, TypeScript, and Tailwind CSS. See [PRD.md](PRD.md) for product requirements and test mappings, and [ARCHITECTURE.md](ARCHITECTURE.md) for the system design.

## Booking and data

- Patients book without creating an account using a clinic-approved CNP, email, clinician, and available appointment slot.
- The browser hashes the CNP with SHA-256 before sending it to the API. Raw CNPs are not sent or persisted.
- SQLite stores only CNP hashes in `authorized_patients` and booking data in `appointments`; email is used only for confirmation and cancellation delivery.
- Confirmation is required before a booking becomes active. The email contains an opaque appointment ID and cancellation link.
- Clinic administrators sign in with environment-configured credentials and can view future active appointments.
- Appointment slots are 30 minutes, weekdays from 09:00 to 17:00 Europe/Bucharest time. A CNP can have one active booking.

**SHA-256 is pseudonymization, not anonymization.** CNPs have a constrained format and hashes may be vulnerable to guessing. Protect the SQLite file and backups, restrict access to the source CSV, and do not commit patient data.

## Run locally

Requires Node.js 22.13 or newer.

```sh
npm install
cp .env.example .env
npm run dev
```

Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` in `.env` and configure SMTP using `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, and `MAIL_FROM`. For local development, a local SMTP sink such as Mailpit can be used.

Open `http://localhost:3000`. Patients can book from **Programare**; clinic staff can sign in from **Administrator**.

Prepare a CSV with a `cnp` column containing one 13-digit CNP per row, then import it:

```sh
npm run import-cnps -- ./clinic-cnp-list.csv
```

The importer hashes source values in memory and writes only hashes to SQLite. It reports counts without printing values and can be run again safely. Keep the source CSV outside the repository.

## Production

Set `NODE_ENV=production`, a unique `APP_SECRET` of at least 32 random bytes, an HTTPS `PUBLIC_ORIGIN`, valid administrator credentials, all SMTP settings, and Cloudflare `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, and `TURNSTILE_EXPECTED_HOSTNAME`. Set `DATABASE_PATH` to a persistent private location.

SQLite is intended for one app instance with durable local storage, not horizontally scaled replicas. Configure edge-level rate limits at the trusted reverse proxy. The first startup against an old database schema removes legacy account, session, and appointment data that does not meet the privacy requirements.

## Security and tests

Booking and cancellation writes require same-origin checks; admin writes also require CSRF. Booking is rate-limited, honeypot-protected, and verifies Turnstile on the server in production. A nonce-based CSP prevents framing. Do not add patient names, contact details, CNPs, symptoms, or clinical notes to appointments or logs.

Each source file is limited to 100 non-import lines. `npm test` builds the Next.js app, runs TypeScript checks, and executes the PRD-mapped API and Next.js server tests.
