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
| `formatVersion` | no | Iceberg only: the table format version (`1`, `2`, or `3`). Other engines ignore it. |
| `columns` | yes | Non-empty; each has `name`, `type`, `description`, an optional `nullable`, and optional Postgres column attributes (`generated`/`expression`/`expressionColumns`, `identity`, `default`, `collation`, `compression`, `storage`). `type` validated per engine. |
| `primaryKey` | yes | Non-empty list of column names; each must exist in `columns`. |
| `partitions` | no | Engine-specific semantics (see below). |
| `sortOrder` | no | Iceberg only: ordered sort fields (`column`, optional `transform`, `direction`, `nullOrder`). Other engines ignore it. |
| `bucketing` | no | Hive only: `CLUSTERED BY … INTO N BUCKETS` (`columns`, `bucketCount`, optional `sortedBy`). Other engines ignore it. |
| `indexes` | no | Postgres only: secondary indexes (`name`, `method`, optional `unique`, `columns`, `include`, `where`). Other engines ignore them. |
| `uniqueConstraints` | no | Postgres only: table-level UNIQUE constraints (`name`, `columns`, optional `nullsNotDistinct`). Other engines ignore them. |
| `checkConstraints` | no | Postgres only: CHECK constraints (`name`, opaque `expression`, referenced `columns`). Other engines ignore them. |
| `tableProperties` | no | String→string map of engine settings. Only keys with a closed legal domain are validated per engine (see below); unknown keys pass through. |
| `dependsOn` | conditionally | Required & non-empty when `isRawData` is `false`. Entries are `schema.table`. |
| `foreignKeys` | no | Each: `sourceTable` (`schema.table`), `sourceColumn`, `localColumn`, `allowNulls`. |

### Column nullability

Each column may carry an optional `nullable` boolean. It is engine-agnostic: `false` marks a NOT NULL
column (the Iceberg `required` flag), `true` marks an explicitly nullable column. When omitted,
nullability is unspecified and the cross-checks below do not fire.

- **`PK_COLUMN_NOT_NULLABLE`** (error) — a primary-key column declared `nullable: true` is a
  contradiction; primary-key columns are implicitly NOT NULL.
- **`FK_NULLABILITY_CONSISTENT`** (warning) — a foreign key with `allowNulls: true` whose local column
  is declared `nullable: false` is inconsistent; a NOT NULL column can never be null.

### Format version (Iceberg)

An Iceberg table may declare a `formatVersion` of `1`, `2`, or `3`
(**`ICEBERG_FORMAT_VERSION_VALID`**, error, when out of range). It is optional and engine-specific;
non-Iceberg engines ignore the field.

### Sort order (Iceberg)

An Iceberg table may declare a `sortOrder`: an ordered list of sort fields, each with a `column`
(an existing data column), an optional `transform` (an Iceberg transform applied before sorting,
defaulting to identity), a `direction` (`asc` or `desc`), and a `nullOrder` (`nulls-first` or
`nulls-last`). Checks:

- **`ICEBERG_SORT_COLUMN_EXISTS`** (error) — the sort column must exist in `columns`.
- **`ICEBERG_SORT_DIRECTION_VALID`** (error) — `direction` must be `asc` or `desc`.
- **`ICEBERG_SORT_NULL_ORDER_VALID`** (error) — `nullOrder` must be `nulls-first` or `nulls-last`.
- **`ICEBERG_SORT_TRANSFORM_VALID`** (error) — a present `transform` must be a valid Iceberg transform.
- **`ICEBERG_SORT_TRANSFORM_TYPE_LEGAL`** (error) — the transform must be legal on the column's type.
- **`NO_DUPLICATE_SORT_FIELDS`** (error) — the (column, transform) pair must be unique; an omitted
  transform and an explicit `identity` are the same field.

The field is engine-specific; non-Iceberg engines ignore it.

### Indexes (Postgres)

A `postgres_18` table may declare `indexes`: secondary indexes, each with a `name`, an access
`method`, optional `unique`, a non-empty `columns` list (each a key column with optional `sort` and
`nulls`), optional non-key `include` columns, and an opaque partial-index `where`. Checks:

- **`POSTGRES_INDEX_NAME_UNIQUE`** (error) — index names are unique within the table.
- **`POSTGRES_INDEX_METHOD_VALID`** (error) — `method` is one of
  `btree`/`hash`/`gist`/`spgist`/`gin`/`brin`.
- **`POSTGRES_INDEX_COLUMN_EXISTS`** (error) — every key and `include` column exists in `columns`.
- **`POSTGRES_INDEX_NO_DUPLICATE_COLUMNS`** (error) — no key column or `include` column is repeated,
  and `include` columns are disjoint from key columns.
