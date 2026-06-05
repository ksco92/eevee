/**
 * Iceberg (parquet) table type.
 *
 * Iceberg partitions are transforms applied to a data column, so duplicate
 * detection keys on the (source column, normalized transform) pair — `year(ts)`
 * and `month(ts)` are distinct, while `day` and `DAY` collapse.
 */

import {
    Partition,
    Violation,
} from '../model';
import {
    TableTypeBase,
} from '../table-type';
import {
    isValidIcebergType,
    parseIcebergTransform,
    parseIcebergType,
    transformLegalOnType,
} from '../iceberg';

/**
 * Whether a string is a positive integer (digits only, value > 0). Iceberg
 * table-property values are strings, so numeric checks parse the string.
 *
 * @param value Property value string.
 * @returns True when `value` is a positive integer.
 */
function isPositiveInteger(value: string): boolean {
    return /^\d+$/.test(value) && Number(value) > 0;
}

/**
 * Whether a string is an integer within an inclusive range.
 *
 * @param value Property value string.
 * @param min Inclusive lower bound.
 * @param max Inclusive upper bound.
 * @returns True when `value` is an integer in `[min, max]`.
 */
function isIntegerInRange(value: string, min: number, max: number): boolean {
    if (!/^\d+$/.test(value)) {
        return false;
    }
    const parsed = Number(value);
    return parsed >= min && parsed <= max;
}

/** Iceberg (parquet) table. */
export class IcebergParquetTable extends TableTypeBase {
    /**
     * Validate a column type against the Iceberg v0 type registry.
     *
     * @param type Type string from a column definition.
     * @returns True when the type is a valid Iceberg type.
     */
    public isValidColumnType(type: string): boolean {
        return isValidIcebergType(type);
    }

    /**
     * Iceberg partition rules.
     *
     * Emits: `NO_DUPLICATE_PARTITIONS` (keyed by `${name} ${transformKind}:${param}`,
     * falling back to a lowercased trim of the raw transform when it doesn't
     * parse, so whitespace / case variants of the same transform collapse),
     * `ICEBERG_TRANSFORM_SOURCE_EXISTS`, `ICEBERG_TRANSFORM_VALID`, and
     * `ICEBERG_TRANSFORM_SOURCE_TYPE_LEGAL`.
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
            const key = this.partitionKey(partition);
            if (seen.has(key)) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'NO_DUPLICATE_PARTITIONS',
                    field: `partitions[${index}]`,
                    message: `duplicate partition: "${partition.name}" with transform "${partition.type}"`,
                }));
            }
            seen.add(key);
        });

        partitions.forEach((partition, index) => {
            const sourceColumn = this.definition.columns.find((column) => column.name === partition.name);
            if (sourceColumn === undefined) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'ICEBERG_TRANSFORM_SOURCE_EXISTS',
                    field: `partitions[${index}].name`,
                    message: `Iceberg partition source column "${partition.name}" is not defined in columns`,
                }));
                return;
            }
            const transform = parseIcebergTransform(partition.type);
            if (transform === null) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'ICEBERG_TRANSFORM_VALID',
                    field: `partitions[${index}].type`,
                    message: `"${partition.type}" is not a valid Iceberg partition transform`,
                }));
                return;
            }
            const sourceType = parseIcebergType(sourceColumn.type);
            if (sourceType !== null && !transformLegalOnType(transform, sourceType)) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'ICEBERG_TRANSFORM_SOURCE_TYPE_LEGAL',
                    field: `partitions[${index}].type`,
                    message: `transform "${partition.type}" is not legal on `
                        + `column "${partition.name}" of type "${sourceColumn.type}"`,
                }));
            }
        });

        return violations;
    }

    /// The Iceberg format versions this validator understands.
    private static readonly FORMAT_VERSIONS = new Set([
        1,
        2,
        3,
    ]);

    /// Table-property keys whose value must come from a closed set.
    private static readonly ENUM_PROPERTIES: Record<string, readonly string[]> = {
        'write.format.default': [
            'parquet',
            'avro',
            'orc',
        ],
        'write.parquet.compression-codec': [
            'zstd',
            'gzip',
            'snappy',
            'lz4',
            'none',
        ],
        'write.avro.compression-codec': [
            'gzip',
            'zstd',
            'snappy',
            'uncompressed',
        ],
        'write.orc.compression-codec': [
            'zstd',
            'lz4',
            'lzo',
            'zlib',
            'snappy',
            'none',
        ],
        'write.distribution-mode': [
            'none',
            'hash',
            'range',
        ],
        'write.metadata.compression-codec': [
            'none',
            'gzip',
        ],
    };

    /// Table-property keys whose value must be a positive integer.
    private static readonly POSITIVE_INT_PROPERTIES: readonly string[] = [
        'write.target-file-size-bytes',
        'history.expire.max-snapshot-age-ms',
        'history.expire.min-snapshots-to-keep',
        'history.expire.max-ref-age-ms',
        'write.metadata.previous-versions-max',
    ];

    /// Table-property keys whose value must be an integer within an inclusive range.
    private static readonly INT_RANGE_PROPERTIES: Record<string, { min: number; max: number }> = {
        'write.parquet.compression-level': {
            min: 1,
            max: 22,
        },
    };

    /**
     * Iceberg engine-specific rules: format version and table properties.
     *
     * @returns Every engine-specific violation.
     */
    public engineSpecificViolations(): Violation[] {
        return [
            ...this.formatVersionViolations(),
            ...this.tablePropertyViolations(),
        ];
    }

