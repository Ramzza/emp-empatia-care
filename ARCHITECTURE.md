# Architecture

Empatia Care is a single-process Node.js application that serves a browser portal and a same-origin JSON API. TypeScript is compiled separately for the server and browser; SQLite is the only application database.

## Components

- `public/index.html`, `public/style.css`, and `public/app.ts` implement the public site and appointment portal. The browser bundle is emitted to `public/build/app.js`.
- `server.ts` serves static assets and handles `/api/*` routes. It owns authentication, authorization, appointment availability, booking validation, and persistence.
- `data/empatia.sqlite` stores users, doctor-patient links, sessions, and appointments. SQLite foreign keys and write-ahead logging are enabled; a unique doctor/start-time constraint prevents duplicate bookings.
- `scripts/create-user.ts` is the staff-operated account provisioning entry point. It creates clinicians and patients, and links each patient to a clinician.

## Request and data flow

The browser loads the static site and calls the same-origin API. After login, the server returns an HTTP-only session cookie while keeping only its hash in SQLite; the session response supplies a CSRF token for writes. Appointment reads are scoped to the authenticated doctor or patient, while availability and booking require a patient linked to the selected clinician. A booking is revalidated on the server and persisted only if its slot is still available.

Appointment times are stored as UTC instants. Availability is generated for 30-minute weekday slots from 09:00 to 17:00 in `Europe/Bucharest`. In production, booking also requires successful server-side Cloudflare Turnstile verification.

## Runtime and boundaries

`npm run build` compiles the server to `dist/` and the browser application to `public/build/`; `npm start` runs the compiled server. Production expects one application instance with durable local SQLite storage, behind a TLS-terminating reverse proxy. SQLite is not configured for horizontally scaled application replicas. Account creation is deliberately separate from public registration.

Run `npm test` to build the TypeScript and execute the server tests.
