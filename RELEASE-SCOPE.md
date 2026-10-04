# Field Copilot new-project release scope

Source: Bogie666/field-copilot, independent of Bogie666/lex-field-copilot.
User authorizes completing unfinished flows, OpenRouter integration, commit/push and separate Vercel project. User explicitly selected PUBLIC test site after paid-key exposure warning.

Release work:
- Device nameplate photo OCR, manual review, no inferred age/serial decoding. Paid vision remains off.
- Photo markup and replacement with persistence/thumbnail refresh.
- Per-job/system unsaved measurement draft persistence; explicit finding save remains separate.
- Stale findings after confirmed equipment changes, excluded from AI until reconfirmed.
- Safe OpenRouter configuration, honest provider failure, bounded inputs and no automatic retries.
- Notes edits protected from delayed tidy response; immediate dispatch rather than 900ms loss window.
- Correct accent text contrast; PNG install/apple icons.
- Tests, browser smoke, independent review, actual live text generation and production SHA verification.

Not invented/approved by coding work:
- Provisional CoolProp pressure-temperature tables remain labeled provisional. Manufacturer charts govern actual charging.
- Company CO threshold not set without approved procedure and measurement context. No inference that an unclassified CO value means safe.
- Fixed-orifice formula and house screening tolerances remain screening guidance, not manufacturer specifications.
- DFW climate presets explicitly limited to supported locations/custom input.
- No new cloud backend, multi-device sync, ST data ingest or full offline app-shell capability implied. Local-device storage model remains explicit.

Deployment:
New Vercel project field-copilot prj_h6681S0xltTeRgkGkEcKZHPdWEzl. Git linked main. AI_PROVIDER=openrouter, OPENROUTER_MODEL=openai/gpt-4o-mini, credentials encrypted server-side; no NEXT_PUBLIC keys. Auth false and SSO off by explicit user selection. NAMEPLATE_VISION_ENABLED=false. Existing deployment untouched.

Baseline:163 tests; typecheck/lint/build/browser smoke passed. Existing npm audit5 high findings all dev ESLint/micromatch/braces chain; installed/latest braces3.0.3 has unpatched advisory. Do not force downgrade Next lint stack merely to suppress audit.
