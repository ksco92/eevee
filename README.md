# eevee — Flexible Dataset Definition (FDD)

[![CI](https://img.shields.io/github/actions/workflow/status/ksco92/eevee/ci.yml?branch=main&label=CI)](https://github.com/ksco92/eevee/actions/workflows/ci.yml)
[![coverage](https://codecov.io/gh/ksco92/eevee/branch/main/graph/badge.svg)](https://codecov.io/gh/ksco92/eevee)
[![npm](https://img.shields.io/npm/v/flexdataset.svg)](https://www.npmjs.com/package/flexdataset)
[![types](https://img.shields.io/npm/types/flexdataset.svg)](https://www.npmjs.com/package/flexdataset)
[![downloads](https://img.shields.io/npm/dw/flexdataset.svg)](https://www.npmjs.com/package/flexdataset)
[![last commit](https://img.shields.io/github/last-commit/ksco92/eevee.svg)](https://github.com/ksco92/eevee/commits/main)
[![license](https://img.shields.io/npm/l/flexdataset.svg)](LICENSE)

FDD is a JSON standard for describing datasets (tables) as files in a structured folder layout, so
datasets can be versioned, reviewed, and consumed as first-class citizens in code repositories and
infrastructure-as-code. Relational databases and lakehouses share a lot (primary keys, foreign keys,
partitioning, lineage) even where their engines differ. FDD captures the shared shape once and lets
each engine add its own checks.

The standard itself lives in [`spec/`](spec/README.md). The reference validator and tooling live in
[`packages/core/`](packages/core).

## Two validation layers

- **Layer 1 (structural).** A JSON Schema (`packages/core/src/schema/*.json`). Required fields, types,
  enums. Portable: validate a file natively in any language with its own JSON Schema library.
- **Layer 2 (semantic).** Cross-field and cross-file logic a JSON Schema cannot express: primary-key
  and foreign-key resolution, `dependsOn` ↔ foreign-key consistency, Iceberg transform legality, and an
  acyclic dependency graph. Implemented once in TypeScript and exposed through the `flexdataset` CLI and library.

v0 supports three engines: `hive_parquet`, `iceberg_parquet`, `postgres_18`.

## Install

Released builds:

- **npm:** `npm install -g flexdataset` (the CLI, run with Node). Published continuously from `main`.
- **Standalone binary:** download the build for your platform from
  [Releases](https://github.com/ksco92/eevee/releases); a single file, no Node required. Cut on each `v*` tag.
- **Python:** `pip install flexdataset`, a typed client that drives the CLI; platform wheels bundle the binary.
  See [`packages/python`](packages/python).

To run from source, follow the quick start below.

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
and a curated analytics layer spanning all three engines). For a comprehensive root that exercises
every validated construct (all engines, every Iceberg transform, composite and self-referential keys,
the full type families, cross-schema references), see [`samples/`](samples).

## Diagrams

Two commands render the dataset as SVG via Graphviz (compiled to WASM, so no system Graphviz install
is needed):

- `flexdataset graph <root>`: the **dependency DAG**. One node per table (table names only), clustered by
  schema, with an edge from each upstream table to each downstream table (`dependsOn`).
- `flexdataset er <root>`: the **entity-relationship diagram**. Each table with its columns (primary-key
  columns marked `PK`) and a foreign-key edge to each referenced table.

Both write the SVG to stdout, or to a file with `--out <file.svg>` (in which case a short confirmation
goes to stderr). Output is deterministic, so a committed SVG diffs cleanly when the dataset changes.

Both commands validate the root first (structural + semantic): an error-level violation aborts
rendering, printing the violations to stderr and exiting non-zero, so a diagram is only ever produced
for a valid dataset. Warnings are printed to stderr but do not stop rendering.

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
the change touches anything they describe**: a command, a convention, a rule
code, a field, a `tableType`, or the quick-start. A change whose behavior and
docs have drifted apart is incomplete, and reviewers reject it. The full policy
is in `CLAUDE.md`.

## License

Apache-2.0. See [LICENSE](LICENSE).
