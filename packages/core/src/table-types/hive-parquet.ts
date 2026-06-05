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
}