- **`POSTGRES_INDEX_UNIQUE_BTREE_ONLY`** (error) — a `unique` index must use the `btree` method.
- **`POSTGRES_INDEX_SORT_VALID`** (error) — a key column's `sort` is `asc` or `desc`.
- **`POSTGRES_INDEX_NULLS_VALID`** (error) — a key column's `nulls` is `first` or `last`.

The field is engine-specific; non-Postgres engines ignore it.

### Unique and check constraints (Postgres)

A `postgres_18` table may declare `uniqueConstraints` (each a `name` plus a non-empty `columns` list
and optional `nullsNotDistinct`) and `checkConstraints` (each a `name`, an opaque `expression`, and the
explicit `columns` the predicate references). Checks:

- **`POSTGRES_UNIQUE_NAME_UNIQUE`** / **`POSTGRES_CHECK_NAME_UNIQUE`** (error) — constraint names are
  unique within their kind. (Postgres uses a single per-table constraint namespace; FDD treats the two
  kinds independently, so give a unique and a check distinct names if you intend to round-trip to
  Postgres.)
- **`POSTGRES_UNIQUE_COLUMN_EXISTS`** / **`POSTGRES_CHECK_COLUMN_EXISTS`** (error) — every referenced
  column exists in `columns`.
- **`POSTGRES_UNIQUE_NO_DUPLICATE_COLUMNS`** (error) — a unique constraint lists no column twice.
- **`POSTGRES_UNIQUE_REDUNDANT_WITH_PK`** (warning) — a unique constraint whose column set equals the
  `primaryKey` is redundant.
- **`POSTGRES_UNIQUE_INCLUDES_PARTITION_KEYS`** (error) — on a partitioned table, a unique constraint
  must include every partition-key column (Postgres requires it).

The check `expression` itself stays opaque; only its declared (non-empty) `columns` are resolved. Both
fields are engine-specific; non-Postgres engines ignore them.

### Table properties

`tableProperties` is an optional string→string map of engine settings. Only keys with a known, closed
legal domain are validated; unknown keys pass through untouched, so engine-specific tuning is never
blocked. Values are strings (matching how engines store them).

For `iceberg_parquet` the validated keys are:

- **Enums** (**`ICEBERG_PROPERTY_ENUM_VALID`**, error) — `write.format.default`
  (`parquet`/`avro`/`orc`), `write.parquet.compression-codec` (`zstd`/`gzip`/`snappy`/`lz4`/`none`),
  `write.avro.compression-codec` (`gzip`/`zstd`/`snappy`/`uncompressed`), `write.orc.compression-codec`
  (`zstd`/`lz4`/`lzo`/`zlib`/`snappy`/`none`), `write.distribution-mode` (`none`/`hash`/`range`),
  `write.metadata.compression-codec` (`none`/`gzip`).
- **Positive integers** (**`ICEBERG_PROPERTY_POSITIVE_INT`**, error) — `write.target-file-size-bytes`
  (compaction target), `history.expire.max-snapshot-age-ms`, `history.expire.min-snapshots-to-keep`,
  `history.expire.max-ref-age-ms` (snapshot retention), `write.metadata.previous-versions-max`.
- **Bounded integer** (**`ICEBERG_PROPERTY_INT_RANGE`**, error) — `write.parquet.compression-level`
  (1–22).

For `hive_parquet` the validated keys are (values compared case-insensitively):

- **Enum** (**`HIVE_PROPERTY_ENUM_VALID`**, error) — `parquet.compression`
  (`uncompressed`/`snappy`/`gzip`/`lzo`/`zstd`/`brotli`/`lz4_raw`), `transactional` (`true`/`false`),
  `transactional_properties` (`default`/`insert_only`).
- **ACID storage** (**`HIVE_FULL_ACID_REQUIRES_ORC`**, error) — full ACID
  (`transactional=true` without `transactional_properties=insert_only`) requires ORC storage, so a
  `hive_parquet` table may only use insert-only ACID.

### Bucketing (Hive)

A `hive_parquet` table may declare `bucketing` (`CLUSTERED BY … INTO N BUCKETS [SORTED BY …]`): a
non-empty `columns` list of bucket-key columns, a `bucketCount`, and an optional `sortedBy` list of
intra-bucket sort columns (each a `column` and a `direction`). Checks:

- **`HIVE_BUCKET_NOT_PARTITION_COLUMN`** (error) — a bucket column is not a partition column.
- **`HIVE_BUCKET_COLUMN_EXISTS`** (error) — each non-partition bucket column exists in `columns`.
- **`HIVE_BUCKET_NO_DUPLICATE_COLUMNS`** (error) — no bucket column is repeated.
- **`HIVE_BUCKET_COUNT_POSITIVE`** (error) — `bucketCount` is a positive integer.
- **`HIVE_SORT_COLUMN_EXISTS`** (error) — each `sortedBy` column exists in `columns`.
- **`HIVE_SORT_DIRECTION_VALID`** (error) — each `sortedBy` `direction` is `asc` or `desc`
  (case-insensitive).

