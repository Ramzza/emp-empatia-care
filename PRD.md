# Product requirements

## Outcome

Provide a privacy-minimizing clinic appointment portal. Patients book with a clinic-approved CNP, receive an email containing their appointment ID and cancellation link, and administrators can view active appointments.

## Requirements

- **PRD-001 - Minimize patient data:** The browser hashes the 13-digit CNP with SHA-256 before sending it to the booking API. The API never accepts or persists raw CNPs; the CSV importer processes source values in memory and writes only hashes. SQLite contains only `appointments` and `authorized_patients`, which stores only CNP hashes.
  **Verification:** `tests/server.test.ts` test `PRD-001: only appointment and hashed-CNP tables remain; the browser hashes CNP locally`; importer tests in `tests/import-cnps.test.ts`.
- **PRD-002 - Authorized, exclusive booking:** A booking requires an allow-listed CNP hash, valid email, clinician, and a future 30-minute weekday slot from 09:00 to 17:00 Europe/Bucharest. A CNP may have only one active appointment. Email is used for delivery but is not persisted in SQLite.
  **Verification:** `tests/server.test.ts` test `PRD-002: CSV-authorized CNP hashes can book one future clinic slot with a required email`.
- **PRD-003 - Email confirmation and cancellation:** Successful bookings send a confirmation to the submitted email with an opaque appointment ID and cancellation link. Cancellation by appointment ID marks the booking inactive; the email address is not stored.
  **Verification:** `tests/server.test.ts` test `PRD-003: confirmation email contains the appointment-ID cancellation link; cancellation releases the booking`.
- **PRD-004 - Admin schedule:** An environment-configured administrator can sign in without a database account or persisted session and view all future active appointments. Admin responses do not expose CNP hashes or email addresses.
  **Verification:** `tests/server.test.ts` test `PRD-004: only an authenticated admin can list active appointments`.
- **PRD-005 - Protected requests:** Booking and cancellation writes require same-origin requests, admin writes require CSRF, booking rejects raw-CNP and honeypot submissions, booking attempts are rate-limited, production booking verifies Turnstile, and the portal cannot be framed.
  **Verification:** `tests/server.test.ts` test `PRD-005: booking writes require same-origin, reject raw CNPs, and enforce the honeypot`.
