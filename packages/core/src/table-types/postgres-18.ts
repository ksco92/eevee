/**
 * Postgres 18 table type.
 *
 * Postgres uses declarative partitioning: a table is partitioned by one strategy
 * (`range`, `list`, or `hash`) over one or more existing key columns. Each
 * partition entry names a key column (`name`) and the strategy (`type`); all
 * entries on a table must share one strategy.
 */

import {
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
}
