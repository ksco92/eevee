/**
 * Abstract base class for a loaded table. One subclass per engine.
 *
 * Holds the normalized table identity and definition, plus the
 * engine-agnostic Layer 2 rules as concrete methods. Engine-specific rules
 * (column-type validity, partition semantics) are abstract — each subclass
 * implements them, which is the lever that lets new engines plug in without
 * editing scattered switches. The cross-file rules are concrete here too;
 * they take the world by an interface so the cycle between this module and
 * `./world` is kept at type-level only.
 */

import {
    ForeignKey,
    TableDefinition,
    Violation,
} from './model';
import type {
    World,
} from './world';

/** Fields required to construct any concrete table subclass. */
export interface TableTypeFields {
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

/** Pre-filled location fields attached to every violation a table emits. */
type LocationFields = Pick<Violation, 'schema' | 'table' | 'path'>;

/**
 * Base class for all engine-specific table types.
 *
 * Subclasses implement `isValidColumnType` (the engine's type registry) and
 * `partitionViolations` (the engine's partition semantics). Everything else
 * — primary-key checks, dupes, raw consistency, depends-on resolution,
 * foreign-key checks — is identical across engines and lives here.
 */
export abstract class TableTypeBase {
    /** Owning schema name. */
    public readonly schema: string;

    /** Table name. */
    public readonly name: string;

    /** `schema.table` identifier. */
    public readonly qualifiedName: string;

    /** Absolute path to the source file. */
    public readonly filePath: string;

    /** Whether the file passed Layer 1 structural validation. */
    public readonly structurallyValid: boolean;

    /** Normalized definition. */
    public readonly definition: TableDefinition;

    /**
     * Construct a table instance from the normalized fields produced by the
     * loader.
     *
     * @param fields The table identity plus its parsed, normalized definition.
     */
    constructor(fields: TableTypeFields) {
        this.schema = fields.schema;
        this.name = fields.name;
        this.qualifiedName = fields.qualifiedName;
        this.filePath = fields.filePath;
        this.structurallyValid = fields.structurallyValid;
        this.definition = fields.definition;
    }

    /// ////////////////////////////////////////////////////////////////////////
    // Helpers shared by intra-table and cross-file rules.

    /**
     * Build a violation pre-filled with this table's location fields.
     *
     * @param partial The fields specific to the rule firing (code, level, message, field).
     * @returns A full `Violation` with `schema`, `table`, and `path` set.
     */
    protected violation(partial: Omit<Violation, 'schema' | 'table' | 'path'>): Violation {
        const location: LocationFields = {
            schema: this.schema,
            table: this.name,
            path: this.filePath,
        };
        return {
            ...partial,
            ...location,
        };
    }

    /**
     * Whether this table declares a data column with the given name.
     *
     * @param name Column name to look up.
     * @returns True when `name` matches any column in `definition.columns`.
     */
    protected hasColumn(name: string): boolean {
        return this.definition.columns.some((column) => column.name === name);
    }

    /**
     * Find names that appear more than once in a list, preserving the order
     * of first duplication.
     *
     * @param names Names to scan.
     * @returns Duplicated names, each listed once.
     */
    protected findDuplicates(names: string[]): string[] {
        const seen = new Set<string>();
        const duplicates = new Set<string>();
        for (const name of names) {
            if (seen.has(name)) {
                duplicates.add(name);
            }
            seen.add(name);
        }
        return [
            ...duplicates,
        ];
    }

    /// ////////////////////////////////////////////////////////////////////////
    // Engine-specific contract.

    /**
     * Whether `type` is a valid column-type string for this engine.
     *
     * @param type Column type string to check.
     * @returns True when the engine accepts the type.
     */
    public abstract isValidColumnType(type: string): boolean;

    /**
     * Engine-specific partition rules: duplicate detection plus the engine's
     * key/column resolution and type / transform / strategy legality.
     *
     * @returns Every partition-related violation this table produces.
     */
    public abstract partitionViolations(): Violation[];

