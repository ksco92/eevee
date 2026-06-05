/**
 * Postgres 18 table type.
 *
 * Postgres partitioning is deferred to a later FDD version, so any partition
 * entry is an error.
 */

import {
    Violation,
} from '../model';
import {
    TableTypeBase,
} from '../table-type';
import {
    isValidPostgresType,
} from '../types';

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
     * Postgres has no partitions in v0; emit `PARTITIONS_ALLOWED_FOR_TYPE`
     * once when any partition entry is present.
     *
     * @returns The single partition violation when partitions are declared, otherwise empty.
     */
    public partitionViolations(): Violation[] {
        if (this.definition.partitions.length === 0) {
            return [];
        }
        return [
            this.violation({
                level: 'error',
                code: 'PARTITIONS_ALLOWED_FOR_TYPE',
                field: 'partitions',
                message: 'partitions are not supported for postgres_18 in v0',
            }),
        ];
    }
}