`SORTED BY` requires `CLUSTERED BY`, which the nesting enforces (`sortedBy` lives inside `bucketing`).
The field is engine-specific; non-Hive engines ignore it.

### Generated columns (Postgres)

A `postgres_18` column may be a generated column: set `generated` to `stored` or `virtual`, an opaque
`expression`, and the `expressionColumns` it references. Checks:

- **`POSTGRES_GENERATED_KIND_VALID`** (error) — `generated` is `stored` or `virtual`.
- **`POSTGRES_GENERATED_EXPRESSION_COLUMN_EXISTS`** (error) — each referenced column exists.
- **`POSTGRES_GENERATED_NO_SELF_REFERENCE`** (error) — the column does not reference itself.
- **`POSTGRES_GENERATED_NO_GENERATED_REFERENCE`** (error) — it does not reference another generated
  column.
- **`POSTGRES_GENERATED_NOT_IN_PARTITION_KEY`** (error) — a generated column is not a partition key.
- **`POSTGRES_VIRTUAL_GENERATED_NOT_IN_PK`** (error) — a `virtual` generated column is not part of the
  primary key.

The `expression` stays opaque; only the declared `expressionColumns` are resolved. The fields are
engine-specific; non-Postgres engines ignore them.

A Postgres column may also be an **identity column** (`identity`: `always` or `byDefault`) or carry an
opaque **`default`**:

- **`POSTGRES_IDENTITY_VALID`** (error) — `identity` is `always` or `byDefault`.
- **`POSTGRES_IDENTITY_TYPE_INTEGER`** (error) — an identity column's type is an integer type
  (`smallint`/`integer`/`bigint`).
- **`POSTGRES_COLUMN_GENERATION_EXCLUSIVE`** (error) — a column has at most one of `generated`,
  `identity`, or `default` (Postgres makes the three mutually exclusive).

A Postgres column may also carry an opaque `collation` name and per-column TOAST `compression` /
`storage`:

- **`POSTGRES_COLLATION_ON_TEXT_TYPE`** (error) — `collation` is only legal on a text type
  (`text`/`varchar`/`char`/…). The collation name itself is environment-specific and stays opaque.
- **`POSTGRES_COMPRESSION_VALID`** (error) — `compression` is `pglz` or `lz4`.
- **`POSTGRES_STORAGE_VALID`** (error) — `storage` is one of
  `plain`/`external`/`extended`/`main`/`default`.

(The further Postgres rule that `compression`/`external` storage applies only to variable-width
TOAST-able types is out of scope for v0 — the value-domain checks above are the high-signal part.)

### Partitions per engine

- **`hive_parquet`** — each partition is a **new** partition column: `name` must NOT be a data column,
  `type` is a normal Hive type (no transforms).
- **`iceberg_parquet`** — each partition derives from a data column: `name` is the **source column**
  (must exist in `columns`), `type` is an Iceberg **transform**
  (`identity`, `year`, `month`, `day`, `hour`, `void`, `bucket[N]`, `truncate[W]`). The transform must
  be legal on the source column's type (e.g. `hour` needs a timestamp). Multiple partitions may share
  the same source column with different transforms (e.g. `year(ts)` and `month(ts)`); the
  (source column, transform) pair must be unique. Type and transform names are case-insensitive.
- **`postgres_18`** — declarative partitioning: each partition entry names an existing key column
  (`name`) and a strategy (`type`: `range`, `list`, or `hash`, case-insensitive). A table partitions by
  one strategy over one or more key columns, so all entries must share the same strategy. Every
  partition-key column must also be part of the `primaryKey` (**`POSTGRES_PARTITION_KEY_IN_PK`**, error),
  as Postgres requires. (Expression keys and sub-partitioning are out of scope.)

## Validation layers

- **Layer 1 — structural** (`packages/core/src/schema/*.json`): JSON Schema. Any language can validate
  a file natively against it.
- **Layer 2 — semantic**: cross-field and cross-file checks the JSON Schema cannot express
  (PK/FK resolution, `dependsOn` ↔ FK consistency, transform legality, acyclic dependency graph). Run
  with the `flexdataset` CLI / `flexdataset` library.

Cross-schema references (in `dependsOn` and foreign keys) are allowed.

## Known limitations (v0)

- **Nested Iceberg types** (`list`, `map`, `struct`) are not yet accepted as column types; primitives
  plus `decimal(p,s)` and `fixed[L]` are. Hive nested types (`array`, `map`, `struct`, `uniontype`)
  are supported.
- A schema folder is **flat**: nested subdirectories under a schema are ignored.
- If a `<schema>.json` file contains a table definition (a table sharing the schema's name), it is read
  as the schema description and fails structural validation rather than producing a name-collision
  message.
