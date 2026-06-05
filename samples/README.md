# samples

A comprehensive, **valid** FDD dataset root that exercises every construct the validator checks.
Unlike [`examples/`](../examples) (a minimal happy-path root), this one is the feature showcase. It
validates cleanly — `ok: true` — with a single intentional `FK_SOURCE_IS_KEY` **warning** (warnings do
not fail validation) to demonstrate that rule.

```bash
cd packages/core && npm run build
node dist/src/cli.js validate ../../samples --format json
node dist/src/cli.js graph ../../samples --out dag.svg
node dist/src/cli.js er ../../samples --out er.svg
```

## What each table showcases

| File | Engine | Showcases |
|---|---|---|
| `raw/web_events.json` | `hive_parquet` | Hive types incl. nested `array` / `map` / `struct` / `uniontype`, `decimal(p,s)`, `varchar(n)`, `char(n)`; a Hive partition (a new partition column); raw table (no `dependsOn`). |
| `raw/app_events.json` | `iceberg_parquet` | Iceberg types incl. `decimal(p,s)`, `fixed[L]`, `uuid`, `timestamptz`; **all eight partition transforms** (`identity`, `year`, `month`, `day`, `hour`, `void`, `bucket[N]`, `truncate[W]`), including two transforms on the same source column. |
| `raw/org_chart.json` | `postgres_18` | A **self-referential foreign key** (`manager_id` → its own `emp_id`); per-column `nullable` flags (`false` on the key, `true` on the nullable manager link); a Postgres type sampler. |
| `analytics/customers.json` | `postgres_18` | A broad Postgres type sampler (exact, parameterized, array `T[]`, multiword like `timestamp with time zone`); Postgres declarative `range` partitioning; cross-schema `dependsOn` + FK to a primary key (no warning, `allowNulls: false`). |
| `analytics/sessions.json` | `iceberg_parquet` | Iceberg partitions; a non-raw table; a non-PK column (`session_token`) used as a warning FK target. |
| `analytics/order_lines.json` | `hive_parquet` | A **composite primary key**; multiple cross-schema `dependsOn`; an FK to a PK and an FK to a **non-PK** (the `FK_SOURCE_IS_KEY` warning), with `allowNulls` both ways; a Hive partition on a non-raw table. |

Every file also carries `$schema` and `specVersion`. Postgres partitions name an existing key column
with a `range` / `list` / `hash` strategy. Cross-schema references (`dependsOn` and foreign keys
spanning `raw` and `analytics`) appear
throughout.
