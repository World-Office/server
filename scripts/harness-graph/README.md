# Harness Graph — OnlyOffice-parity traceability

The traceability backbone for testing WorldOffice against the OnlyOffice
reference. A property graph links **what OnlyOffice does** → **what we
implement** → **what we test**, so "what's uncovered?" and "what must re-run?"
are queries, not archaeology.

## Components

| File | Role |
|---|---|
| `features.yaml` | **Source of truth.** The feature register: OnlyOffice-parity features with `parity` (full/partial/missing) and `fidelity` (capture layer L0–L4). IDs are stable forever. |
| `seed.py` | Compiles `features.yaml` + repo inventory (`data-cmd` in `index.html`, `runCommand("…")` in `editor.js`, pytest tests in `e2e/`) into `graph.json`. |
| `graph.json` | Committed projection. Drift-gated in CI — never edit by hand. |

## Workflow

1. **Claim a feature**: add its ID to the test module docstring
   (`feature register: F-010 F-011` — the seeder regexes `F-\d{3}` anywhere in
   the file). The seeder then emits `(Test)-[:COVERS]->(Feature)`.
2. **Implement a feature**: list the `data-cmd` under `commands:`; the seeder
   verifies it exists in the editor sources (unknown commands fail the seed).
3. **Deliberately differ from OnlyOffice**: add a `divergence:` entry with a
   justification (the reference is buggy) — an uncovered feature with a
   divergence is *done*, not *gap*.
4. **CI drift gate**:
   ```sh
   python3 scripts/harness-graph/seed.py --check   # exit 1 = graph.json stale
   ```

## Status

```sh
python3 scripts/harness-graph/seed.py --report
```

## Loading into Neo4j (optional query engine)

```sh
python3 seed.py --cypher | cypher-shell -a neo4j://<host> -u neo4j
```

Killer queries:

```cypher
-- Parity roadmap: uncovered features by area (drives taskfleet work)
MATCH (f:Feature) WHERE NOT EXISTS { MATCH (:Test)-[:COVERS]->(f) }
RETURN f.area, f.parity, collect(f.id) AS gaps ORDER BY size(gaps) DESC;

-- Test selection: what must run if command X changes
MATCH (c:Command {id: $cmd})<-[:IMPLEMENTED_BY]-(f:Feature)<-[:COVERS]-(t:Test)
RETURN DISTINCT t.id;

-- Orphan tests (no feature claim) — the ledger enforces itself
MATCH (t:Test) WHERE NOT EXISTS { MATCH (t)-[:COVERS]->(:Feature) } RETURN t.id;
```

## Relation to the rendering-oracle harness

`core/crates/wo-conformance/` records **OnlyOffice behavior** as goldens
(`NormalizedRender` box trees via PDF export — `wo-conformance capture`).
Capture layers L0–L4 in `features.yaml.fidelity` state which layer a parity
claim must be proven at; the graph ties those claims to tests and code.
Recapture-as-PR applies to both: `graph.json` here, ground-truth JSON there.
