# Published pressure-temperature sources

The app imports saved chart rows, not equation-of-state estimates. Technical approval is **pending**: `PT_DATA_APPROVED=false`. Manufacturer charging targets, company tolerances and approval are not supplied by this import.

## Active sources and supported ranges

| Refrigerant | Published source | Rows / knots per phase | Pressure range (psig) |
| --- | --- | --- | --- |
| R-410A | Honeywell, Genetron AZ-20 / R-22 Pressure–Temperature Chart, 2011-05-25 | 191 | 10.8–611.9 |
| R-22 | Same Honeywell chart | 191 | 0.6–381.7 |
| R-32 | iGas USA, R32 Pressure-Temperature Chart; date not stated | 39 | 11.0–628.8 |
| R-454B | Chemours, Opteon XL41 Pressure-Temperature Data (Eng), revision 7/23 | 403 direct rows; 453 bubble / 451 dew combined knots | Bubble -2–728.9; dew -2–723.1 |

Exact source URLs, document dates, units, PDF SHA-256 hashes and extraction notes are stored per refrigerant in `scripts/pt-sources/published-rows.json` and shipped with the generated tables. All temperatures are °F; pressures are psig as published, with no altitude correction applied. Do not infer a publisher-specific sea-level assumption where the chart does not state one.

## Extraction and interpolation

- Honeywell pages 1–2: numeric triples `(°F, R410A psig, R22 psig)` extracted from saved PDF text, sorted by temperature. Each of the 191 published integer-Fahrenheit rows (-40 through 150°F) is retained as its actual irregular pressure knot. The chart has **one saturation column per refrigerant**, reused for both phases; it does not publish independently measured bubble/dew curves.
- iGas: the saved PDF's text has no numeric table. All 39 rows (-40 to 150°F in 5°F increments) were visually transcribed from `igas-r32.png`; values were inspected directly, not inferred from text/OCR. The published vapor-pressure curve also supplies bubble saturation for pure R32.
- Chemours pages 1–2: all 403 pressure→temperature rows (-2 through 400 psig, 1 psig increments) retained **exactly**, including independent saturated-liquid/bubble and saturated-vapor/dew columns.
- Chemours page 3: all 211 temperature→pressure triples (-40 to 170°F) are saved as `inverseRows`. Above 400 psig, independently append only each phase's own published pressures, mapping that phase's pressure back to its published temperature. Bubble extension starts at 400.9 psig / 121°F; dew extension at 400.1 psig / 123°F. The direct dew endpoint at 400 psig also rounds to 123°F; this one equal-temperature transition is expected. The direct chart wins throughout overlap. No liquid/vapor cross-connection or union-range restriction is used. Each phase rejects beyond its own endpoint. Assessment's existing 700 psig input ceiling is unchanged.
- Honeywell R454B is not an active data source; no chart publishers are mixed for R454B.
- Runtime uses true linear interpolation between neighboring **pressure** knots, dew for superheat, bubble for subcooling. No uniform pressure resampling, pressure rounding or extrapolation. Legacy uniform synthetic test fixtures remain supported and validated.

## Reproduction and audit

Run from repository root:

```sh
python3 scripts/generate-pt-data.py
python3 scripts/generate-pt-data.py --check
```

Only Python's standard library is needed. No runtime PDF access, network calls or CoolProp dependency. Generated outputs are `app/lib/charge/ptData.generated.ts` and `scripts/pt-sources/audit.json`. Generation validates row shapes, finite values and strictly increasing pressure axes. Audit records raw-fixture, row, source-PDF and per-table data hashes, row counts and phase maxima. Each per-table data hash covers metadata and generated phase axes/temperatures (before adding the hash itself); it changes when relevant data or provenance changes.

Source changes require independent review against the original PDFs, regeneration, tests and technical approval; they must not be relabeled approved merely because a chart was imported.

## Saved findings

Selected publisher, title, URL, date, units, phase ranges and data revision appear in the tool and the finding reference supplied to customer-note composition. Charge finding inputs/hash now include selected PT provenance and its data hash. Historical form-only/CoolProp findings are not silently rewritten: reopening offers **Update finding**; the tech must explicitly save to replace historical readings and references. Form restoration ignores the extra provenance key, and unsaved drafts remain measurement forms.
