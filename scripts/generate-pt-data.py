#!/usr/bin/env python3
"""Deterministically import saved published rows; no PDF/network/CoolProp runtime.

Usage: python3 scripts/generate-pt-data.py [--check]
Source rows, PDF hashes and extraction notes: scripts/pt-sources/published-rows.json.
"""
import hashlib
import json
import math
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "scripts/pt-sources/published-rows.json"
raw = FIXTURE.read_bytes()
fixtures = json.loads(raw)
fixtures.sort(key=lambda item: ["R-410A", "R-32", "R-454B", "R-22"].index(item["id"]))
tables = []
audit = {"fixtureSha256": hashlib.sha256(raw).hexdigest(), "tables": []}
for fixture in fixtures:
    rows = fixture["rows"]
    assert len(rows) >= 2
    assert all(len(row) == 3 and all(math.isfinite(n) for n in row) for row in rows)
    assert all(a[0] < b[0] for a, b in zip(rows, rows[1:]))
    table = {key: fixture[key] for key in ["id", "safetyClass", "source"]}
    table.update(pressurePsig=[r[0] for r in rows], bubbleF=[r[1] for r in rows], dewF=[r[2] for r in rows])
    if "inverseRows" in fixture:
        for phase, index in [("bubble", 1), ("dew", 2)]:
            extension = [(r[index], r[0]) for r in fixture["inverseRows"] if r[index] > rows[-1][0]]
            assert all(a[0] < b[0] for a, b in zip(extension, extension[1:]))
            table[phase + "PressurePsig"] = table["pressurePsig"] + [p for p, _ in extension]
            table[phase + "F"] += [t for _, t in extension]
    tables.append(table)
    table["source"]["dataSha256"] = hashlib.sha256(json.dumps(table, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
    audit["tables"].append({"id": fixture["id"], "rowCount": len(rows), "bubbleRowCount": len(table["bubbleF"]), "dewRowCount": len(table["dewF"]), "bubbleMaxPsig": table.get("bubblePressurePsig", table["pressurePsig"])[-1], "dewMaxPsig": table.get("dewPressurePsig", table["pressurePsig"])[-1], "dataSha256": table["source"]["dataSha256"], "pressureRangePsig": [rows[0][0], rows[-1][0]], "rowsSha256": hashlib.sha256(json.dumps(rows, separators=(",", ":")).encode()).hexdigest(), "pdfSha256": fixture["source"]["pdfSha256"]})
outputs = {
    ROOT / "app/lib/charge/ptData.generated.ts": "// Imported published chart rows. DO NOT EDIT; run scripts/generate-pt-data.py.\nexport const PT_GENERATED_SOURCE = \"Manufacturer/supplier published PT charts\";\nexport const PT_GENERATED_TABLES = " + json.dumps(tables, ensure_ascii=False, indent=2) + " as const;\n",
    ROOT / "scripts/pt-sources/audit.json": json.dumps(audit, indent=2) + "\n",
}
for path, content in outputs.items():
    if "--check" in sys.argv:
        if not path.exists() or path.read_text() != content:
            raise SystemExit(f"Generated output differs: {path}")
    else:
        path.write_text(content)
print(json.dumps(audit, indent=2))
