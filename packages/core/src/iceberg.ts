/**
 * Iceberg type and partition-transform parsing and legality.
 *
 * Ported from the arceus repo (`lib/iceberg/iceberg-type.ts`,
 * `lib/iceberg/iceberg-partition-transform.ts`). arceus models types as
 * constructed objects and *throws* on the first problem because it is a CDK
 * construct; FDD instead parses the *string* type found in a JSON file and
 * returns structured results so the validator can collect every violation.
 *
 * Supports Iceberg primitives, the parameterized `decimal(p,s)` and `fixed[L]`,
 * and the nested v2 forms `struct<name:type,...>`, `list<type>`, and
 * `map<key,value>` (recursively). Partition and sort transforms only apply to
 * primitive source types, so they are rejected on nested-typed columns.
 */

/** Iceberg type kinds: primitives, parameterized, and nested (v2). */
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
    STRUCT = 'struct',
    LIST = 'list',
    MAP = 'map',
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

/** A named field of a `struct` type, in declared order. */
export interface IcebergStructField {
    /** Field name as written in the type string (original case preserved). */
    readonly name: string;

    /** Field type. */
    readonly type: IcebergType;
}

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

    /** Ordered fields (set when `kind === STRUCT`). */
    readonly structFields?: readonly IcebergStructField[];

    /** Element type (set when `kind === LIST`). */
    readonly elementType?: IcebergType;

    /** Map key type (set when `kind === MAP`). */
    readonly keyType?: IcebergType;

    /** Map value type (set when `kind === MAP`). */
    readonly valueType?: IcebergType;
}

/**
 * Why a type string failed to parse. `MALFORMED` is a broken nested string
 * (unbalanced brackets, empty struct, bad field, invalid inner type);
 * `DUPLICATE_FIELD` is two fields sharing a name in one struct; `UNKNOWN` is a
 * plain unrecognized scalar type (not an attempted nested form).
 */
export type IcebergTypeErrorCode = 'MALFORMED' | 'DUPLICATE_FIELD' | 'UNKNOWN';

/** A structured Iceberg type parse result. */
export type IcebergTypeParse =
    | {
        readonly ok: true;
        readonly type: IcebergType;
    }
    | {
        readonly ok: false;
        readonly code: IcebergTypeErrorCode;
        readonly message: string;
    };

const DECIMAL_RE = /^decimal\(\s*(\d+)\s*,\s*(\d+)\s*\)$/;
const FIXED_RE = /^fixed\[\s*(\d+)\s*\]$/;
const STRUCT_FIELD_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NESTED_CONSTRUCTORS: ReadonlySet<string> = new Set([
    'struct',
    'list',
    'map',
]);

/**
 * Parse a scalar (primitive / `decimal(p,s)` / `fixed[L]`) Iceberg type.
 *
 * @param lower Lowercased, trimmed type string.
 * @returns The parsed scalar type, or null when it is not a valid scalar type.
 */
