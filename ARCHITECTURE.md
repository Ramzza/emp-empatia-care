# Architecture

Empatia Care is a Next.js App Router application. React renders the clinic site and booking/admin pages, TypeScript is used throughout, and Tailwind CSS provides the interface styles. API route handlers delegate to server-only modules for validation, security, email, scheduling, and SQLite access.

## Components

- `app/` contains the landing page, portal pages, root layout, and `/api/[...path]` route handler.
- `components/` contains small React page sections and client forms for booking, administration, and cancellation.
- `lib/server/` contains API behavior, request security, appointment rules, mail delivery, CSV hashing, and lazy SQLite initialization.
- `lib/client/` contains browser-safe API helpers; `lib/cnp.ts` hashes CNPs with Web Crypto before a booking request.
- `scripts/import-cnps.ts` reads an authorized CSV and calls the importer, which stores only hashes.
- `proxy.ts` applies a per-request nonce-based CSP and common security headers. `instrumentation.ts` validates required production configuration at server startup.

Keep each source file to at most 100 non-import lines. The `PRD-006` test enforces the React/Next.js/TypeScript/Tailwind stack and this limit.

## Request and data flow

Patients enter a 13-digit CNP in the browser. `lib/cnp.ts` hashes it before `components/booking-form.tsx` submits the hash, email, clinician, time, and Turnstile token to `/api/appointments`. The API checks allow-list membership, availability, uniqueness, request origin, rate limits, the honeypot, and production Turnstile verification before reserving a pending appointment.

The confirmation email contains an opaque 256-bit appointment ID and a cancellation link. The appointment is activated only after email delivery succeeds; a delivery failure removes the pending row. Cancellation is a same-origin POST using the ID as a bearer capability.

Administrators authenticate with environment-configured credentials. A signed, HTTP-only cookie stores only a short-lived session and CSRF token; SQLite stores no accounts or sessions. Admin responses include future active appointments without CNP hashes or email addresses.

SQLite contains exactly `authorized_patients` (CNP hashes only) and `appointments`. Partial unique indexes prevent concurrent active bookings for a patient or clinician/time. Legacy schemas are dropped and vacuumed during database initialization.

## Runtime and boundaries

`npm run dev` starts Next.js in development. `npm run build` creates the production app and `npm start` serves it. Production uses one app instance with durable local SQLite storage behind a trusted TLS-terminating reverse proxy; rate limits are per process.

Production requires an HTTPS `PUBLIC_ORIGIN`, `APP_SECRET`, administrator credentials, SMTP configuration, and server-verified Cloudflare Turnstile. Do not log CNPs, CNP hashes, email addresses, appointment IDs, passwords, session cookies, Turnstile tokens, or appointment details.

Run `npm test` to build, type-check, and execute the requirement-mapped tests, including an HTTP smoke test against the production Next.js server.