    /// ICEBERG_FORMAT_VERSION_VALID — `formatVersion`, when set, is 1, 2, or 3.
    private formatVersionViolations(): Violation[] {
        const {
            formatVersion,
        } = this.definition;
        if (formatVersion === undefined || IcebergParquetTable.FORMAT_VERSIONS.has(formatVersion)) {
            return [];
        }
        return [
            this.violation({
                level: 'error',
                code: 'ICEBERG_FORMAT_VERSION_VALID',
                field: 'formatVersion',
                message: `Iceberg formatVersion "${formatVersion}" must be 1, 2, or 3`,
            }),
        ];
    }

    /**
     * Validate the closed-domain Iceberg table properties. Keys outside the
     * known set pass through unvalidated.
     *
     * Emits `ICEBERG_PROPERTY_ENUM_VALID`, `ICEBERG_PROPERTY_POSITIVE_INT`, and
     * `ICEBERG_PROPERTY_INT_RANGE`.
     *
     * @returns Every table-property violation.
     */
    private tablePropertyViolations(): Violation[] {
        const violations: Violation[] = [];

        for (const [
            key,
            value,
        ] of Object.entries(this.definition.tableProperties)) {
            const allowed = IcebergParquetTable.ENUM_PROPERTIES[key];
            if (allowed !== undefined && !allowed.includes(value)) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'ICEBERG_PROPERTY_ENUM_VALID',
                    field: `tableProperties["${key}"]`,
                    message: `table property "${key}" value "${value}" must be one of: ${allowed.join(', ')}`,
                }));
            }

            if (IcebergParquetTable.POSITIVE_INT_PROPERTIES.includes(key) && !isPositiveInteger(value)) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'ICEBERG_PROPERTY_POSITIVE_INT',
                    field: `tableProperties["${key}"]`,
                    message: `table property "${key}" value "${value}" must be a positive integer`,
                }));
            }

            const range = IcebergParquetTable.INT_RANGE_PROPERTIES[key];
            if (range !== undefined && !isIntegerInRange(value, range.min, range.max)) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'ICEBERG_PROPERTY_INT_RANGE',
                    field: `tableProperties["${key}"]`,
                    message: `table property "${key}" value "${value}" must be an integer between `
                        + `${range.min} and ${range.max}`,
                }));
            }
        }

        return violations;
    }

    /**
     * Normalize a partition into its identity key. When the transform parses,
     * collapse on `${kind}:${param}` so `day` and `DAY`, `bucket[16]` and
     * `bucket[ 16 ]` are the same. When the transform doesn't parse, the
     * lowercased trim of the raw string is the best identity we have.
     *
     * @param partition Partition to key.
     * @returns The identity string for duplicate detection.
     */
    private partitionKey(partition: Partition): string {
        const transform = parseIcebergTransform(partition.type);
        const normalizedTransform = transform
            ? `${transform.kind}:${transform.param ?? ''}`
            : partition.type.trim().toLowerCase();
        return `${partition.name} ${normalizedTransform}`;
    }
}