function parseScalarIcebergType(lower: string): IcebergType | null {
    if ((ICEBERG_PRIMITIVES as string[]).includes(lower)) {
        return {
            kind: lower as IcebergTypeKind,
        };
    }

    const decimalMatch = DECIMAL_RE.exec(lower);
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

    const fixedMatch = FIXED_RE.exec(lower);
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

/**
 * Whether angle / paren / square brackets are balanced and properly nested.
 *
 * @param typeStr Type string to check.
 * @returns True when every opener has its matching closer in the right order.
 */
function bracketsBalanced(typeStr: string): boolean {
    const closers: Record<string, string> = {
        '>': '<',
        ')': '(',
        ']': '[',
    };
    const openers: ReadonlySet<string> = new Set([
        '<',
        '(',
        '[',
    ]);
    const stack: string[] = [];
    for (const char of typeStr) {
        if (openers.has(char)) {
            stack.push(char);
        } else if (char in closers) {
            if (stack.pop() !== closers[char]) {
                return false;
            }
        }
    }
    return stack.length === 0;
}

/**
 * Split a nested-type body on top-level commas, ignoring commas nested inside
 * `<>`, `()`, or `[]`.
 *
 * @param body Inner text between a constructor's angle brackets.
 * @returns The top-level comma-separated parts, each trimmed.
 */
function splitTopLevel(body: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = '';
    for (const char of body) {
        if (char === '<' || char === '(' || char === '[') {
            depth += 1;
        } else if (char === '>' || char === ')' || char === ']') {
            depth -= 1;
        }
        if (char === ',' && depth === 0) {
            parts.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    parts.push(current.trim());
    return parts;
}

/** Build a `MALFORMED` parse failure. */
function malformed(message: string): IcebergTypeParse {
    return {
        ok: false,
        code: 'MALFORMED',
        message,
    };
}

/**
 * Lift a failed inner-type parse into the enclosing type's failure. A
 * duplicate-field error keeps its precise code; anything else surfaces as a
 * malformation of the outer type (an invalid inner type).
 *
 * @param inner The inner failure.
 * @param original The full enclosing type string, for the message.
 * @returns The enclosing failure.
 */
function nestedFailure(inner: Extract<IcebergTypeParse, { ok: false }>, original: string): IcebergTypeParse {
    if (inner.code === 'DUPLICATE_FIELD') {
        return inner;
    }
    return malformed(`nested type "${original}" has an invalid inner type: ${inner.message}`);
}

/**
 * Parse the body of a `list<...>` type.
 *
 * @param inner Text between the list's angle brackets.
 * @param original The full type string, for error messages.
 * @returns A structured parse result.
 */
function analyzeList(inner: string, original: string): IcebergTypeParse {
    const parts = splitTopLevel(inner);
    if (parts.length !== 1 || parts[0] === '') {
        return malformed(`list type "${original}" must wrap exactly one element type`);
    }
    const element = analyzeIcebergType(parts[0]);
    if (!element.ok) {
        return nestedFailure(element, original);
    }
    return {
        ok: true,
        type: {
            kind: IcebergTypeKind.LIST,
            elementType: element.type,
        },
    };
}

/**
 * Parse the body of a `map<key,value>` type.
 *
 * @param inner Text between the map's angle brackets.
 * @param original The full type string, for error messages.
 * @returns A structured parse result.
 */
function analyzeMap(inner: string, original: string): IcebergTypeParse {
    const parts = splitTopLevel(inner);
    if (parts.length !== 2 || parts.some((part) => part === '')) {
        return malformed(`map type "${original}" must wrap a key type and a value type`);
    }
    const key = analyzeIcebergType(parts[0]);
    if (!key.ok) {
        return nestedFailure(key, original);
    }
    const value = analyzeIcebergType(parts[1]);
    if (!value.ok) {
        return nestedFailure(value, original);
    }
    return {
        ok: true,
        type: {
            kind: IcebergTypeKind.MAP,
            keyType: key.type,
            valueType: value.type,
        },
    };
}

/**
 * Parse the body of a `struct<name:type,...>` type.
 *
 * @param inner Text between the struct's angle brackets.
 * @param original The full type string, for error messages.
 * @returns A structured parse result.
 */
function analyzeStruct(inner: string, original: string): IcebergTypeParse {
    if (inner.trim() === '') {
        return malformed(`struct type "${original}" must declare at least one field`);
    }
    const fields: IcebergStructField[] = [];
    const seen = new Set<string>();
    for (const part of splitTopLevel(inner)) {
        const colon = part.indexOf(':');
        if (colon <= 0) {
            return malformed(`struct field "${part}" in "${original}" must be written as "name:type"`);
        }
        const name = part.slice(0, colon).trim();
        const fieldTypeStr = part.slice(colon + 1).trim();
        if (!STRUCT_FIELD_NAME_RE.test(name)) {
            return malformed(`struct field name "${name}" in "${original}" is not a valid identifier`);
        }
        const fieldType = analyzeIcebergType(fieldTypeStr);
        if (!fieldType.ok) {
            return nestedFailure(fieldType, original);
        }
        if (seen.has(name)) {
            return {
                ok: false,
                code: 'DUPLICATE_FIELD',
                message: `struct type "${original}" declares field "${name}" more than once`,
            };
        }
        seen.add(name);
        fields.push({
            name,
            type: fieldType.type,
        });
    }
    return {
        ok: true,
        type: {
            kind: IcebergTypeKind.STRUCT,
            structFields: fields,
        },
    };
}

/**
 * Parse an Iceberg type string into a structured type, or explain why it is
 * invalid. Handles primitives, `decimal(p,s)`, `fixed[L]`, and the nested v2
 * forms `struct<name:type,...>`, `list<type>`, and `map<key,value>`,
 * recursively. Type keywords match case-insensitively; struct field names keep
 * their original case.
 *
 * @param typeStr Type string from a column definition.
 * @returns A structured parse result.
 */
export function analyzeIcebergType(typeStr: string): IcebergTypeParse {
    const trimmed = typeStr.trim();
    const scalar = parseScalarIcebergType(trimmed.toLowerCase());
    if (scalar !== null) {
        return {
            ok: true,
            type: scalar,
        };
    }

    const open = trimmed.indexOf('<');
    const constructor = open > 0 ? trimmed.slice(0, open).trim().toLowerCase() : '';
    if (open <= 0 || !NESTED_CONSTRUCTORS.has(constructor)) {
        return {
            ok: false,
            code: 'UNKNOWN',
            message: `"${typeStr}" is not a valid Iceberg type`,
        };
    }

    if (!trimmed.endsWith('>')) {
        return malformed(`nested type "${typeStr}" is missing its closing ">"`);
    }
    if (!bracketsBalanced(trimmed)) {
        return malformed(`nested type "${typeStr}" has unbalanced brackets`);
    }

    const body = trimmed.slice(open + 1, -1);
    if (constructor === 'list') {
        return analyzeList(body, typeStr);
    }
    if (constructor === 'map') {
        return analyzeMap(body, typeStr);
    }
    return analyzeStruct(body, typeStr);
}

/**
 * Parse an Iceberg type string into a structured type. Thin wrapper over
 * `analyzeIcebergType` for callers that only need the type or null.
 *
 * @param typeStr Type string from a column definition.
 * @returns The parsed type, or null if it is not a valid Iceberg type.
 */
export function parseIcebergType(typeStr: string): IcebergType | null {
    const result = analyzeIcebergType(typeStr);
    return result.ok ? result.type : null;
}

/** Whether the string is a valid Iceberg column type. */
export function isValidIcebergType(typeStr: string): boolean {
    return analyzeIcebergType(typeStr).ok;
}

/** Whether a parsed Iceberg type is a nested type (`struct`, `list`, or `map`). */
export function isNestedIcebergType(type: IcebergType): boolean {
    return type.kind === IcebergTypeKind.STRUCT
        || type.kind === IcebergTypeKind.LIST
        || type.kind === IcebergTypeKind.MAP;
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
    if (isNestedIcebergType(sourceType)) {
        return false;
    }
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
