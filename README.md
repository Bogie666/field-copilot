# Field Copilot

A job-centric web app for HVAC technicians. A tech starts a job, picks what they are working on, runs measurement tools, saves findings, and builds a customer estimate note from the saved findings. Brand-neutral and configurable per brand.

## Setup

```bash
npm install          # .npmrc sets legacy-peer-deps
cp .env.example .env.local
npm run dev          # http://localhost:3000
```

Checks: `npm run verify` runs lint, typecheck, unit tests and a production build.

Browser smoke test (no AI calls, `/api/explain` is intercepted):

```bash
npm run build
FIELD_COPILOT_AUTH_ENABLED=false npx next start -p 3037 &
COPILOT_URL=http://127.0.0.1:3037 npm run smoke
```

Set `CHROMIUM_PATH` if Chromium is not at `/opt/pw-browsers/chromium`.

## Brand configuration

Set these environment variables per deployment. All are optional.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_BRAND_PRODUCT_NAME` | App name in the header and manifest |
| `NEXT_PUBLIC_BRAND_ORGANIZATION` | Organization name in the footer |
| `NEXT_PUBLIC_BRAND_SHORT_NAME` | Home screen name |
| `NEXT_PUBLIC_BRAND_ACCENT` | Accent hex color |
| `NEXT_PUBLIC_BRAND_LOGO_URL` | Optional logo |
| `NEXT_PUBLIC_BRAND_SUPPORT_URL` | Optional support link |

See `.env.example` for AI provider and Basic auth settings.

## Architecture

- `app/lib/job/`: domain. Job > JobSystem > Finding, a pure reducer, validation, tile status (derived, never stored), storage (IndexedDB, memory for tests).
- `app/lib/tools/`, `app/lib/charge/`: pure assessment code for each tool, with unit tests.
- `app/components/tools/`: one component per tool, hosted by `ToolHost.tsx`. `SaveFinding.tsx` is the shared review and save step.
- `app/api/`: `explain`, `structure-notes`, `nameplate-ocr`, `health`.
- `proxy.ts`: optional Basic auth.

Rules the code enforces: blank means blank, findings save only on an explicit Save, a safety finding needs a safety action (furnace and insulation also need a photo), the job label and photos never go to AI, over-long text is blocked rather than truncated, and equipment age is typed by the tech.

See `HANDOFF.md` for open decisions and unfinished work.
