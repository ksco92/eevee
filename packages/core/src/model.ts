/**
 * Core data model for the Flexible Dataset Definition (FDD) standard.
 *
 * These interfaces describe the *pure data* shape of a dataset: columns,
 * partitions, foreign keys, table definitions, and the violations the
 * validator emits. The loaded world (schemas + table instances) and the
 * abstract table base class live in `./world` and `./table-type` so this
 * module stays a leaf with no behavior.
 */

/** Table engine. Each value unlocks engine-specific semantic checks. */
export enum TableType {
    HIVE_PARQUET = 'hive_parquet',
    ICEBERG_PARQUET = 'iceberg_parquet',
    POSTGRES_18 = 'postgres_18',
}

/** Every known `tableType` string, for membership checks. */
export const TABLE_TYPES: readonly string[] = [
    TableType.HIVE_PARQUET,
    TableType.ICEBERG_PARQUET,
    TableType.POSTGRES_18,
];

/** A single data column. */
export interface Column {
    /** Column name (unique within a table). */
    readonly name: string;

    /** Engine-specific type string (e.g. `long`, `varchar(255)`). */
    readonly type: string;

    /** Human description. */
    readonly description: string;

    /**
     * Whether the column may hold null. Optional: when omitted, nullability is
     * unspecified and the nullability cross-checks do not fire. `false` marks a
     * NOT NULL column (Iceberg `required`); `true` marks an explicitly nullable
     * column.
     */
    readonly nullable?: boolean;
}

/**
 * A partition entry. The meaning of `name` and `type` is engine-specific: for
 * Hive, `name` is a new partition column and `type` is a normal type; for
 * Iceberg, `name` is a source data column and `type` is a transform; for
 * Postgres, `name` is an existing key column and `type` is the strategy.
 */
export interface Partition {
    /** Hive: new partition column name. Iceberg / Postgres: existing data/key column name. */
    readonly name: string;

    /** Hive: a normal type. Iceberg: a transform (e.g. `day`, `bucket[16]`). Postgres: a strategy (`range` / `list` / `hash`). */
    readonly type: string;

    /** Human description. */
    readonly description: string;
}

/**
 * A single sort field in an Iceberg table's sort order. `column` is a data
 * column; `transform` is an optional Iceberg transform applied before sorting
 * (defaults to identity); `direction` and `nullOrder` set the ordering.
 */
export interface SortField {
    /** Source data column to sort by. */
    readonly column: string;

    /** Optional Iceberg transform applied before sorting (e.g. `day`, `bucket[16]`). */
    readonly transform?: string;

    /** Sort direction (`asc` or `desc`). */
    readonly direction: string;

    /** Null ordering (`nulls-first` or `nulls-last`). */
    readonly nullOrder: string;
}

/** A single key column within an index, with optional ordering modifiers. */
export interface IndexColumn {
    /** Indexed column name. */
    readonly name: string;

    /** Optional sort order (`asc` or `desc`). */
    readonly sort?: string;

    /** Optional null ordering (`first` or `last`). */
    readonly nulls?: string;
}

/**
 * A secondary index (e.g. Postgres). `columns` are the key columns; `include`
 * are non-key covering columns; `where` is an opaque partial-index predicate.
 */
export interface Index {
    /** Index name (unique within the table). */
    readonly name: string;

    /** Access method (e.g. `btree`, `hash`, `gin`). */
    readonly method: string;

    /** Whether the index enforces uniqueness. */
    readonly unique?: boolean;

    /** Key columns. */
    readonly columns: IndexColumn[];

    /** Non-key covering columns. */
    readonly include: string[];

    /** Optional partial-index predicate (opaque). */
    readonly where?: string;
}

/** A table-level UNIQUE constraint over one or more columns (Postgres). */
export interface UniqueConstraint {
    /** Constraint name (unique within the table). */
    readonly name: string;

    /** Columns the constraint spans. */
    readonly columns: string[];

    /** Whether nulls are treated as not distinct (`NULLS NOT DISTINCT`). */
    readonly nullsNotDistinct?: boolean;
}

/**
 * A CHECK constraint (Postgres). `expression` is an opaque predicate; `columns`
 * is the explicit list of columns it references, which is what gets validated.
 */
export interface CheckConstraint {
    /** Constraint name (unique within the table). */
    readonly name: string;

    /** Opaque boolean predicate. */
    readonly expression: string;

    /** Columns the predicate references. */
    readonly columns: string[];
}

/** A foreign-key reference to a column in another table. */
export interface ForeignKey {
    /** Referenced table in `schema.table` format. */
    readonly sourceTable: string;

    /** Referenced column in the source table. */
    readonly sourceColumn: string;

    /** Local column that holds the reference. */
    readonly localColumn: string;

    /** Whether the local column may be null. */
    readonly allowNulls: boolean;
}

/** Normalized table definition (optional arrays defaulted to empty). */
export interface TableDefinition {
    /** Spec version of the file. */
    readonly specVersion: string;

    /** Human description. */
    readonly description: string;

    /** Engine. May be an unknown string if the file failed structural checks. */
    readonly tableType: string;

    /** Whether this table is the top of the pipeline. */
    readonly isRawData: boolean;

    /**
     * Iceberg table format version (1, 2, or 3). Optional and engine-specific:
     * only the Iceberg engine validates it. Other engines ignore it.
     */
    readonly formatVersion?: number;

    /** Data columns. */
    readonly columns: Column[];

    /** Primary-key column names. */
    readonly primaryKey: string[];

    /** Partition entries (engine-specific semantics). */
    readonly partitions: Partition[];

    /** Iceberg sort order (ordered sort fields). Optional; other engines ignore it. */
    readonly sortOrder: SortField[];

    /** Secondary indexes (Postgres). Optional; other engines ignore them. */
    readonly indexes: Index[];

    /** UNIQUE constraints (Postgres). Optional; other engines ignore them. */
    readonly uniqueConstraints: UniqueConstraint[];

    /** CHECK constraints (Postgres). Optional; other engines ignore them. */
    readonly checkConstraints: CheckConstraint[];

    /**
     * Engine table properties as a string→string map (e.g. Iceberg
     * `write.target-file-size-bytes`, Hive `parquet.compression`). Optional.
     * Only keys with a known, closed legal domain are validated per engine;
     * unknown keys pass through unvalidated.
     */
    readonly tableProperties: Record<string, string>;

    /** Upstream tables in `schema.table` format. */
    readonly dependsOn: string[];

    /** Foreign keys. */
    readonly foreignKeys: ForeignKey[];
}

/** A schema-description file's normalized content. */
export interface SchemaDescription {
    /** Spec version of the file. */
    readonly specVersion: string;

    /** Human description. */
    readonly description: string;
}

/** Severity of a violation. */
export type ViolationLevel = 'error' | 'warning';

/** A single validation finding. */
export interface Violation {
    /** Severity. `error` fails validation; `warning` does not. */
    readonly level: ViolationLevel;

    /** Stable machine-readable rule code (e.g. `PK_COLUMNS_EXIST`). */
    readonly code: string;

    /** Owning schema, if applicable. */
    readonly schema?: string;

    /** Owning table, if applicable. */
    readonly table?: string;

    /** Field path within the file, if applicable. */
    readonly field?: string;

    /** Source file path, if applicable. */
    readonly path?: string;

    /** Human-readable message. */
    readonly message: string;
}

/** The aggregate result of validating a root. */
export interface ValidationResult {
    /** True when there are no `error`-level violations. */
    readonly ok: boolean;

    /** All findings, errors and warnings. */
    readonly violations: Violation[];
}
