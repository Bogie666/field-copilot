# Field release gates

This web-app correction pass does not approve an HVAC procedure, merge a release, or change the public deployment's access/provider settings.

## Technical references and safety

Before wider field use, a named technical owner must approve and version:

- The published pressure-temperature data and supported refrigerants. `PT_DATA_APPROVED` stays false until that decision is recorded.
- Equipment-specific charging targets, methods, operating conditions and tolerances. A published refrigerant curve is not a manufacturer charging procedure.
- CO measurement location/basis, threshold, escalation wording and company procedure. An unclassified reading must not imply safe.
- House screening tolerances and the fixed-orifice target method.
- The current mandatory safety-photo rule, including any future unsafe/unavailable-photo exception. This change retains the existing requirement.

For an exact-model reference pilot, first choose a small, representative equipment set and obtain legitimate manufacturer sources. Each reference must record manufacturer, exact model applicability, document title, official source URL, page/section, document revision/date, access date, and technician confirmation. A target also needs units, measurement basis, operating mode and prerequisites. Do not infer missing values, decode manufacture dates from serial numbers without an approved source, or label a generic reference as model-specific. No manuals or reference targets were fabricated in this pass.

## Public AI spending controls

The existing owner-selected public configuration can consume paid provider credits. Request-size bounds and timeouts are not rate limits or global spend caps. No provider credentials, account quotas, authentication settings, or network settings are changed here.

Before expanding public use, the deployment owner must select a durable enforcement service, monthly/daily budget, access policy and alert destination. Implementation should:

1. Apply shared per-user/session and conservative per-network request limits before any paid request. Do not trust arbitrary client-forwarded identity headers.
2. Reserve a worst-case request cost atomically against a global budget, then reconcile actual usage. Limit requests across all text/image endpoints and concurrent instances; a process-local counter cannot provide this guarantee.
3. Use a bounded idempotency key, request timeout and no automatic paid retries. Treat unknown provider outcomes conservatively until reconciled.
4. Fail closed when the durable limiter/budget service is unavailable, while keeping calculators, saved findings and deterministic closeout usable.
5. Alert on thresholds, rejected requests and spend anomalies using minimum metadata. Do not store raw technician notes, job labels, photos or credentials in limiter logs.
6. Test concurrent reservations, boundary resets, denied requests, unavailable quota storage, timeouts and provider usage reconciliation without live paid calls.

Adding that service or changing provider/account controls needs a separate configuration decision. An in-memory throttle alone must not be presented as protection against distributed spending.

## Web scope and recovery

Jobs remain browser-local. Session-only storage is explicitly labeled; closing that session can lose data. A text/HTML closeout is a reviewed service record, not a restorable backup. The private HTML office report embeds available images and lists any missing files explicitly. A complete portability/restore workflow, cloud sync, service-management integration, offline/PWA shell and offline OCR asset management remain deferred.

Acceptance requires the final aggregate lint/typecheck/tests/build and a supported-browser run of paired components, multiple systems, reload/back/forward and invalid links; concurrent tabs and conflict recovery; storage failure/retry; photos and system deletion; note preview/accept/discard; stale evidence; and deterministic office/customer closeout. Keep a reliable separate service record until the field pilot passes. Any lost or cross-associated evidence blocks wider rollout.
