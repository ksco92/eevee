/**
 * Per-engine column-type registries.
 *
 * `isValidColumnType(tableType, typeStr)` is the single entry point used by the
 * `COLUMN_TYPE_VALID` semantic rule. Iceberg delegates to the ported module in
 * `iceberg.ts`; Hive and Postgres are validated here.
 */

import {
    TableType, 
} from './model';
import {
    isValidIcebergType, 
} from './iceberg';

/// ////////////////////////////////////////////////////////////////////////////
// Hive

const HIVE_PRIMITIVES: ReadonlySet<string> = new Set([
    'tinyint',
    'smallint',
    'int',
    'integer',
    'bigint',
    'boolean',
    'float',
    'double',
    'double precision',
    'string',
    'binary',
    'timestamp',
    'date',
    'interval',
]);

/**
 * Split a generic-type body on top-level commas (ignoring commas nested inside
 * `<...>`).
 *
 * @param body Inner text of a generic type.
 * @returns The top-level comma-separated parts.
 */
function splitTopLevel(body: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = '';
    for (const char of body) {
        if (char === '<') {
            depth += 1;
        } else if (char === '>') {
            depth -= 1;
        }
        if (char === ',' && depth === 0) {
            parts.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    parts.push(current);
    return parts.map((part) => part.trim());
}

function isValidHiveStructField(field: string): boolean {
    const colon = field.indexOf(':');
    if (colon <= 0) {
        return false;
    }
    const name = field.slice(0, colon).trim();
    const type = field.slice(colon + 1).trim();
    return name.length > 0 && isValidHiveType(type);
}

/** Whether the string is a valid Hive (parquet) column type. */
export function isValidHiveType(typeStr: string): boolean {
    const type = typeStr.trim().toLowerCase();

    if (HIVE_PRIMITIVES.has(type)) {
        return true;
    }

    if (/^decimal\(\d+(,\s*\d+)?\)$/.test(type)) {
        return true;
    }

    if (/^(varchar|char)\(\d+\)$/.test(type)) {
        return true;
    }

    const open = type.indexOf('<');
    if (open > 0 && type.endsWith('>')) {
        const ctor = type.slice(0, open);
        const inner = type.slice(open + 1, -1);
        const parts = splitTopLevel(inner);
        switch (ctor) {
            case 'array':
                return parts.length === 1 && isValidHiveType(parts[0]);
            case 'map':
                return parts.length === 2 && parts.every(isValidHiveType);
            case 'uniontype':
                return parts.length >= 1 && parts.every(isValidHiveType);
            case 'struct':
                return parts.length >= 1 && parts.every(isValidHiveStructField);
            default:
                return false;
        }
    }

    return false;
}

/// ////////////////////////////////////////////////////////////////////////////
// Postgres

const POSTGRES_EXACT: ReadonlySet<string> = new Set([
    'smallint',
    'integer',
    'int',
    'int2',
    'int4',
    'int8',
    'bigint',
    'real',
    'float4',
    'float8',
    'double precision',
    'money',
    'text',
    'bytea',
    'boolean',
    'bool',
    'date',
    'timestamp',
    'timestamptz',
    'timestamp with time zone',
    'time',
    'timetz',
    'time with time zone',
    'interval',
    'uuid',
    'json',
    'jsonb',
    'xml',
    'inet',
    'cidr',
    'macaddr',
    'macaddr8',
    'smallserial',
    'serial',
    'bigserial',
    'serial2',
    'serial4',
    'serial8',
    'varchar',
    'char',
    'character',
    'character varying',
    'bpchar',
    'numeric',
    'decimal',
    'bit',
    'varbit',
    'bit varying',
]);

const POSTGRES_PARAM_ALLOWED: ReadonlySet<string> = new Set([
    'varchar',
    'char',
    'character',
    'character varying',
    'bpchar',
    'numeric',
    'decimal',
    'bit',
    'varbit',
    'bit varying',
    'time',
    'timetz',
    'timestamp',
    'timestamptz',
    'interval',
]);

/** Whether the string is a valid Postgres 18 column type. */
export function isValidPostgresType(typeStr: string): boolean {
    let type = typeStr.trim().toLowerCase().replace(/\s+/g, ' ');

    /// Strip one or more trailing array markers (`[]`, `[3]`).
    type = type.replace(/(\s*\[\s*\d*\s*\])+$/, '').trim();

    const paramMatch = /^(.*?)\(([^)]*)\)$/.exec(type);
    if (paramMatch) {
        const base = paramMatch[1].trim();
        const params = paramMatch[2].trim();
        return POSTGRES_PARAM_ALLOWED.has(base) && /^\d+(\s*,\s*\d+)?$/.test(params);
    }

    return POSTGRES_EXACT.has(type);
}

/// ////////////////////////////////////////////////////////////////////////////
// Dispatch

/**
 * Validate a column type for the given engine.
 *
 * @param tableType Engine of the owning table.
 * @param typeStr Column type string.
 * @returns True when the type is valid for that engine.
 */
export function isValidColumnType(tableType: string, typeStr: string): boolean {
    switch (tableType) {
        case TableType.HIVE_PARQUET:
            return isValidHiveType(typeStr);
        case TableType.ICEBERG_PARQUET:
            return isValidIcebergType(typeStr);
        case TableType.POSTGRES_18:
            return isValidPostgresType(typeStr);
        default:
            return false;
    }
}
