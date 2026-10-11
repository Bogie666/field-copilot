# Correction-pass verification

Reviewed against main `9f9eebc7992e6029fc0f63dfaa2b454ec0c61608` on 11 October 2026. This branch has not been merged or deployed to production. The existing Vercel integration automatically built a pull-request preview.

## Final local checks

Final code check at `39cf4b3` passed:

- `npm run verify`: TypeScript, ESLint, **712 tests across 52 files**, and the default Turbopack production build.
- `python3 scripts/generate-pt-data.py --check`: checked-in fixture and generated tables agree; technical approval is still pending.
- `node --check` for every browser smoke script and `git diff --check`.

Only documentation changed after that code check. Targeted cloud-browser checks passed; full scripted browser suites remain blocked as detailed below.

## Automated regression coverage

| Review item | Change and regression coverage |
| --- | --- |
| F1: leading decimal false green | Whole-quantity static/amp parsing; `.5` and `0.5` tested from plate seed through assessed and composed saved finding. Ambiguous, negative, exponent and wrong-unit values cannot become a positive scalar reference. |
| F2: indoor/outdoor collisions | Separate component IDs across equipment, findings, drafts, notes and photos. Legacy evidence stays explicitly unassigned; duplicate legacy findings/drafts get separate preserved identities. |
| F3: route context | Validated system/component query IDs survive reload/history without relying on transient selection. Missing, removed or mismatched IDs cannot silently select another unit. |
| F4: concurrent writes | IndexedDB and memory compare-and-swap revisions, deletion tombstones, revision-checked deletes, serialized local sessions, three-way preservation of later edits, recoverable conflicts and explicit discard/reset. |
| F5: memory fallback | The same write path retains session edits; storage startup failures disclose unavailable saved jobs and session-only limits. |
| F6: save/delete feedback | Findings, nameplate, accepted notes and photo operations wait for commit. Errors stay visible; session-only acknowledgments are distinct. Delete failures do not remove the row from the displayed list. |
| F7: orphan evidence | Metadata/blob transactions and explicit ownership cleanup. Historical photo evidence stays immutable until owning system/job deletion; deletion includes original-note history. |
| F8: AI note replacement | Original/preview comparison, accept/discard, retained original history, late response/cancel/unmount/dictation/overflow and failed-save retry tests. |
| F9: source identity | Safe ordinal system/component/finding labels remain attached to diagnosis/readings/actions; private labels/photos/history are excluded from AI source data. |
| F10: stale overview | Stale findings do not count as complete; needs-review state appears in tiles and links while safety stays prominent. |
| F11: ordinary photos | Optional evidence picker for ordinary system/component/home findings; cross-scope attachments rejected and safety requirements retained. |
| F12: rounded duct threshold | Raw velocity used for classification and saved readings; all configured threshold neighbors, nonfinite derivation and UI rounding disclosure tested. |

Additional coverage: printed manufacture-date age precision/boundaries/manual overrides, predefined equipment type choices with conservative OCR suggestions, deterministic office/customer reports, reviewed customer copy, escaped self-contained HTML photo reports with missing-image warnings, and malformed optional-extension migration.

Independent review exercised migration collisions, delayed saves, recovery/export behavior, deletion/reentry, editor resets, note provenance, and HTML data escaping. Reproduced defects were corrected with targeted regressions.

## Browser verification boundary

The baseline smoke, regression entry point and new `smoke:integrity` suite were attempted with `/usr/bin/chromium`. All fail before opening the application: Chromium's process singleton cannot create its socket (`Operation not permitted`). The regression command stops at its first browser launch, so later constituent suites were not executed. This is an execution-environment blocker, not a passing browser result or a demonstrated application failure.

Browser scripts were updated and syntax-checked. The full scripted suites, real mobile rendering, camera/OCR downloads, complete photo attachment/markup and full history/navigation matrix still require a supported-browser run before release. Pure-domain and component callback tests do not replace that gate.

### Targeted pull-request preview checks

The cloud browser exercised the [automatically generated PR preview](https://field-copilot-git-fix-field-reco-5bb845-ryans-projects-5a781ef5.vercel.app/) using synthetic browser-local jobs. These targeted checks passed:

- Separate indoor/outdoor nameplates, electrical readings, action and verification survive save/reload with visible system/component context.
- Manufacture-date age labels preserve approximate precision, manual overrides survive date changes, and returning to calculated age plus predefined equipment type persists.
- A `.5` nameplate reference seeds `0.5`; `.3 + .3` measures `0.60`, evaluates to `120%`, and shows Needs attention.
- A changed nameplate marks the overview Needs review and excludes stale findings from customer-note selection.
- Ordinary electrical findings expose an image/camera evidence picker. Actual file selection and upload were not exercised.
- Deterministic closeout works without AI and includes pending reconfirmation; copy/download require review.
- Two tabs retain the losing tab's local edit, protect the committed record, disable further conflicted editing, and restore canonical values after explicit discard/confirmation.
- Captured browser warnings/errors were extension metadata messages, with no app-origin warning or error observed.

This is targeted UI smoke, not a pass of the full automated suites. GitHub's Vercel status associated the preview build with the exact PR commit; direct `/api/health` navigation was browser-blocked, so the browser could not independently verify the running SHA. No paid AI requests, real customer records or production writes were used. The confusing initial nameplate reload footer found in this pass was corrected with a regression test; its final preview recheck is recorded in the PR.

Run on a supported machine:

```sh
npm run verify
python3 scripts/generate-pt-data.py --check
FIELD_COPILOT_AUTH_ENABLED=false npm run start -- -p 3000
# Separate terminal; set CHROMIUM_PATH to an installed Chromium executable.
COPILOT_URL=http://127.0.0.1:3000 npm run smoke
COPILOT_URL=http://127.0.0.1:3000 npm run smoke:regressions
COPILOT_URL=http://127.0.0.1:3000 npm run smoke:integrity
```

Technical reference/safety approvals and durable public AI spend controls remain separate release gates in [release-gates.md](release-gates.md). Offline/PWA support, backup/restore and cloud sync are deferred.
