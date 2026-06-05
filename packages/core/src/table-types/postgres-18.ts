/**
 * Postgres 18 table type.
 *
 * Postgres uses declarative partitioning: a table is partitioned by one strategy
 * (`range`, `list`, or `hash`) over one or more existing key columns. Each
 * partition entry names a key column (`name`) and the strategy (`type`); all
 * entries on a table must share one strategy.
 */

import {
    CheckConstraint,
    Index,
    Partition,
    UniqueConstraint,
    Violation,
} from '../model';
import {
    TableTypeBase,
} from '../table-type';
import {
    isPostgresCollatableType,
    isValidPostgresType,
} from '../types';

const STRATEGIES: ReadonlySet<string> = new Set([
    'range',
    'list',
    'hash',
]);

const INDEX_METHODS: ReadonlySet<string> = new Set([
    'btree',
    'hash',
    'gist',
    'spgist',
    'gin',
    'brin',
]);

const INDEX_SORTS: ReadonlySet<string> = new Set([
    'asc',
    'desc',
]);

const INDEX_NULLS: ReadonlySet<string> = new Set([
    'first',
    'last',
]);

const GENERATED_KINDS: ReadonlySet<string> = new Set([
    'stored',
    'virtual',
]);

const IDENTITY_KINDS: ReadonlySet<string> = new Set([
    'always',
    'byDefault',
]);

/// Integer base types an identity column may use.
const INTEGER_TYPES: ReadonlySet<string> = new Set([
    'smallint',
    'int2',
    'integer',
    'int',
    'int4',
    'bigint',
    'int8',
]);

const COMPRESSION_METHODS: ReadonlySet<string> = new Set([
    'pglz',
    'lz4',
]);

const STORAGE_STRATEGIES: ReadonlySet<string> = new Set([
    'plain',
    'external',
    'extended',
    'main',
    'default',
]);

/** Postgres 18 table. */
export class Postgres18Table extends TableTypeBase {
    /**
     * Validate a column type against the Postgres type registry.
     *
     * @param type Type string from a column definition.
     * @returns True when the type is a valid Postgres 18 type.
     */
    public isValidColumnType(type: string): boolean {
        return isValidPostgresType(type);
    }

