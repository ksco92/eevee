/**
 * Iceberg (parquet) format-version-2 table type.
 *
 * Iceberg partitions are transforms applied to a data column, so duplicate
 * detection keys on the (source column, normalized transform) pair — `year(ts)`
 * and `month(ts)` are distinct, while `day` and `DAY` collapse.
 *
 * The format version is encoded in the `tableType` discriminator: this engine is
 * inherently v2, so a present `formatVersion` must equal `EXPECTED_FORMAT_VERSION`.
 * A future `iceberg_parquet_v3` sibling subclass overrides that one constant.
 */

import {
    Partition,
    SortField,
    Violation,
} from '../model';
import {
    TableTypeBase,
} from '../table-type';
import {
    IcebergTypeKind,
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
 * Whether a string is a non-negative integer (digits only, value >= 0).
 *
 * @param value Property value string.
 * @returns True when `value` is a non-negative integer.
 */
function isNonNegativeInteger(value: string): boolean {
    return /^\d+$/.test(value);
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

/** Iceberg (parquet) format-version-2 table. */
export class IcebergParquetV2Table extends TableTypeBase {
    /**
     * The Iceberg format version this engine pins to. A present `formatVersion`
     * must equal this. A future v3 sibling subclass overrides this single value.
     */
    protected static readonly EXPECTED_FORMAT_VERSION = 2;

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
        'commit.retry.min-wait-ms',
        'commit.retry.max-wait-ms',
        'commit.retry.total-timeout-ms',
    ];

    /// Table-property keys whose value must be a non-negative integer.
    private static readonly NON_NEGATIVE_INT_PROPERTIES: readonly string[] = [
        'commit.retry.num-retries',
    ];

    /// Table-property keys whose value must be an integer within an inclusive range.
    private static readonly INT_RANGE_PROPERTIES: Record<string, { min: number; max: number }> = {
        'write.parquet.compression-level': {
            min: 1,
            max: 22,
        },
    };

    /// Legal sort directions and null orderings.
    private static readonly SORT_DIRECTIONS = new Set([
        'asc',
        'desc',
    ]);

    private static readonly SORT_NULL_ORDERS = new Set([
        'nulls-first',
        'nulls-last',
    ]);

    /**
     * Iceberg engine-specific rules: format version, table properties, and sort
     * order.
     *
     * @returns Every engine-specific violation.
     */
    public engineSpecificViolations(): Violation[] {
        return [
            ...this.formatVersionViolations(),
            ...this.tablePropertyViolations(),
            ...this.sortOrderViolations(),
            ...this.identifierFieldViolations(),
            ...this.fieldIdViolations(),
        ];
    }

    /**
     * Validate Iceberg column field ids — the ids Iceberg uses for schema
     * evolution. Pinning them keeps old data files readable across renames and
     * drops, so they are all-or-nothing per table: either every column declares
     * an `id` or none do. When present, each id must be a positive integer and
     * unique within the table.
     *
     * Emits `ICEBERG_FIELD_ID_ALL_OR_NONE`, `ICEBERG_FIELD_ID_POSITIVE`, and
     * `ICEBERG_FIELD_ID_UNIQUE`.
     *
     * @returns Every field-id violation.
     */
    private fieldIdViolations(): Violation[] {
        const violations: Violation[] = [];
        const {
            columns,
        } = this.definition;

        const withId = columns.filter((column) => column.id !== undefined);
        if (withId.length === 0) {
            return [];
        }

        if (withId.length !== columns.length) {
            violations.push(this.violation({
                level: 'error',
                code: 'ICEBERG_FIELD_ID_ALL_OR_NONE',
                field: 'columns',
                message: `either every column declares an id or none do; ${withId.length} `
                    + `of ${columns.length} columns have an id`,
            }));
        }

        const seen = new Set<number>();
        columns.forEach((column, index) => {
            const {
                id,
            } = column;
            if (id === undefined) {
                return;
            }
            if (!Number.isInteger(id) || id < 1) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'ICEBERG_FIELD_ID_POSITIVE',
                    field: `columns[${index}].id`,
                    message: `column "${column.name}" id ${id} must be a positive integer`,
                }));
                return;
            }
            if (seen.has(id)) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'ICEBERG_FIELD_ID_UNIQUE',
                    field: `columns[${index}].id`,
                    message: `column "${column.name}" reuses field id ${id}; ids must be unique within the table`,
                }));
            }
            seen.add(id);
        });

        return violations;
    }

    /**
     * Validate the Iceberg sort order.
     *
     * Emits `NO_DUPLICATE_SORT_FIELDS` (keyed by source column + normalized
     * transform), `ICEBERG_SORT_COLUMN_EXISTS`, `ICEBERG_SORT_DIRECTION_VALID`,
     * `ICEBERG_SORT_NULL_ORDER_VALID`, `ICEBERG_SORT_TRANSFORM_VALID`, and
     * `ICEBERG_SORT_TRANSFORM_TYPE_LEGAL`.
     *
     * @returns Every sort-order violation.
     */
    private sortOrderViolations(): Violation[] {
        const violations: Violation[] = [];
        const {
            sortOrder,
        } = this.definition;

        const seen = new Set<string>();
        sortOrder.forEach((field, index) => {
            const key = this.sortFieldKey(field);
            if (seen.has(key)) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'NO_DUPLICATE_SORT_FIELDS',
                    field: `sortOrder[${index}]`,
                    message: `duplicate sort field: "${field.column}"`
                        + `${field.transform ? ` with transform "${field.transform}"` : ''}`,
                }));
            }
            seen.add(key);
        });

        sortOrder.forEach((field, index) => {
            if (!IcebergParquetV2Table.SORT_DIRECTIONS.has(field.direction)) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'ICEBERG_SORT_DIRECTION_VALID',
                    field: `sortOrder[${index}].direction`,
                    message: `sort direction "${field.direction}" must be "asc" or "desc"`,
                }));
            }
            if (!IcebergParquetV2Table.SORT_NULL_ORDERS.has(field.nullOrder)) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'ICEBERG_SORT_NULL_ORDER_VALID',
                    field: `sortOrder[${index}].nullOrder`,
                    message: `sort null order "${field.nullOrder}" must be "nulls-first" or "nulls-last"`,
                }));
            }

            const sourceColumn = this.definition.columns.find((column) => column.name === field.column);
            if (sourceColumn === undefined) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'ICEBERG_SORT_COLUMN_EXISTS',
                    field: `sortOrder[${index}].column`,
                    message: `sort column "${field.column}" is not defined in columns`,
                }));
                return;
            }

            if (field.transform === undefined) {
                return;
            }
            const transform = parseIcebergTransform(field.transform);
            if (transform === null) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'ICEBERG_SORT_TRANSFORM_VALID',
                    field: `sortOrder[${index}].transform`,
                    message: `"${field.transform}" is not a valid Iceberg transform`,
                }));
                return;
            }
            const sourceType = parseIcebergType(sourceColumn.type);
            if (sourceType !== null && !transformLegalOnType(transform, sourceType)) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'ICEBERG_SORT_TRANSFORM_TYPE_LEGAL',
                    field: `sortOrder[${index}].transform`,
                    message: `transform "${field.transform}" is not legal on `
                        + `column "${field.column}" of type "${sourceColumn.type}"`,
                }));
            }
        });

        return violations;
    }

    /**
     * Normalize a sort field into its identity key. An omitted transform and an
     * explicit `identity` collapse to the same key so they count as duplicates.
     *
     * @param field Sort field to key.
     * @returns The identity string for duplicate detection.
     */
    private sortFieldKey(field: SortField): string {
        if (field.transform === undefined) {
            return `${field.column} identity:`;
        }
        const transform = parseIcebergTransform(field.transform);
        const normalizedTransform = transform
            ? `${transform.kind}:${transform.param ?? ''}`
            : field.transform.trim().toLowerCase();
        return `${field.column} ${normalizedTransform}`;
    }

    /// ICEBERG_FORMAT_VERSION_VALID — `formatVersion`, when set, equals the
    /// version this engine pins to (2 for `iceberg_parquet_v2`).
    private formatVersionViolations(): Violation[] {
        const {
            formatVersion,
        } = this.definition;
        const expected = (this.constructor as typeof IcebergParquetV2Table).EXPECTED_FORMAT_VERSION;
        if (formatVersion === undefined || formatVersion === expected) {
            return [];
        }
        return [
            this.violation({
                level: 'error',
                code: 'ICEBERG_FORMAT_VERSION_VALID',
                field: 'formatVersion',
                message: `Iceberg formatVersion "${formatVersion}" must be ${expected}`,
            }),
        ];
    }

    /**
     * Validate the closed-domain Iceberg table properties. Keys outside the
     * known set pass through unvalidated.
     *
     * Emits `ICEBERG_PROPERTY_ENUM_VALID`, `ICEBERG_PROPERTY_POSITIVE_INT`,
     * `ICEBERG_PROPERTY_NON_NEGATIVE_INT`, `ICEBERG_PROPERTY_INT_RANGE`, and
     * `ICEBERG_COMMIT_RETRY_ORDERING`.
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
            const allowed = IcebergParquetV2Table.ENUM_PROPERTIES[key];
            if (allowed !== undefined && !allowed.includes(value)) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'ICEBERG_PROPERTY_ENUM_VALID',
                    field: `tableProperties["${key}"]`,
                    message: `table property "${key}" value "${value}" must be one of: ${allowed.join(', ')}`,
                }));
            }

            if (IcebergParquetV2Table.POSITIVE_INT_PROPERTIES.includes(key) && !isPositiveInteger(value)) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'ICEBERG_PROPERTY_POSITIVE_INT',
                    field: `tableProperties["${key}"]`,
                    message: `table property "${key}" value "${value}" must be a positive integer`,
                }));
            }

            if (IcebergParquetV2Table.NON_NEGATIVE_INT_PROPERTIES.includes(key) && !isNonNegativeInteger(value)) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'ICEBERG_PROPERTY_NON_NEGATIVE_INT',
                    field: `tableProperties["${key}"]`,
                    message: `table property "${key}" value "${value}" must be a non-negative integer`,
                }));
            }

            const range = IcebergParquetV2Table.INT_RANGE_PROPERTIES[key];
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

        violations.push(...this.commitRetryOrderingViolations(properties));

        return violations;
    }

    /// ICEBERG_COMMIT_RETRY_ORDERING — commit.retry waits obey
    /// min-wait-ms <= max-wait-ms <= total-timeout-ms when all are positive ints.
    private commitRetryOrderingViolations(properties: Record<string, string>): Violation[] {
        const values = [
            properties['commit.retry.min-wait-ms'],
            properties['commit.retry.max-wait-ms'],
            properties['commit.retry.total-timeout-ms'],
        ];
        if (!values.every((value) => value !== undefined && isPositiveInteger(value))) {
            return [];
        }
        const [
            min,
            max,
            total,
        ] = values.map(Number);
        if (min <= max && max <= total) {
            return [];
        }
        return [
            this.violation({
                level: 'error',
                code: 'ICEBERG_COMMIT_RETRY_ORDERING',
                field: 'tableProperties["commit.retry.min-wait-ms"]',
                message: 'commit.retry waits must satisfy min-wait-ms <= max-wait-ms <= total-timeout-ms',
            }),
        ];
    }

    /**
     * Validate Iceberg identifier fields (the row-identity / equality-delete
     * key). Equality deletes are a v2 feature, which this engine inherently is;
     * identifier fields must be required primitive columns that are not
     * float/double.
     *
     * Emits `ICEBERG_IDENTIFIER_COLUMN_EXISTS`, `ICEBERG_IDENTIFIER_REQUIRED`,
     * and `ICEBERG_IDENTIFIER_TYPE_PRIMITIVE`.
     *
     * @returns Every identifier-field violation.
     */
    private identifierFieldViolations(): Violation[] {
        const violations: Violation[] = [];
        const {
            identifierFields,
        } = this.definition;

        if (identifierFields.length === 0) {
            return [];
        }

        identifierFields.forEach((name, index) => {
            const field = `identifierFields[${index}]`;
            const column = this.definition.columns.find((candidate) => candidate.name === name);
            if (column === undefined) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'ICEBERG_IDENTIFIER_COLUMN_EXISTS',
                    field,
                    message: `identifier field "${name}" is not defined in columns`,
                }));
                return;
            }
            if (column.nullable === true) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'ICEBERG_IDENTIFIER_REQUIRED',
                    field,
                    message: `identifier field "${name}" must be required (nullable: false)`,
                }));
            }
            const type = parseIcebergType(column.type);
            if (type === null || type.kind === IcebergTypeKind.FLOAT || type.kind === IcebergTypeKind.DOUBLE) {
                violations.push(this.violation({
                    level: 'error',
                    code: 'ICEBERG_IDENTIFIER_TYPE_PRIMITIVE',
                    field,
                    message: `identifier field "${name}" must be a primitive type other than float or double`,
                }));
            }
        });

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
