/**
 * Iceberg type and partition-transform parsing and legality.
 *
 * Ported from the arceus repo (`lib/iceberg/iceberg-type.ts`,
 * `lib/iceberg/iceberg-partition-transform.ts`). arceus models types as
 * constructed objects and *throws* on the first problem because it is a CDK
 * construct; FDD instead parses the *string* type found in a JSON file and
 * returns structured results so the validator can collect every violation.
 *
 * v0 supports Iceberg primitives plus the parameterized `decimal(p,s)` and
 * `fixed[L]`. Nested `list`/`map`/`struct` types are deferred to a later
 * version; partition transforms only apply to primitive source types anyway.
 */

/** Iceberg primitive / parameterized type kinds supported in v0. */
export enum IcebergTypeKind {
    BOOLEAN = 'boolean',
    INT = 'int',
    LONG = 'long',
    FLOAT = 'float',
    DOUBLE = 'double',
    DATE = 'date',
    TIME = 'time',
    TIMESTAMP = 'timestamp',
    TIMESTAMPTZ = 'timestamptz',
    STRING = 'string',
    UUID = 'uuid',
    BINARY = 'binary',
    DECIMAL = 'decimal',
    FIXED = 'fixed',
}

const ICEBERG_PRIMITIVES: readonly IcebergTypeKind[] = [
    IcebergTypeKind.BOOLEAN,
    IcebergTypeKind.INT,
    IcebergTypeKind.LONG,
    IcebergTypeKind.FLOAT,
    IcebergTypeKind.DOUBLE,
    IcebergTypeKind.DATE,
    IcebergTypeKind.TIME,
    IcebergTypeKind.TIMESTAMP,
    IcebergTypeKind.TIMESTAMPTZ,
    IcebergTypeKind.STRING,
    IcebergTypeKind.UUID,
    IcebergTypeKind.BINARY,
];

/** A parsed Iceberg type. */
export interface IcebergType {
    /** Discriminator. */
    readonly kind: IcebergTypeKind;

    /** Decimal precision (set when `kind === DECIMAL`). */
    readonly decimalPrecision?: number;

    /** Decimal scale (set when `kind === DECIMAL`). */
    readonly decimalScale?: number;

    /** Fixed byte length (set when `kind === FIXED`). */
    readonly fixedLength?: number;
}

const DECIMAL_RE = /^decimal\(\s*(\d+)\s*,\s*(\d+)\s*\)$/;
const FIXED_RE = /^fixed\[\s*(\d+)\s*\]$/;

/**
 * Parse an Iceberg type string into a structured type. Matching is
 * case-insensitive, consistent with the Hive and Postgres registries.
 *
 * @param typeStr Type string from a column definition.
 * @returns The parsed type, or null if it is not a valid v0 Iceberg type.
 */
export function parseIcebergType(typeStr: string): IcebergType | null {
    const trimmed = typeStr.trim().toLowerCase();

    if ((ICEBERG_PRIMITIVES as string[]).includes(trimmed)) {
        return {
            kind: trimmed as IcebergTypeKind,
        };
    }

    const decimalMatch = DECIMAL_RE.exec(trimmed);
    if (decimalMatch) {
        const precision = Number(decimalMatch[1]);
        const scale = Number(decimalMatch[2]);
        if (precision < 1 || precision > 38 || scale > precision) {
            return null;
        }
        return {
            kind: IcebergTypeKind.DECIMAL,
            decimalPrecision: precision,
            decimalScale: scale,
        };
    }

    const fixedMatch = FIXED_RE.exec(trimmed);
    if (fixedMatch) {
        const length = Number(fixedMatch[1]);
        if (length < 1) {
            return null;
        }
        return {
            kind: IcebergTypeKind.FIXED,
            fixedLength: length,
        };
    }

    return null;
}

/** Whether the string is a valid v0 Iceberg column type. */
export function isValidIcebergType(typeStr: string): boolean {
    return parseIcebergType(typeStr) !== null;
}

/** Iceberg partition-transform kinds. */
export enum IcebergTransformKind {
    IDENTITY = 'identity',
    YEAR = 'year',
    MONTH = 'month',
    DAY = 'day',
    HOUR = 'hour',
    VOID = 'void',
    BUCKET = 'bucket',
    TRUNCATE = 'truncate',
}

