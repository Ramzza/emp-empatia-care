# Product requirements

## Outcome

Provide an invite-only clinic portal for secure patient and clinician appointment scheduling.

## Requirements

- **PRD-001 - Clinic-managed access:** Only clinic-provisioned patients and clinicians can sign in; public registration is disabled.
  **Verification:** `tests/server.test.ts` end-to-end test `PRD-001: invite-only accounts; ...`.
- **PRD-002 - Safe appointment booking:** Patients can access only linked clinicians' availability and book future weekday slots every 30 minutes from 09:00 to 17:00 Europe/Bucharest time; invalid dates and duplicate bookings are rejected.
  **Verification:** `tests/server.test.ts` end-to-end test `PRD-002: linked weekday slots and booking; ...`.
- **PRD-003 - Private schedules:** Patients see only their own appointments, and clinicians see only appointments for their linked patients.
  **Verification:** `tests/server.test.ts` end-to-end test `PRD-003: private schedules; ...`.
- **PRD-004 - Protected portal writes:** Booking writes require same-origin and valid CSRF checks, honeypot submissions are rejected, and the portal cannot be framed.
  **Verification:** `tests/server.test.ts` end-to-end test `PRD-004: protected requests`.
