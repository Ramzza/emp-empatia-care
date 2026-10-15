# AGENTS.md

## Project context
Empatia Care is a privacy-minimizing clinic booking portal; `server.ts` serves the API and static app, `public/` contains the site and browser portal, `scripts/import-cnps.ts` seeds authorized CNP hashes from CSV, and `tests/` verifies server workflows. See [ARCHITECTURE.md](ARCHITECTURE.md) for request flow and [PRD.md](PRD.md) for requirements.

## Conventions
- Use Node.js 22.13+ and strict TypeScript ES modules; the server and browser builds use separate TypeScript configs.
- Keep browser code in `public/`, server/API logic in `server.ts`, and CNP CSV import in `scripts/import-cnps.ts`.
- Keep SQLite limited to appointments and the CNP-hash allow-list; administrator credentials come from environment configuration.

## Scripts
- `npm run build` compiles the server and browser application.
- `npm test` builds the TypeScript and runs the Node.js tests.
- `npm run dev` starts the local development server.
- `npm start` runs the compiled server; build first.

## Constraints
- Treat `PRD.md` as the requirements source of truth; map behavior changes to executable tests by requirement ID.
- Patients do not create accounts. Booking requires a clinic-approved CNP hash; only appointments and CNP hashes are persisted. Production booking requires server-side Turnstile verification and persistent local SQLite storage for a single app instance.
- Do not commit secrets or patient data, or log CNPs, CNP hashes, email addresses, appointment IDs, passwords, session cookies, Turnstile tokens, or appointment details; do not add clinical notes to appointment forms.
- Edit TypeScript sources rather than generated `dist/` or `public/build/` output.