const NULLARY_TRANSFORMS: readonly IcebergTransformKind[] = [
    IcebergTransformKind.IDENTITY,
    IcebergTransformKind.YEAR,
    IcebergTransformKind.MONTH,
    IcebergTransformKind.DAY,
    IcebergTransformKind.HOUR,
    IcebergTransformKind.VOID,
];

/** A parsed Iceberg partition transform. */
export interface IcebergTransform {
    /** Discriminator. */
    readonly kind: IcebergTransformKind;

    /** Parameter for `bucket[N]` / `truncate[W]` (positive integer). */
    readonly param?: number;
}

const BUCKET_RE = /^bucket\[\s*(\d+)\s*\]$/;
const TRUNCATE_RE = /^truncate\[\s*(\d+)\s*\]$/;

/**
 * Parse an Iceberg transform string. Matching is case-insensitive.
 *
 * @param transformStr Transform string from a partition definition.
 * @returns The parsed transform, or null if it is not a valid transform.
 */
export function parseIcebergTransform(transformStr: string): IcebergTransform | null {
    const trimmed = transformStr.trim().toLowerCase();

    if ((NULLARY_TRANSFORMS as string[]).includes(trimmed)) {
        return {
            kind: trimmed as IcebergTransformKind,
        };
    }

    const bucketMatch = BUCKET_RE.exec(trimmed);
    if (bucketMatch) {
        const param = Number(bucketMatch[1]);
        if (param < 1) {
            return null;
        }
        return {
            kind: IcebergTransformKind.BUCKET,
            param,
        };
    }

    const truncateMatch = TRUNCATE_RE.exec(trimmed);
    if (truncateMatch) {
        const param = Number(truncateMatch[1]);
        if (param < 1) {
            return null;
        }
        return {
            kind: IcebergTransformKind.TRUNCATE,
            param,
        };
    }

    return null;
}

function isTemporal(kind: IcebergTypeKind): boolean {
    return kind === IcebergTypeKind.DATE
        || kind === IcebergTypeKind.TIMESTAMP
        || kind === IcebergTypeKind.TIMESTAMPTZ;
}

function isTimestamp(kind: IcebergTypeKind): boolean {
    return kind === IcebergTypeKind.TIMESTAMP
        || kind === IcebergTypeKind.TIMESTAMPTZ;
}

const BUCKET_LEGAL: ReadonlySet<IcebergTypeKind> = new Set([
    IcebergTypeKind.INT,
    IcebergTypeKind.LONG,
    IcebergTypeKind.DATE,
    IcebergTypeKind.TIME,
    IcebergTypeKind.TIMESTAMP,
    IcebergTypeKind.TIMESTAMPTZ,
    IcebergTypeKind.STRING,
    IcebergTypeKind.UUID,
    IcebergTypeKind.BINARY,
    IcebergTypeKind.DECIMAL,
    IcebergTypeKind.FIXED,
]);

const TRUNCATE_LEGAL: ReadonlySet<IcebergTypeKind> = new Set([
    IcebergTypeKind.INT,
    IcebergTypeKind.LONG,
    IcebergTypeKind.STRING,
    IcebergTypeKind.BINARY,
    IcebergTypeKind.DECIMAL,
]);

function isBucketLegal(kind: IcebergTypeKind): boolean {
    return BUCKET_LEGAL.has(kind);
}

function isTruncateLegal(kind: IcebergTypeKind): boolean {
    return TRUNCATE_LEGAL.has(kind);
}

/**
 * Whether a transform is legal on a given source-column type. Mirrors arceus's
 * `IcebergPartitionTransform.validateSourceType`.
 *
 * @param transform Parsed transform.
 * @param sourceType Parsed source-column type.
 * @returns True when the transform may be applied to that type.
 */
export function transformLegalOnType(transform: IcebergTransform, sourceType: IcebergType): boolean {
    switch (transform.kind) {
        case IcebergTransformKind.IDENTITY:
        case IcebergTransformKind.VOID:
            return true;
        case IcebergTransformKind.YEAR:
        case IcebergTransformKind.MONTH:
        case IcebergTransformKind.DAY:
            return isTemporal(sourceType.kind);
        case IcebergTransformKind.HOUR:
            return isTimestamp(sourceType.kind);
        case IcebergTransformKind.BUCKET:
            return isBucketLegal(sourceType.kind);
        case IcebergTransformKind.TRUNCATE:
            return isTruncateLegal(sourceType.kind);
        /* istanbul ignore next: exhaustive — every kind is handled above */
        default:
            return false;
    }
}
