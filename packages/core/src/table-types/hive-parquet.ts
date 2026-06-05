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

/// Hive file formats accepted by `STORED AS`.
const STORAGE_FORMATS: ReadonlySet<string> = new Set([
    'sequencefile',
    'textfile',
    'rcfile',
    'orc',
    'parquet',
    'avro',
    'jsonfile',
]);

/// Hive table-property keys whose value must come from a closed set (compared
/// case-insensitively, matching HiveQL).
const ENUM_PROPERTIES: Record<string, readonly string[]> = {
    'parquet.compression': [
        'uncompressed',
        'snappy',
        'gzip',
        'lzo',
        'zstd',
        'brotli',
        'lz4_raw',
    ],
    transactional: [
        'true',
        'false',
    ],
    transactional_properties: [
        'default',
        'insert_only',
    ],
};

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
     * Hive engine-specific rules: bucketing and table properties.
     *
     * @returns Every engine-specific violation.
     */
    public engineSpecificViolations(): Violation[] {
        return [
            ...this.bucketingViolations(),
            ...this.tablePropertyViolations(),
            ...this.skewedByViolations(),
            ...this.storageViolations(),
        ];
    }

    /**
     * Validate the skew spec.
     *
     * Emits `HIVE_SKEW_COLUMN_EXISTS`, `HIVE_SKEW_NO_DUPLICATE_COLUMNS`, and
     * `HIVE_SKEW_VALUE_ARITY` (each `on` tuple has one value per skewed column).
     *
     * @returns Every skew-related violation.
     */
    private skewedByViolations(): Violation[] {
        const {
            skewedBy,
        } = this.definition;
        if (skewedBy === undefined) {
            return [];
        }

        const violations: Violation[] = [];

        for (const duplicate of this.findDuplicates(skewedBy.columns)) {
            violations.push(this.violation({
                level: 'error',
                code: 'HIVE_SKEW_NO_DUPLICATE_COLUMNS',
                field: 'skewedBy.columns',
                message: `skew lists column "${duplicate}" more than once`,
            }));
        }

        skewedBy.columns.forEach((column, index) => {
            if (!this.hasColumn(column)) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'HIVE_SKEW_COLUMN_EXISTS',
                    field: `skewedBy.columns[${index}]`,
                    message: `skew column "${column}" is not defined in columns`,
                }));
            }
        });

        skewedBy.on.forEach((tuple, index) => {
            if (tuple.length !== skewedBy.columns.length) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'HIVE_SKEW_VALUE_ARITY',
                    field: `skewedBy.on[${index}]`,
                    message: `skew value tuple has ${tuple.length} value(s) but there are `
                        + `${skewedBy.columns.length} skew column(s)`,
                }));
            }
        });

        return violations;
    }

    /**
     * Validate the storage format.
     *
     * Emits `HIVE_STORAGE_FORMAT_VALID` (a known Hive format) and
     * `HIVE_STORAGE_FORMAT_PARQUET` (a `hive_parquet` table must use Parquet).
     *
     * @returns Every storage-related violation.
     */
    private storageViolations(): Violation[] {
        const {
            storage,
        } = this.definition;
        if (storage === undefined || storage.storedAs === undefined) {
            return [];
        }

        const format = storage.storedAs.trim().toLowerCase();
        if (!STORAGE_FORMATS.has(format)) {
            return [
                this.violation({
                    level: 'error',
                    code: 'HIVE_STORAGE_FORMAT_VALID',
                    field: 'storage.storedAs',
                    message: `storedAs "${storage.storedAs}" must be one of: ${[
                        ...STORAGE_FORMATS,
                    ].join(', ')}`,
                }),
            ];
        }
        if (format !== 'parquet') {
            return [
                this.violation({
                    level: 'error',
                    code: 'HIVE_STORAGE_FORMAT_PARQUET',
                    field: 'storage.storedAs',
                    message: `a hive_parquet table must use Parquet storage, not "${storage.storedAs}"`,
                }),
            ];
        }
        return [];
    }

    /**
     * Validate the closed-domain Hive table properties and the
     * Parquet-vs-ORC ACID rule. Keys outside the known set pass through.
     *
     * Emits `HIVE_PROPERTY_ENUM_VALID` and `HIVE_FULL_ACID_REQUIRES_ORC`.
     *
     * @returns Every table-property violation.
     */
    private tablePropertyViolations(): Violation[] {
        const violations: Violation[] = [];
        const properties = this.definition.tableProperties;

        for (const [
            key,
            value,
        ] of Object.entries(properties)) {
            const allowed = ENUM_PROPERTIES[key];
            if (allowed !== undefined && !allowed.includes(value.trim().toLowerCase())) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'HIVE_PROPERTY_ENUM_VALID',
                    field: `tableProperties["${key}"]`,
                    message: `table property "${key}" value "${value}" must be one of: ${allowed.join(', ')}`,
                }));
            }
        }

        /// Full ACID (transactional without insert_only) needs ORC storage, so it
        /// is invalid on a Parquet table; only insert-only ACID is legal here.
        const transactional = properties.transactional?.trim().toLowerCase();
        if (transactional === 'true') {
            const insertOnly = properties.transactional_properties?.trim().toLowerCase() === 'insert_only';
            if (!insertOnly) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'HIVE_FULL_ACID_REQUIRES_ORC',
                    field: 'tableProperties["transactional"]',
                    message: 'full ACID requires ORC storage; a hive_parquet table may only use '
                        + 'insert-only ACID (transactional_properties="insert_only")',
                }));
            }
        }

        return violations;
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
