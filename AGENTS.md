# AGENTS.md

## Project context
Empatia Care is a privacy-minimizing clinic booking portal built with React, Next.js App Router, TypeScript, and Tailwind CSS. `app/` contains pages and API routes, `components/` contains the React UI, `lib/server/` owns server behavior, and `scripts/import-cnps.ts` imports authorized CNP hashes. See [ARCHITECTURE.md](ARCHITECTURE.md) and [PRD.md](PRD.md).

## Conventions
- Use Node.js 22.13+ and strict TypeScript. Use Next.js App Router route handlers and React components; style with Tailwind CSS.
- Keep user-visible routes under `app/`, reusable UI under `components/`, and server-only behavior under `lib/server/`.
- Keep each source file to at most 100 non-import lines. Add shadcn/ui only when needed.
- Keep SQLite limited to appointments and the CNP-hash allow-list; administrator credentials come from environment configuration.

## Scripts
- `npm run build` builds the Next.js application.
- `npm test` builds Next.js, type-checks TypeScript, and runs the Node.js tests.
- `npm run dev` starts the local development server.
- `npm start` runs the compiled Next.js server; build first.

## Constraints
- Treat `PRD.md` as the requirements source of truth; map behavior changes to executable tests by requirement ID.
- Patients do not create accounts. Booking requires a clinic-approved CNP hash; only appointments and CNP hashes are persisted. Production booking requires server-side Turnstile verification and persistent local SQLite storage for a single app instance.
- Do not commit secrets or patient data, or log CNPs, CNP hashes, email addresses, appointment IDs, passwords, session cookies, Turnstile tokens, or appointment details; do not add clinical notes to appointment forms.
- Edit TypeScript sources rather than generated `dist/` or `public/build/` output.
