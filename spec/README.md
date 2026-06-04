# Flexible Dataset Definition (FDD) — v0

FDD describes datasets (tables) as JSON files in a structured folder layout, so datasets can be
versioned, reviewed, and consumed as first-class citizens in code repos and infrastructure-as-code.

A `tableType` selects the engine; engine-specific checks follow from it. v0 supports three:
`hive_parquet`, `iceberg_parquet`, `postgres_18`.

## Folder structure

```
<root>/                         # config-driven root path
├── <schema>/
│   ├── <schema>.json           # schema-description file (same name as the folder)
│   ├── customers.json          # table "customers"
│   └── orders.json             # table "orders"
└── <other_schema>/
    └── ...
```

- Each directory directly under the root is a **schema**. Directories whose names start with `.`
  (e.g. `.git`) are ignored.
- Each `<table>.json` is a **table definition**; the file name (without `.json`) is the table name.
- Exactly one **schema-description file** per schema folder, named identically to the folder.
- A table may not share its schema's name (that file name is reserved for the schema description).
- Schema and table names must be lowercase `snake_case` (matching `^[a-z0-9_]+$`) so they can be
  referenced from `dependsOn` and foreign keys.

## Schema-description file (`<schema>.json`)

```json
{
    "$schema": "https://raw.githubusercontent.com/ksco92/eevee/main/packages/core/src/schema/schema.schema.json",
    "specVersion": "0",
    "description": "Customer-facing sales data."
}
```

## Table-definition file (`<table>.json`)

Mandatory: `specVersion`, `description`, `tableType`, `isRawData`, `columns`, `primaryKey`.

```json
{
    "$schema": "https://raw.githubusercontent.com/ksco92/eevee/main/packages/core/src/schema/table.schema.json",
    "specVersion": "0",
    "description": "One row per customer.",
    "tableType": "iceberg_parquet",
    "isRawData": false,
    "columns": [
        { "name": "customer_id", "type": "long", "description": "Surrogate key." },
        { "name": "email", "type": "string", "description": "Contact email." },
        { "name": "created_ts", "type": "timestamp", "description": "Row creation time." }
    ],
    "primaryKey": ["customer_id"],
    "partitions": [
        { "name": "created_ts", "type": "day", "description": "Daily partition." }
    ],
    "dependsOn": ["raw.customers_raw"],
    "foreignKeys": [
        {
            "sourceTable": "raw.customers_raw",
            "sourceColumn": "id",
            "localColumn": "customer_id",
            "allowNulls": false
        }
    ]
}
```

### Fields

| Field | Required | Notes |
|---|---|---|
| `specVersion` | yes | `"0"` for this version. |
| `description` | yes | Non-empty. |
| `tableType` | yes | `hive_parquet` \| `iceberg_parquet` \| `postgres_18`. |
| `isRawData` | yes | `true` marks the top of the pipeline. |
| `columns` | yes | Non-empty; each has `name`, `type`, `description`. `type` validated per engine. |
| `primaryKey` | yes | Non-empty list of column names; each must exist in `columns`. |
| `partitions` | no | Hive/Iceberg only (see below). |
| `dependsOn` | conditionally | Required & non-empty when `isRawData` is `false`. Entries are `schema.table`. |
| `foreignKeys` | no | Each: `sourceTable` (`schema.table`), `sourceColumn`, `localColumn`, `allowNulls`. |

### Partitions per engine

- **`hive_parquet`** — each partition is a **new** partition column: `name` must NOT be a data column,
  `type` is a normal Hive type (no transforms).
- **`iceberg_parquet`** — each partition derives from a data column: `name` is the **source column**
  (must exist in `columns`), `type` is an Iceberg **transform**
  (`identity`, `year`, `month`, `day`, `hour`, `void`, `bucket[N]`, `truncate[W]`). The transform must
  be legal on the source column's type (e.g. `hour` needs a timestamp). Multiple partitions may share
  the same source column with different transforms (e.g. `year(ts)` and `month(ts)`); the
  (source column, transform) pair must be unique. Type and transform names are case-insensitive.
- **`postgres_18`** — partitioning is **deferred to v0.1**; `partitions` is rejected in v0.

## Validation layers

- **Layer 1 — structural** (`packages/core/src/schema/*.json`): JSON Schema. Any language can validate
  a file natively against it.
- **Layer 2 — semantic**: cross-field and cross-file checks the JSON Schema cannot express
  (PK/FK resolution, `dependsOn` ↔ FK consistency, transform legality, acyclic dependency graph). Run
  with the `fdd` CLI / `fdd` library.

Cross-schema references (in `dependsOn` and foreign keys) are allowed.

## Known limitations (v0)

- **Postgres partitioning** is not yet modeled; `partitions` is rejected for `postgres_18`. Planned
  for v0.1.
- **Nested Iceberg types** (`list`, `map`, `struct`) are not yet accepted as column types; primitives
  plus `decimal(p,s)` and `fixed[L]` are. Hive nested types (`array`, `map`, `struct`, `uniontype`)
  are supported.
- A schema folder is **flat**: nested subdirectories under a schema are ignored.
- If a `<schema>.json` file contains a table definition (a table sharing the schema's name), it is read
  as the schema description and fails structural validation rather than producing a name-collision
  message.
