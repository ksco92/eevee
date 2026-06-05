/**
 * Hive (parquet) table type.
 *
 * Hive partitions are *new* columns at write time, distinct from data
 * columns: their identity is the partition name and the validator forbids
 * shadowing an existing data column.
 */

import {
    Violation,
} from '../model';
import {
    TableTypeBase,
} from '../table-type';
import {
    isValidHiveType,
} from '../types';

const SORT_DIRECTIONS: ReadonlySet<string> = new Set([
    'asc',
    'desc',
]);

/** Hive (parquet) table. */
export class HiveParquetTable extends TableTypeBase {
    /**
     * Validate a column type against the Hive type registry.
     *
     * @param type Type string from a column definition.
     * @returns True when the type is a valid Hive type.
     */
    public isValidColumnType(type: string): boolean {
        return isValidHiveType(type);
    }

    /**
     * Hive partition rules.
     *
     * Emits: `NO_DUPLICATE_PARTITIONS` (by partition name),
     * `HIVE_PARTITION_NOT_IN_COLUMNS` (a Hive partition is a new column, so
     * it must not collide with a data column), and `HIVE_PARTITION_TYPE_VALID`.
     *
     * @returns Every partition-related violation.
     */
    public partitionViolations(): Violation[] {
        const violations: Violation[] = [];
        const {
            partitions,
        } = this.definition;

        const seen = new Set<string>();
        partitions.forEach((partition, index) => {
            if (seen.has(partition.name)) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'NO_DUPLICATE_PARTITIONS',
                    field: `partitions[${index}]`,
                    message: `duplicate partition name "${partition.name}"`,
                }));
            }
            seen.add(partition.name);
        });

        partitions.forEach((partition, index) => {
            if (this.hasColumn(partition.name)) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'HIVE_PARTITION_NOT_IN_COLUMNS',
                    field: `partitions[${index}].name`,
                    message: `Hive partition "${partition.name}" must not also be a data column`,
                }));
            }
            if (!isValidHiveType(partition.type)) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'HIVE_PARTITION_TYPE_VALID',
                    field: `partitions[${index}].type`,
                    message: `"${partition.type}" is not a valid Hive partition type`,
                }));
            }
        });

        return violations;
    }

    /**
     * Hive engine-specific rules: bucketing.
     *
     * @returns Every engine-specific violation.
     */
    public engineSpecificViolations(): Violation[] {
        return this.bucketingViolations();
    }

    /**
     * Validate the bucketing spec.
     *
     * Emits `HIVE_BUCKET_NOT_PARTITION_COLUMN`, `HIVE_BUCKET_COLUMN_EXISTS`,
     * `HIVE_BUCKET_NO_DUPLICATE_COLUMNS`, `HIVE_BUCKET_COUNT_POSITIVE`,
     * `HIVE_SORT_COLUMN_EXISTS`, and `HIVE_SORT_DIRECTION_VALID`.
     *
     * @returns Every bucketing-related violation.
     */
    private bucketingViolations(): Violation[] {
        const {
            bucketing,
        } = this.definition;
        if (bucketing === undefined) {
            return [];
        }

        const violations: Violation[] = [];
        const partitionNames = new Set(this.definition.partitions.map((partition) => partition.name));

        for (const duplicate of this.findDuplicates(bucketing.columns)) {
            violations.push(this.violation({
                level: 'error',
                code: 'HIVE_BUCKET_NO_DUPLICATE_COLUMNS',
                field: 'bucketing.columns',
                message: `bucketing lists column "${duplicate}" more than once`,
            }));
        }

        bucketing.columns.forEach((column, index) => {
            if (partitionNames.has(column)) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'HIVE_BUCKET_NOT_PARTITION_COLUMN',
                    field: `bucketing.columns[${index}]`,
                    message: `bucketing column "${column}" must not be a partition column`,
                }));
            } else if (!this.hasColumn(column)) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'HIVE_BUCKET_COLUMN_EXISTS',
                    field: `bucketing.columns[${index}]`,
                    message: `bucketing column "${column}" is not defined in columns`,
                }));
            }
        });

        if (!Number.isInteger(bucketing.bucketCount) || bucketing.bucketCount <= 0) {
            violations.push(this.violation({
                level: 'error',
                code: 'HIVE_BUCKET_COUNT_POSITIVE',
                field: 'bucketing.bucketCount',
                message: `bucketCount "${bucketing.bucketCount}" must be a positive integer`,
            }));
        }

        bucketing.sortedBy.forEach((sort, index) => {
            if (!this.hasColumn(sort.column)) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'HIVE_SORT_COLUMN_EXISTS',
                    field: `bucketing.sortedBy[${index}].column`,
                    message: `sort column "${sort.column}" is not defined in columns`,
                }));
            }
            if (!SORT_DIRECTIONS.has(sort.direction.trim().toLowerCase())) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'HIVE_SORT_DIRECTION_VALID',
                    field: `bucketing.sortedBy[${index}].direction`,
                    message: `sort direction "${sort.direction}" must be "asc" or "desc"`,
                }));
            }
        });

        return violations;
    }
}
