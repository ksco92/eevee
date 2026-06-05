/**
 * Postgres 18 table type.
 *
 * Postgres uses declarative partitioning: a table is partitioned by one strategy
 * (`range`, `list`, or `hash`) over one or more existing key columns. Each
 * partition entry names a key column (`name`) and the strategy (`type`); all
 * entries on a table must share one strategy.
 */

import {
    Index,
    Partition,
    Violation,
} from '../model';
import {
    TableTypeBase,
} from '../table-type';
import {
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
     * Postgres engine-specific rules: index validation.
     *
     * @returns Every engine-specific violation.
     */
    public engineSpecificViolations(): Violation[] {
        return this.indexViolations();
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
