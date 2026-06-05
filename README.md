# eevee — Flexible Dataset Definition (FDD)

FDD is a JSON standard for describing datasets (tables) as files in a structured folder layout, so
datasets can be versioned, reviewed, and consumed as first-class citizens in code repositories and
infrastructure-as-code. Relational databases and lakehouses share a lot — primary keys, foreign keys,
partitioning, lineage — even where their engines differ. FDD captures the shared shape once and lets
each engine add its own checks.

The standard itself lives in [`spec/`](spec/README.md). The reference validator and tooling live in
[`packages/core/`](packages/core).

## Two validation layers

- **Layer 1 — structural.** A JSON Schema (`packages/core/src/schema/*.json`). Required fields, types,
  enums. Portable: validate a file natively in any language with its own JSON Schema library.
- **Layer 2 — semantic.** Cross-field and cross-file logic a JSON Schema cannot express — primary-key
  and foreign-key resolution, `dependsOn` ↔ foreign-key consistency, Iceberg transform legality, and an
  acyclic dependency graph. Implemented once in TypeScript and exposed through the `fdd` CLI / library.

v0 supports three engines: `hive_parquet`, `iceberg_parquet`, `postgres_18`.

## Quick start

```bash
cd packages/core
npm install
npm run build
node dist/src/cli.js validate ../../examples
node dist/src/cli.js validate ../../examples --format json
node dist/src/cli.js graph ../../examples --out dag.svg
node dist/src/cli.js er ../../examples --out er.svg
```

The example root in [`examples/`](examples) is a small, valid two-schema dataset (a raw landing zone
and a curated analytics layer spanning all three engines).

## Diagrams

Two commands render the dataset as SVG via Graphviz (compiled to WASM, so no system Graphviz install
is needed):

- `fdd graph <root>` — the **dependency DAG**: one node per table (table names only), clustered by
  schema, with an edge from each upstream table to each downstream table (`dependsOn`).
- `fdd er <root>` — the **entity-relationship diagram**: each table with its columns (primary-key
  columns marked `PK`) and a foreign-key edge to each referenced table.

Both write to stdout, or to a file with `--out <file.svg>`. Output is deterministic, so a committed SVG
diffs cleanly when the dataset changes.

## Development

```bash
cd packages/core
npm run dev      # lint + build + test (with 95% coverage gate)
```

## Spec evolution

The standard and its reference validator grow together: a new engine adds a
`tableType`, which unlocks type-registry entries and semantic rules, which in
turn extend the JSON Schema and the example dataset. The project treats those as
one change, not four.

Because of that coupling, every change carries a documentation check. **Before
opening a PR, re-read [`CLAUDE.md`](CLAUDE.md) and this README and update them if
the change touches anything they describe** — a command, a convention, a rule
code, a field, a `tableType`, or the quick-start. A change whose behavior and
docs have drifted apart is incomplete, and reviewers reject it. The full policy
is in `CLAUDE.md`.

## License

Apache-2.0. See [LICENSE](LICENSE).
