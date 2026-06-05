/**
 * Core data model for the Flexible Dataset Definition (FDD) standard.
 *
 * These interfaces describe the *loaded* shape of a dataset root: schemas,
 * tables, and the violations the validator emits. Raw on-disk JSON is parsed
 * and normalized into these types by the loader before any semantic rule runs.
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
}

/**
 * A partition entry. The meaning of `type` is engine-specific: for Hive it is a
 * normal type on a new partition column; for Iceberg it is a transform applied
 * to the data column named by `name`.
 */
export interface Partition {
    /** Hive: new partition column name. Iceberg: source (data) column name. */
    readonly name: string;

    /** Hive: a normal type. Iceberg: a transform (e.g. `day`, `bucket[16]`). */
    readonly type: string;

    /** Human description. */
    readonly description: string;
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

    /** Data columns. */
    readonly columns: Column[];

    /** Primary-key column names. */
    readonly primaryKey: string[];

    /** Partition entries (engine-specific semantics). */
    readonly partitions: Partition[];

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

/** A table loaded from disk, with its identity and location. */
export interface LoadedTable {
    /** Owning schema name (the folder name). */
    readonly schema: string;

    /** Table name (the file name without `.json`). */
    readonly name: string;

    /** `schema.table` identifier. */
    readonly qualifiedName: string;

    /** Absolute path to the source file. */
    readonly filePath: string;

    /** Whether the file passed Layer 1 structural validation. */
    readonly structurallyValid: boolean;

    /** Normalized definition. */
    readonly definition: TableDefinition;
}

/** A schema loaded from disk. */
export interface LoadedSchema {
    /** Schema name (the folder name). */
    readonly name: string;

    /** Absolute path to the schema folder. */
    readonly dirPath: string;

    /** Description from `<schema>.json`, or null if that file is missing. */
    readonly description: SchemaDescription | null;

    /** Tables in this schema. */
    readonly tables: LoadedTable[];
}

/** The whole loaded dataset root. */
export interface World {
    /** Absolute path to the root. */
    readonly rootDir: string;

    /** Schemas keyed by name. */
    readonly schemas: Map<string, LoadedSchema>;

    /** Tables keyed by `schema.table`. */
    readonly tables: Map<string, LoadedTable>;
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
