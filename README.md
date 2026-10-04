# Field Copilot

A job-centric web app for HVAC technicians. A tech starts a job, picks what they are working on, runs measurement tools, saves findings, and builds a customer estimate note from the saved findings. Brand-neutral and configurable per brand.

## Setup

```bash
npm install          # .npmrc sets legacy-peer-deps
cp .env.example .env.local
npm run dev          # http://localhost:3000
```

Checks: `npm run verify` runs lint, typecheck, unit tests and a production build.

Browser checks (mocked AI only; camera regression uses actual on-device WASM OCR):

```bash
npm run build
FIELD_COPILOT_AUTH_ENABLED=false npm run start -- -p 3000
# In a second terminal:
COPILOT_URL=http://127.0.0.1:3000 npm run smoke
COPILOT_URL=http://127.0.0.1:3000 npm run smoke:regressions
```

Set `CHROMIUM_PATH` to your installed Chromium binary. The regressions cover drafts/stale findings, late-response note protection, camera OCR, photo annotation with storage failure/retry, and published PT lookups with saved/AI provenance in both themes. OCR requires initial engine/language asset downloads; paid image analysis is not used.

## Published refrigerant references

Pressure-temperature lookups now use Honeywell chart rows for R-410A/R-22, iGas USA for R-32, and Chemours Opteon XL41 for R-454B. R-454B retains separate liquid/bubble and vapor/dew curves, including the same-source high-pressure extension. Lookups interpolate between actual pressure knots and reject values beyond the published range; they never extrapolate.

`PT_DATA_APPROVED` remains `false`: published numerical data is not company approval of a charging procedure or a substitute for equipment-specific targets. Saved findings retain the source and data revision. Historical calculations are not silently rewritten; explicitly update a finding to use the new references.

See [`scripts/pt-sources/README.md`](scripts/pt-sources/README.md) for source URLs, ranges, extraction notes and hashes. Reproduce/check the saved data with `python3 scripts/generate-pt-data.py --check`; run the focused browser regression with `npm run smoke:pt`.


## OpenRouter test deployment

The separate Vercel project is `field-copilot`; it does not replace `lex-field-copilot`. Set `AI_PROVIDER=openrouter`, encrypted server-side `OPENROUTER_API_KEY`, and `OPENROUTER_MODEL=openai/gpt-4o-mini`. Leave `NAMEPLATE_VISION_ENABLED=false` for device-only OCR. Never use a `NEXT_PUBLIC_` secret.

`/api/health` reports provider/model configuration readiness and the deployed Git SHA without making paid requests. Missing selected credentials fail with 503 rather than silently switching to templates. Text calls are bounded, timed out and not automatically retried.

This test deployment is public by explicit owner choice. AI text requests consume OpenRouter credits. Optional Basic auth remains available; public access is not a spending limit. Jobs remain local to the device, with no cloud sync or full offline app shell. Provisional reference tables and company policy approvals remain visible in `HANDOFF.md`.

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