    /**
     * Engine-specific intra-table rules beyond column-type and partition checks
     * (e.g. Iceberg format-version / table properties, Postgres indexes). The
     * base engine has none; subclasses override to add them.
     *
     * @returns Engine-specific intra-table violations. Empty by default.
     */
    public engineSpecificViolations(): Violation[] {
        return [];
    }

    /// ////////////////////////////////////////////////////////////////////////
    // Agnostic intra-table rules.

    /// PK_COLUMNS_EXIST — every primary-key column exists in `columns`.
    private primaryKeyViolations(): Violation[] {
        const violations: Violation[] = [];
        for (const pkColumn of this.definition.primaryKey) {
            if (!this.hasColumn(pkColumn)) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'PK_COLUMNS_EXIST',
                    field: 'primaryKey',
                    message: `primary-key column "${pkColumn}" is not defined in columns`,
                }));
            }
        }
        return violations;
    }

    /// NO_DUPLICATE_COLUMNS — column names are unique within a table.
    private duplicateColumnViolations(): Violation[] {
        const names = this.definition.columns.map((column) => column.name);
        return this.findDuplicates(names).map((duplicate) => this.violation({
            level: 'error',
            code: 'NO_DUPLICATE_COLUMNS',
            field: 'columns',
            message: `duplicate column name "${duplicate}"`,
        }));
    }

    /// COLUMN_TYPE_VALID — every column type is valid for the table's engine.
    private columnTypeViolations(): Violation[] {
        const violations: Violation[] = [];
        this.definition.columns.forEach((column, index) => {
            if (!this.isValidColumnType(column.type)) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'COLUMN_TYPE_VALID',
                    field: `columns[${index}].type`,
                    message: `"${column.type}" is not a valid ${this.definition.tableType} type `
                        + `for column "${column.name}"`,
                }));
            }
        });
        return violations;
    }

    /// RAW_NO_DEPENDS_ON / NONRAW_REQUIRES_DEPENDS_ON.
    private rawConsistencyViolations(): Violation[] {
        const violations: Violation[] = [];
        const {
            isRawData,
            dependsOn,
        } = this.definition;
        if (isRawData && dependsOn.length > 0) {
            violations.push(this.violation({
                level: 'error',
                code: 'RAW_NO_DEPENDS_ON',
                field: 'dependsOn',
                message: 'raw tables (isRawData=true) must not declare dependsOn',
            }));
        }
        if (!isRawData && dependsOn.length === 0) {
            violations.push(this.violation({
                level: 'error',
                code: 'NONRAW_REQUIRES_DEPENDS_ON',
                field: 'dependsOn',
                message: 'non-raw tables (isRawData=false) must declare at least one dependsOn',
            }));
        }
        return violations;
    }

    /// PK_COLUMN_NOT_NULLABLE / FK_NULLABILITY_CONSISTENT — per-column
    /// nullability contradictions against the primary key and foreign keys.
    private nullabilityViolations(): Violation[] {
        const violations: Violation[] = [];

        /// A primary-key column is implicitly NOT NULL, so declaring it nullable
        /// is a contradiction.
        for (const pkColumn of this.definition.primaryKey) {
            const column = this.definition.columns.find((candidate) => candidate.name === pkColumn);
            if (column !== undefined && column.nullable === true) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'PK_COLUMN_NOT_NULLABLE',
                    field: 'primaryKey',
                    message: `primary-key column "${pkColumn}" cannot be nullable (declared nullable: true)`,
                }));
            }
        }

        /// A NOT NULL local column can never be null, so a foreign key that
        /// permits nulls on it is inconsistent.
        this.definition.foreignKeys.forEach((fk, index) => {
            const column = this.definition.columns.find((candidate) => candidate.name === fk.localColumn);
            if (column !== undefined && column.nullable === false && fk.allowNulls) {
                violations.push(this.violation({
                    level: 'warning',
                    code: 'FK_NULLABILITY_CONSISTENT',
                    field: `foreignKeys[${index}].allowNulls`,
                    message: `foreign key allows nulls but local column "${fk.localColumn}" is declared non-nullable`,
                }));
            }
        });

        return violations;
    }

    /**
     * All intra-table violations for this table (engine-agnostic rules plus
     * the engine-specific partition rules).
     *
     * @returns Every intra-table violation this table produces.
     */
    public intraTableViolations(): Violation[] {
        return [
            ...this.primaryKeyViolations(),
            ...this.duplicateColumnViolations(),
            ...this.columnTypeViolations(),
            ...this.partitionViolations(),
            ...this.rawConsistencyViolations(),
            ...this.nullabilityViolations(),
            ...this.engineSpecificViolations(),
        ];
    }

    /// ////////////////////////////////////////////////////////////////////////
    // Cross-file rules.

    /// DEPENDS_ON_RESOLVES — every dependsOn entry resolves to a real table.
    private dependsOnViolations(world: World): Violation[] {
        const violations: Violation[] = [];
        this.definition.dependsOn.forEach((dependency, index) => {
            if (!world.tables.has(dependency)) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'DEPENDS_ON_RESOLVES',
                    field: `dependsOn[${index}]`,
                    message: `dependsOn "${dependency}" does not resolve to a known table`,
                }));
            }
        });
        return violations;
    }

    /// Foreign-key checks for a single FK entry.
    private foreignKeyViolations(world: World, fk: ForeignKey, index: number): Violation[] {
        const violations: Violation[] = [];
        const field = `foreignKeys[${index}]`;

        if (!this.hasColumn(fk.localColumn)) {
            violations.push(this.violation({
                level: 'error',
                code: 'FK_LOCAL_COLUMN_EXISTS',
                field: `${field}.localColumn`,
                message: `local column "${fk.localColumn}" is not defined in columns`,
            }));
        }

        /// A self-referential foreign key (e.g. a `parent_id` pointing at the same
        /// table's key) does not create a pipeline dependency, so it is exempt from
        /// FK_IMPLIES_DEPENDENCY — requiring a self-`dependsOn` would otherwise force
        /// a spurious dependency cycle.
        const isSelfReference = fk.sourceTable === this.qualifiedName;
        if (!isSelfReference && !this.definition.dependsOn.includes(fk.sourceTable)) {
            violations.push(this.violation({
                level: 'error',
                code: 'FK_IMPLIES_DEPENDENCY',
                field: `${field}.sourceTable`,
                message: `foreign key targets "${fk.sourceTable}" but it is not listed in dependsOn`,
            }));
        }

        const target = world.tables.get(fk.sourceTable);
        if (target === undefined) {
            violations.push(this.violation({
                level: 'error',
                code: 'FK_SOURCE_TABLE_RESOLVES',
                field: `${field}.sourceTable`,
                message: `foreign key source table "${fk.sourceTable}" does not resolve to a known table`,
            }));
            return violations;
        }

        /// The target's own structural errors (reported by Layer 1) already explain
        /// why its columns can't be trusted; skip column-level checks to avoid
        /// piling misleading findings on top.
        if (!target.structurallyValid) {
            return violations;
        }

        const targetHasColumn = target.definition.columns.some((column) => column.name === fk.sourceColumn);
        if (!targetHasColumn) {
            violations.push(this.violation({
                level: 'error',
                code: 'FK_SOURCE_COLUMN_EXISTS',
                field: `${field}.sourceColumn`,
                message: `foreign key source column "${fk.sourceColumn}" is not defined in "${fk.sourceTable}"`,
            }));
            return violations;
        }

        if (!target.definition.primaryKey.includes(fk.sourceColumn)) {
            violations.push(this.violation({
                level: 'warning',
                code: 'FK_SOURCE_IS_KEY',
                field: `${field}.sourceColumn`,
                message: `foreign key source column "${fk.sourceColumn}" is not part of the primary key `
                    + `of "${fk.sourceTable}"`,
            }));
        }

        return violations;
    }

    /**
     * All cross-file violations for this table (`dependsOn` resolution plus
     * the full foreign-key suite).
     *
     * @param world The loaded dataset root.
     * @returns Every cross-file violation this table produces.
     */
    public crossFileViolations(world: World): Violation[] {
        const violations: Violation[] = [
            ...this.dependsOnViolations(world),
        ];
        this.definition.foreignKeys.forEach((fk, index) => {
            violations.push(...this.foreignKeyViolations(world, fk, index));
        });
        return violations;
    }
}
