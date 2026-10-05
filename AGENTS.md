# AGENTS.md

## Project context
Empatia Care is an invite-only clinic portal; `server.ts` serves the API and static app, `public/` contains the site and browser portal, `scripts/` provisions accounts, `tests/` verifies server workflows, and `.github/` holds repository instructions and CI. See [ARCHITECTURE.md](ARCHITECTURE.md) for request flow and [PRD.md](PRD.md) for requirements.

## Conventions
- Use Node.js 22.13+ and strict TypeScript ES modules; the server and browser builds use separate TypeScript configs.
- Keep browser code in `public/`, server/API logic in `server.ts`, and staff account provisioning in `scripts/create-user.ts`.
- Reuse the existing SQLite persistence and server-side authentication, authorization, session, and CSRF boundaries.

## Scripts
- `npm run build` compiles the server and browser application.
- `npm test` builds the TypeScript and runs the Node.js tests.
- `npm run dev` starts the local development server.
- `npm start` runs the compiled server; build first.

## Constraints
- Treat `PRD.md` as the requirements source of truth and follow `.github/copilot-instructions.md` for behavior changes and requirement-to-test mappings.
- Accounts are clinic-provisioned; do not add public registration. Production booking requires server-side Turnstile verification and persistent local SQLite storage for a single app instance.
- Do not commit secrets or patient data, or log passwords, session cookies, Turnstile tokens, or appointment details; do not add clinical notes to appointment forms.
- Edit TypeScript sources rather than generated `dist/` or `public/build/` output.
