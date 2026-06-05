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

    /**
     * Iceberg engine-specific rules.
     *
     * Emits `ICEBERG_FORMAT_VERSION_VALID` when `formatVersion` is set to
     * anything other than 1, 2, or 3.
     *
     * @returns Every engine-specific violation.
     */
    public engineSpecificViolations(): Violation[] {
        const violations: Violation[] = [];
        const {
            formatVersion,
        } = this.definition;
        if (formatVersion !== undefined && !IcebergParquetTable.FORMAT_VERSIONS.has(formatVersion)) {
            violations.push(this.violation({
                level: 'error',
                code: 'ICEBERG_FORMAT_VERSION_VALID',
                field: 'formatVersion',
                message: `Iceberg formatVersion "${formatVersion}" must be 1, 2, or 3`,
            }));
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