    /**
     * Postgres partition rules.
     *
     * Emits: `NO_DUPLICATE_PARTITIONS` (a key column listed twice),
     * `POSTGRES_PARTITION_COLUMN_EXISTS` (the key column must be a data column),
     * `POSTGRES_PARTITION_STRATEGY_VALID` (the strategy must be range / list /
     * hash), and `POSTGRES_PARTITION_SINGLE_STRATEGY` (a table partitions by one
     * strategy only).
     *
     * @returns Every partition-related violation.
     */
    public partitionViolations(): Violation[] {
        const violations: Violation[] = [];
        const {
            partitions,
        } = this.definition;

        for (const duplicate of this.findDuplicates(partitions.map((partition) => partition.name))) {
            violations.push(this.violation({
                level: 'error',
                code: 'NO_DUPLICATE_PARTITIONS',
                field: 'partitions',
                message: `duplicate partition key column "${duplicate}"`,
            }));
        }

        const strategies = new Set<string>();
        partitions.forEach((partition: Partition, index: number) => {
            if (!this.hasColumn(partition.name)) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'POSTGRES_PARTITION_COLUMN_EXISTS',
                    field: `partitions[${index}].name`,
                    message: `partition key column "${partition.name}" is not defined in columns`,
                }));
            } else if (!this.definition.primaryKey.includes(partition.name)) {
                /// Postgres requires the primary key to include every partition-key
                /// column, so a partition column outside the primary key is invalid.
                violations.push(this.violation({
                    level: 'error',
                    code: 'POSTGRES_PARTITION_KEY_IN_PK',
                    field: `partitions[${index}].name`,
                    message: `partition key column "${partition.name}" must be part of the primary key`,
                }));
            }

            const strategy = partition.type.trim().toLowerCase();
            if (STRATEGIES.has(strategy)) {
                strategies.add(strategy);
            } else {
                violations.push(this.violation({
                    level: 'error',
                    code: 'POSTGRES_PARTITION_STRATEGY_VALID',
                    field: `partitions[${index}].type`,
                    message: `"${partition.type}" is not a valid Postgres partition strategy (range, list, hash)`,
                }));
            }
        });

        if (strategies.size > 1) {
            violations.push(this.violation({
                level: 'error',
                code: 'POSTGRES_PARTITION_SINGLE_STRATEGY',
                field: 'partitions',
                message: `a partitioned table uses one strategy; found ${[
                    ...strategies,
                ].sort().join(', ')}`,
            }));
        }

        return violations;
    }

    /**
     * Postgres engine-specific rules: indexes, unique constraints, and check
     * constraints.
     *
     * @returns Every engine-specific violation.
     */
    public engineSpecificViolations(): Violation[] {
        return [
            ...this.indexViolations(),
            ...this.uniqueConstraintViolations(),
            ...this.checkConstraintViolations(),
            ...this.generatedColumnViolations(),
            ...this.columnAttributeViolations(),
        ];
    }

    /**
     * Validate identity columns, defaults, and the mutual exclusivity between a
     * column being generated, an identity column, and having a default.
     *
     * Emits `POSTGRES_IDENTITY_VALID`, `POSTGRES_IDENTITY_TYPE_INTEGER`, and
     * `POSTGRES_COLUMN_GENERATION_EXCLUSIVE`.
     *
     * @returns Every column-attribute violation.
     */
    private columnAttributeViolations(): Violation[] {
        const violations: Violation[] = [];

        this.definition.columns.forEach((column, index) => {
            const field = `columns[${index}]`;

            if (column.identity !== undefined) {
                if (!IDENTITY_KINDS.has(column.identity)) {
                    violations.push(this.violation({
                        level: 'error',
                        code: 'POSTGRES_IDENTITY_VALID',
                        field: `${field}.identity`,
                        message: `identity "${column.identity}" must be "always" or "byDefault"`,
                    }));
                }
                if (!INTEGER_TYPES.has(column.type.trim().toLowerCase())) {
                    violations.push(this.violation({
                        level: 'error',
                        code: 'POSTGRES_IDENTITY_TYPE_INTEGER',
                        field: `${field}.identity`,
                        message: `identity column "${column.name}" must be an integer type, not "${column.type}"`,
                    }));
                }
            }

            const attributes = [
                column.generated,
                column.identity,
                column.default,
            ].filter((attribute) => attribute !== undefined);
            if (attributes.length > 1) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'POSTGRES_COLUMN_GENERATION_EXCLUSIVE',
                    field,
                    message: `column "${column.name}" may have only one of generated, identity, or default`,
                }));
            }

            if (column.collation !== undefined && !isPostgresCollatableType(column.type)) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'POSTGRES_COLLATION_ON_TEXT_TYPE',
                    field: `${field}.collation`,
                    message: `collation is only legal on a text type, not "${column.type}"`,
                }));
            }

            if (column.compression !== undefined && !COMPRESSION_METHODS.has(column.compression.trim().toLowerCase())) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'POSTGRES_COMPRESSION_VALID',
                    field: `${field}.compression`,
                    message: `compression "${column.compression}" must be "pglz" or "lz4"`,
                }));
            }

            if (column.storage !== undefined && !STORAGE_STRATEGIES.has(column.storage.trim().toLowerCase())) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'POSTGRES_STORAGE_VALID',
                    field: `${field}.storage`,
                    message: `storage "${column.storage}" must be one of: ${[
                        ...STORAGE_STRATEGIES,
                    ].join(', ')}`,
                }));
            }
        });

        return violations;
    }

    /**
     * Validate generated columns.
     *
     * Emits `POSTGRES_GENERATED_KIND_VALID`,
     * `POSTGRES_GENERATED_EXPRESSION_COLUMN_EXISTS`,
     * `POSTGRES_GENERATED_NO_SELF_REFERENCE`,
     * `POSTGRES_GENERATED_NO_GENERATED_REFERENCE`,
     * `POSTGRES_GENERATED_NOT_IN_PARTITION_KEY`, and
     * `POSTGRES_VIRTUAL_GENERATED_NOT_IN_PK`.
     *
     * @returns Every generated-column violation.
     */
    private generatedColumnViolations(): Violation[] {
        const violations: Violation[] = [];

        const generatedNames = new Set(
            this.definition.columns
                .filter((column) => column.generated !== undefined)
                .map((column) => column.name),
        );
        const partitionNames = new Set(this.definition.partitions.map((partition) => partition.name));

        this.definition.columns.forEach((column, index) => {
            if (column.generated === undefined) {
                return;
            }
            const field = `columns[${index}]`;

            if (!GENERATED_KINDS.has(column.generated)) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'POSTGRES_GENERATED_KIND_VALID',
                    field: `${field}.generated`,
                    message: `generated kind "${column.generated}" must be "stored" or "virtual"`,
                }));
            }

            (column.expressionColumns ?? []).forEach((reference, referenceIndex) => {
                const referenceField = `${field}.expressionColumns[${referenceIndex}]`;
                if (reference === column.name) {
                    violations.push(this.violation({
                        level: 'error',
                        code: 'POSTGRES_GENERATED_NO_SELF_REFERENCE',
                        field: referenceField,
                        message: `generated column "${column.name}" cannot reference itself`,
                    }));
                } else if (!this.hasColumn(reference)) {
                    violations.push(this.violation({
                        level: 'error',
                        code: 'POSTGRES_GENERATED_EXPRESSION_COLUMN_EXISTS',
                        field: referenceField,
                        message: `generated column "${column.name}" references "${reference}", `
                            + 'which is not defined in columns',
                    }));
                } else if (generatedNames.has(reference)) {
                    violations.push(this.violation({
                        level: 'error',
                        code: 'POSTGRES_GENERATED_NO_GENERATED_REFERENCE',
                        field: referenceField,
                        message: `generated column "${column.name}" cannot reference `
                            + `generated column "${reference}"`,
                    }));
                }
            });

            if (partitionNames.has(column.name)) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'POSTGRES_GENERATED_NOT_IN_PARTITION_KEY',
                    field: `${field}.generated`,
                    message: `generated column "${column.name}" cannot be a partition key`,
                }));
            }

            if (column.generated === 'virtual' && this.definition.primaryKey.includes(column.name)) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'POSTGRES_VIRTUAL_GENERATED_NOT_IN_PK',
                    field: `${field}.generated`,
                    message: `virtual generated column "${column.name}" cannot be part of the primary key`,
                }));
            }
        });

        return violations;
    }

    /**
     * Validate UNIQUE constraints.
     *
     * Emits `POSTGRES_UNIQUE_NAME_UNIQUE`, `POSTGRES_UNIQUE_COLUMN_EXISTS`, and
     * `POSTGRES_UNIQUE_NO_DUPLICATE_COLUMNS`.
     *
     * @returns Every unique-constraint violation.
     */
    private uniqueConstraintViolations(): Violation[] {
        const violations: Violation[] = [];
        const {
            uniqueConstraints,
        } = this.definition;

        for (const duplicate of this.findDuplicates(uniqueConstraints.map((constraint) => constraint.name))) {
            violations.push(this.violation({
                level: 'error',
                code: 'POSTGRES_UNIQUE_NAME_UNIQUE',
                field: 'uniqueConstraints',
                message: `duplicate unique-constraint name "${duplicate}"`,
            }));
        }

        uniqueConstraints.forEach((constraint: UniqueConstraint, position: number) => {
            const field = `uniqueConstraints[${position}]`;
            for (const duplicate of this.findDuplicates(constraint.columns)) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'POSTGRES_UNIQUE_NO_DUPLICATE_COLUMNS',
                    field: `${field}.columns`,
                    message: `unique constraint "${constraint.name}" lists column "${duplicate}" more than once`,
                }));
            }
            constraint.columns.forEach((column, columnIndex) => {
                if (!this.hasColumn(column)) {
                    violations.push(this.violation({
                        level: 'error',
                        code: 'POSTGRES_UNIQUE_COLUMN_EXISTS',
                        field: `${field}.columns[${columnIndex}]`,
                        message: `unique-constraint column "${column}" is not defined in columns`,
                    }));
                }
            });

            violations.push(...this.uniqueConstraintKeyViolations(constraint, field));
        });

        return violations;
    }

    /// Relationship rules between a unique constraint and the primary key /
    /// partition key: redundancy with the PK, and the Postgres rule that a
    /// unique constraint on a partitioned table must include every partition key.
    private uniqueConstraintKeyViolations(constraint: UniqueConstraint, field: string): Violation[] {
        const violations: Violation[] = [];

        const primaryKey = this.definition.primaryKey;
        const columnSet = new Set(constraint.columns);
        if (primaryKey.length > 0 && primaryKey.length === columnSet.size
            && primaryKey.every((column) => columnSet.has(column))) {
            violations.push(this.violation({
                level: 'warning',
                code: 'POSTGRES_UNIQUE_REDUNDANT_WITH_PK',
                field: `${field}.columns`,
                message: `unique constraint "${constraint.name}" duplicates the primary key`,
            }));
        }

        const partitionKeys = this.definition.partitions
            .map((partition) => partition.name)
            .filter((name) => this.hasColumn(name));
        const missing = partitionKeys.filter((name) => !constraint.columns.includes(name));
        if (missing.length > 0) {
            violations.push(this.violation({
                level: 'error',
                code: 'POSTGRES_UNIQUE_INCLUDES_PARTITION_KEYS',
                field: `${field}.columns`,
                message: `unique constraint "${constraint.name}" on a partitioned table must include `
                    + `every partition key column; missing: ${missing.join(', ')}`,
            }));
        }

        return violations;
    }

    /**
     * Validate CHECK constraints. Only the explicit referenced-column list is
     * checked; the predicate itself stays opaque.
     *
     * Emits `POSTGRES_CHECK_NAME_UNIQUE` and `POSTGRES_CHECK_COLUMN_EXISTS`.
     *
     * @returns Every check-constraint violation.
     */
    private checkConstraintViolations(): Violation[] {
        const violations: Violation[] = [];
        const {
            checkConstraints,
        } = this.definition;

        for (const duplicate of this.findDuplicates(checkConstraints.map((constraint) => constraint.name))) {
            violations.push(this.violation({
                level: 'error',
                code: 'POSTGRES_CHECK_NAME_UNIQUE',
                field: 'checkConstraints',
                message: `duplicate check-constraint name "${duplicate}"`,
            }));
        }

        checkConstraints.forEach((constraint: CheckConstraint, position: number) => {
            const field = `checkConstraints[${position}]`;
            constraint.columns.forEach((column, columnIndex) => {
                if (!this.hasColumn(column)) {
                    violations.push(this.violation({
                        level: 'error',
                        code: 'POSTGRES_CHECK_COLUMN_EXISTS',
                        field: `${field}.columns[${columnIndex}]`,
                        message: `check-constraint column "${column}" is not defined in columns`,
                    }));
                }
            });
        });

        return violations;
    }

    /**
     * Validate secondary indexes.
     *
     * Emits `POSTGRES_INDEX_NAME_UNIQUE`, `POSTGRES_INDEX_METHOD_VALID`,
     * `POSTGRES_INDEX_COLUMN_EXISTS`, `POSTGRES_INDEX_NO_DUPLICATE_COLUMNS`,
     * `POSTGRES_INDEX_UNIQUE_BTREE_ONLY`, `POSTGRES_INDEX_SORT_VALID`, and
     * `POSTGRES_INDEX_NULLS_VALID`.
     *
     * @returns Every index-related violation.
     */
    private indexViolations(): Violation[] {
        const violations: Violation[] = [];
        const {
            indexes,
        } = this.definition;

        for (const duplicate of this.findDuplicates(indexes.map((index) => index.name))) {
            violations.push(this.violation({
                level: 'error',
                code: 'POSTGRES_INDEX_NAME_UNIQUE',
                field: 'indexes',
                message: `duplicate index name "${duplicate}"`,
            }));
        }

        indexes.forEach((index, position) => {
            violations.push(...this.singleIndexViolations(index, position));
        });

        return violations;
    }

    /// Checks for one index entry.
    private singleIndexViolations(index: Index, position: number): Violation[] {
        const violations: Violation[] = [];
        const field = `indexes[${position}]`;

        if (!INDEX_METHODS.has(index.method)) {
            violations.push(this.violation({
                level: 'error',
                code: 'POSTGRES_INDEX_METHOD_VALID',
                field: `${field}.method`,
                message: `index method "${index.method}" must be one of: ${[
                    ...INDEX_METHODS,
                ].join(', ')}`,
            }));
        }

        if (index.unique === true && index.method !== 'btree') {
            violations.push(this.violation({
                level: 'error',
                code: 'POSTGRES_INDEX_UNIQUE_BTREE_ONLY',
                field: `${field}.unique`,
                message: `a unique index must use the btree method, not "${index.method}"`,
            }));
        }

        const keyNames = index.columns.map((column) => column.name);
        for (const duplicate of this.findDuplicates(keyNames)) {
            violations.push(this.violation({
                level: 'error',
                code: 'POSTGRES_INDEX_NO_DUPLICATE_COLUMNS',
                field: `${field}.columns`,
                message: `index "${index.name}" lists key column "${duplicate}" more than once`,
            }));
        }

        for (const duplicate of this.findDuplicates(index.include)) {
            violations.push(this.violation({
                level: 'error',
                code: 'POSTGRES_INDEX_NO_DUPLICATE_COLUMNS',
                field: `${field}.include`,
                message: `index "${index.name}" lists include column "${duplicate}" more than once`,
            }));
        }

        for (const included of index.include) {
            if (keyNames.includes(included)) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'POSTGRES_INDEX_NO_DUPLICATE_COLUMNS',
                    field: `${field}.include`,
                    message: `index "${index.name}" include column "${included}" is also a key column`,
                }));
            }
        }

        index.columns.forEach((column, columnIndex) => {
            if (!this.hasColumn(column.name)) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'POSTGRES_INDEX_COLUMN_EXISTS',
                    field: `${field}.columns[${columnIndex}].name`,
                    message: `index key column "${column.name}" is not defined in columns`,
                }));
            }
            if (column.sort !== undefined && !INDEX_SORTS.has(column.sort)) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'POSTGRES_INDEX_SORT_VALID',
                    field: `${field}.columns[${columnIndex}].sort`,
                    message: `index sort "${column.sort}" must be "asc" or "desc"`,
                }));
            }
            if (column.nulls !== undefined && !INDEX_NULLS.has(column.nulls)) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'POSTGRES_INDEX_NULLS_VALID',
                    field: `${field}.columns[${columnIndex}].nulls`,
                    message: `index nulls "${column.nulls}" must be "first" or "last"`,
                }));
            }
        });

        index.include.forEach((included, includeIndex) => {
            if (!this.hasColumn(included)) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'POSTGRES_INDEX_COLUMN_EXISTS',
                    field: `${field}.include[${includeIndex}]`,
                    message: `index include column "${included}" is not defined in columns`,
                }));
            }
        });

        return violations;
    }
}
