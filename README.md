# Empatia Care

A responsive clinic website and privacy-minimizing appointment portal for Empatia Medical Centre in Târgu Mureș. See [PRD.md](PRD.md) for the business requirements and test mappings, and [ARCHITECTURE.md](ARCHITECTURE.md) for the system design.

## Booking and data

- Patients enter their CNP and email address, choose a clinician and an available slot, and book without creating an account.
- The browser hashes the 13-digit CNP with SHA-256 before sending the booking request. Raw CNPs are not sent to the booking API or persisted.
- Staff import the clinic's approved CNP list from a CSV. SQLite stores only CNP hashes in `authorized_patients` and the booking data in `appointments`; the appointment's email is not persisted.
- A confirmation email includes the appointment ID and a cancellation link. Email delivery is required before a booking is confirmed; a delivery failure does not leave a saved appointment.
- An administrator configured with environment credentials can view all future active appointments. Admin credentials and sessions are not stored in SQLite.
- Appointment slots are 30 minutes, weekdays from 09:00 to 17:00 Europe/Bucharest time. A CNP can have one active appointment at a time.

**SHA-256 is pseudonymization, not anonymization.** CNPs have a constrained format and hashes may be vulnerable to guessing. Protect the SQLite file and backups as sensitive data, restrict access to the CSV, and do not commit patient data.

## Run locally

Requires Node.js 22.13 or newer.

```sh
npm install
cp .env.example .env
```

Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` in `.env` (at least 12 characters for the password) and configure an SMTP server using `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, and `MAIL_FROM`. Booking cannot be confirmed unless the email can be delivered. For local development, a local SMTP sink such as Mailpit can be used.

Build and start the app:

```sh
npm run build
npm run dev
```

Prepare a CSV with a `cnp` column containing one 13-digit CNP per row, then import it:

```sh
npm run import-cnps -- ./clinic-cnp-list.csv
```

The importer keeps raw CNPs in memory only, writes their SHA-256 hashes, reports counts without printing values, and can be run again safely. Keep the source CSV outside the repository and delete it according to the clinic's retention procedures.

Open `http://localhost:3000`. Patients can book from the public site. Clinic staff can sign in from the **Administrator** link.

## Production configuration

Set `NODE_ENV=production`, a unique `APP_SECRET` of at least 32 random bytes, an HTTPS `PUBLIC_ORIGIN`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` (at least 12 characters), and the SMTP settings listed above. Production booking also requires Cloudflare `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, and the exact `TURNSTILE_EXPECTED_HOSTNAME`. Use a persistent, private `DATABASE_PATH` behind a TLS-terminating reverse proxy.

SQLite is intended for a single app instance with durable local storage, not horizontally scaled replicas. Configure edge-level rate limits at the trusted reverse proxy; the built-in limits are per process.

The first startup against the previous database schema drops its user, clinician-link, session, and legacy appointment tables, then vacuums the database. This intentionally removes records that do not meet the new data-minimization requirements; export or retain any records separately only if required by clinic policy and applicable law.

## Security and privacy boundaries

- CNP allow-list membership and booking uniqueness are checked on the server; SQLite also enforces one active appointment per CNP and per clinician/time.
- The email address is used only to send the confirmation and cancellation link. It is not placed in SQLite, admin responses, or application logs.
- Cancellation uses a random 256-bit appointment ID as a bearer capability and requires a same-origin POST after the patient confirms the action.
- Admin authentication uses an environment-configured password and a signed, HTTP-only, same-site cookie; no admin identity or session is persisted.
- Booking writes are same-origin checked, rate-limited, honeypot-protected, and require server-verified Turnstile in production. The site cannot be framed.
- Do not add patient names, contact details, CNPs, symptoms, or clinical notes to appointments or logs.

## Tests

```sh
npm test
```
