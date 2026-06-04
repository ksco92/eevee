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
```

The example root in [`examples/`](examples) is a small, valid two-schema dataset (a raw landing zone
and a curated analytics layer spanning all three engines).

## Development

```bash
cd packages/core
npm run dev      # lint + build + test (with 95% coverage gate)
```

## Spec evolution

The standard and its reference validator are meant to grow together: a new engine
adds a `tableType`, which unlocks new type-registry entries and new semantic
rules, which in turn extend the JSON Schema and the example dataset. The project
treats those as one change, not four.

Tooling — including AI-assisted contributions — may *propose* changes to the spec
itself: a new rule plus its fixtures, a type added to a registry, a corrected
example, a schema tightening. Such proposals are encouraged, but they land the
same way every other change does, and only with maintainer approval:

- one PR that moves the rule, its fixtures, the JSON Schema, and the docs together,
- green CI (lint, tests at the coverage gate, and self-validation against
  `examples/`),
- both reviews described in [`CLAUDE.md`](CLAUDE.md).

Nothing rewrites `main` on its own. A proposal that cannot keep the example
dataset valid, or that drops coverage, does not merge.

## License

Apache-2.0. See [LICENSE](LICENSE).
