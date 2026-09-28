# Empatia Care

A responsive clinic website and invite-only appointment portal for Empatia Medical Centre in Târgu Mureș. The public-facing design and copy are original; clinic details reflect the publicly listed services and location.

See [PRD.md](PRD.md) for the product requirements and their test mappings.

## What it does

- Patients sign in to accounts provisioned by the clinic; there is no public registration.
- A patient can book only with a clinician to whom their account is explicitly linked.
- The server checks the patient–clinician relationship, appointment slot, session, CSRF token, rate limit and bot challenge before saving a booking.
- In production, Cloudflare Turnstile is required and verified server-to-server. Booking fails closed when its production configuration is missing or verification fails.
- Clinicians can sign in to a private schedule showing appointment times and patient names. Patients can see only their own bookings.
- Passwords use Node's scrypt implementation. Session identifiers are random, stored as hashes, and delivered in HTTP-only, same-site cookies.
- Appointment slots are 30 minutes, weekdays from 09:00 to 17:00 Europe/Bucharest time.

## Run locally

Requires Node.js 22.13 or newer. The server, account-provisioning CLI, browser application, and tests are written in strict TypeScript; the build emits server output to `dist/` and the browser bundle to `public/build/app.js`.

```sh
npm install
cp .env.example .env
npm run build
npm run dev
```

For a production start, run `npm run build` and then `npm start`.

In a second terminal, provision accounts. Passwords are read from a hidden prompt; no public signup or default credentials exist:

```sh
npm run create-user -- --role doctor --email doctor@example.test --name "Dr. Demo"
npm run create-user -- --role patient --email patient@example.test --name "Alex Demo" --doctor doctor@example.test
```

Open `http://localhost:3000`. Local development permits booking without Turnstile; production does not. The example accounts and clinic details are placeholders and must be reviewed before public use.

## Production configuration

Set `NODE_ENV=production`, a unique `APP_SECRET` of at least 32 random bytes, the public HTTPS `PUBLIC_ORIGIN`, and Turnstile site and secret keys. Set `TURNSTILE_EXPECTED_HOSTNAME` to the exact hostname configured in Cloudflare. Use a persistent, private `DATABASE_PATH`; the process must be able to write to its parent directory. Start with `npm start` behind a TLS-terminating reverse proxy.

The app intentionally does not trust proxy headers for client IPs. Configure edge-level rate limits at the trusted reverse proxy as well; the built-in limit is per application process. SQLite is intended for a single app instance with durable local storage, not horizontally scaled replicas.

Before handling real patient data, the clinic must configure and review its privacy notice, consent, data-retention and deletion procedures, access administration, backups, incident response, and applicable GDPR/health-data obligations. This starter does not provide medical advice, emergency care, or a compliance certification. Do not put symptoms or other clinical notes in appointment forms.

## Security boundaries

- Only staff-provisioned accounts can authenticate. Provision the clinician account before linking patients to it.
- A clinician cannot see appointments belonging to another clinician; a patient cannot query or book for an unlinked clinician.
- Only the account owner can see a patient's bookings. Clinician schedule responses include only the linked patient name, booking time and status.
- Writes require same-origin requests and a per-session CSRF token. Login and booking attempts are rate-limited.
- Availability is informational; the create-booking transaction rechecks access and slot conflicts before saving.
- Configure backups and operational monitoring without logging passwords, session cookies, Turnstile tokens or patient appointment details.

## Tests

```sh
npm test
```
