/**
 * Filesystem loader. Walks a dataset root, parses each JSON file, runs Layer 1
 * structural validation, and normalizes everything into a `World` of
 * concrete `TableTypeBase` instances that the semantic rules operate on.
 *
 * Parse errors, structural errors, and a missing schema-description file are
 * reported here; all cross-field / cross-file logic lives in the table-type
 * classes (`./table-type.ts`, `./table-types/*`).
 */

import * as fs from 'fs';
import * as path from 'path';

import {
    Bucketing,
    CheckConstraint,
    Column,
    ExclusionConstraint,
    ForeignKey,
    Index,
    Partition,
    SchemaDescription,
    SortField,
    TableDefinition,
    UniqueConstraint,
    Violation,
} from './model';
import {
    validateStructure,
} from './structural';
import {
    TableTypeBase,
} from './table-type';
import {
    createTableType,
} from './table-types/registry';
import {
    LoadedSchema,
    World,
} from './world';

/** Result of loading a root: the model plus any load-time violations. */
export interface LoadOutcome {
    /** The loaded model. */
    readonly world: World;

    /** Parse, structural, and missing-description violations. */
    readonly violations: Violation[];
}

function asRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function asBoolean(value: unknown): boolean {
    return typeof value === 'boolean' ? value : false;
}

function asOptionalBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}

function asOptionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
}

function asOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

function asStringArray(value: unknown): string[] {
    return asArray(value).filter((item): item is string => typeof item === 'string');
}

function normalizeColumns(value: unknown): Column[] {
    return asArray(value).map((raw) => {
        const record = asRecord(raw);
        return {
            name: asString(record.name),
            type: asString(record.type),
            description: asString(record.description),
            nullable: asOptionalBoolean(record.nullable),
            generated: asOptionalString(record.generated),
            expression: asOptionalString(record.expression),
            expressionColumns: 'expressionColumns' in record ? asStringArray(record.expressionColumns) : undefined,
            identity: asOptionalString(record.identity),
            default: asOptionalString(record.default),
            collation: asOptionalString(record.collation),
            compression: asOptionalString(record.compression),
            storage: asOptionalString(record.storage),
        };
    });
}

function normalizePartitions(value: unknown): Partition[] {
    return asArray(value).map((raw) => {
        const record = asRecord(raw);
        return {
            name: asString(record.name),
            type: asString(record.type),
            description: asString(record.description),
        };
    });
}

function normalizeSortOrder(value: unknown): SortField[] {
    return asArray(value).map((raw) => {
        const record = asRecord(raw);
        return {
            column: asString(record.column),
            transform: asOptionalString(record.transform),
            direction: asString(record.direction),
            nullOrder: asString(record.nullOrder),
        };
    });
}

function normalizeIndexes(value: unknown): Index[] {
    return asArray(value).map((raw) => {
        const record = asRecord(raw);
        return {
            name: asString(record.name),
            method: asString(record.method),
            unique: asOptionalBoolean(record.unique),
            columns: asArray(record.columns).map((rawColumn) => {
                const columnRecord = asRecord(rawColumn);
                return {
                    name: asString(columnRecord.name),
                    sort: asOptionalString(columnRecord.sort),
                    nulls: asOptionalString(columnRecord.nulls),
                };
            }),
            include: asStringArray(record.include),
            where: asOptionalString(record.where),
        };
    });
}

function normalizeUniqueConstraints(value: unknown): UniqueConstraint[] {
    return asArray(value).map((raw) => {
        const record = asRecord(raw);
        return {
            name: asString(record.name),
            columns: asStringArray(record.columns),
            nullsNotDistinct: asOptionalBoolean(record.nullsNotDistinct),
        };
    });
}

function normalizeCheckConstraints(value: unknown): CheckConstraint[] {
    return asArray(value).map((raw) => {
        const record = asRecord(raw);
        return {
            name: asString(record.name),
            expression: asString(record.expression),
            columns: asStringArray(record.columns),
        };
    });
}

function normalizeExclusionConstraints(value: unknown): ExclusionConstraint[] {
    return asArray(value).map((raw) => {
        const record = asRecord(raw);
        return {
            name: asString(record.name),
            using: asString(record.using),
            elements: asArray(record.elements).map((rawElement) => {
                const elementRecord = asRecord(rawElement);
                return {
                    column: asString(elementRecord.column),
                    operator: asString(elementRecord.operator),
                };
            }),
        };
    });
}

function normalizeBucketing(value: unknown): Bucketing | undefined {
    if (value === null || typeof value !== 'object') {
        return undefined;
    }
    const record = asRecord(value);
    return {
        columns: asStringArray(record.columns),
        bucketCount: typeof record.bucketCount === 'number' ? record.bucketCount : 0,
        sortedBy: asArray(record.sortedBy).map((raw) => {
            const sortRecord = asRecord(raw);
            return {
                column: asString(sortRecord.column),
                direction: asString(sortRecord.direction),
            };
        }),
    };
}

function normalizeStringMap(value: unknown): Record<string, string> {
    const record = asRecord(value);
    const result: Record<string, string> = {};
    for (const [
        key,
        raw,
    ] of Object.entries(record)) {
        if (typeof raw === 'string') {
            result[key] = raw;
        }
    }
    return result;
}

function normalizeForeignKeys(value: unknown): ForeignKey[] {
    return asArray(value).map((raw) => {
        const record = asRecord(raw);
        return {
            sourceTable: asString(record.sourceTable),
            sourceColumn: asString(record.sourceColumn),
            localColumn: asString(record.localColumn),
            allowNulls: asBoolean(record.allowNulls),
        };
    });
}

function normalizeTableDefinition(raw: unknown): TableDefinition {
    const record = asRecord(raw);
    return {
        specVersion: asString(record.specVersion),
        description: asString(record.description),
        tableType: asString(record.tableType),
        isRawData: asBoolean(record.isRawData),
        formatVersion: asOptionalNumber(record.formatVersion),
        columns: normalizeColumns(record.columns),
        primaryKey: asStringArray(record.primaryKey),
        partitions: normalizePartitions(record.partitions),
        sortOrder: normalizeSortOrder(record.sortOrder),
        indexes: normalizeIndexes(record.indexes),
        uniqueConstraints: normalizeUniqueConstraints(record.uniqueConstraints),
        checkConstraints: normalizeCheckConstraints(record.checkConstraints),
        exclusionConstraints: normalizeExclusionConstraints(record.exclusionConstraints),
        bucketing: normalizeBucketing(record.bucketing),
        tableProperties: normalizeStringMap(record.tableProperties),
        dependsOn: asStringArray(record.dependsOn),
        foreignKeys: normalizeForeignKeys(record.foreignKeys),
    };
}

function normalizeSchemaDescription(raw: unknown): SchemaDescription {
    const record = asRecord(raw);
    return {
        specVersion: asString(record.specVersion),
        description: asString(record.description),
    };
}

/// Schema and table names must be lowercase snake_case so they can be referenced
/// from `dependsOn` and foreign keys, whose patterns require the same shape.
const NAME_RE = /^[a-z0-9_]+$/;

/**
 * Load a dataset root into a `World`.
 *
 * @param rootDir Absolute or relative path to the dataset root.
 * @returns The loaded world plus load-time violations.
 * @throws Error When `rootDir` is not an existing directory.
 */
export function loadRoot(rootDir: string): LoadOutcome {
    const absoluteRoot = path.resolve(rootDir);
    if (!fs.existsSync(absoluteRoot) || !fs.statSync(absoluteRoot).isDirectory()) {
        throw new Error(`dataset root is not a directory: ${absoluteRoot}`);
    }

    const violations: Violation[] = [];
    const schemas = new Map<string, LoadedSchema>();
    const tables = new Map<string, TableTypeBase>();

    const schemaDirs = fs.readdirSync(absoluteRoot, {
        withFileTypes: true,
    }).filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .sort((a, b) => a.name.localeCompare(b.name));

    for (const schemaDir of schemaDirs) {
        const schemaName = schemaDir.name;
        const dirPath = path.join(absoluteRoot, schemaName);

        if (!NAME_RE.test(schemaName)) {
            violations.push({
                level: 'error',
                code: 'SCHEMA_NAME_VALID',
                schema: schemaName,
                path: dirPath,
                message: `schema name "${schemaName}" must be lowercase snake_case (matching ${NAME_RE})`,
            });
        }

        const descFileName = `${schemaName}.json`;
        const jsonFiles = fs.readdirSync(dirPath)
            .filter((file) => file.endsWith('.json'))
            .sort((a, b) => a.localeCompare(b));

        let description: SchemaDescription | null = null;
        const loadedTables: TableTypeBase[] = [];

        for (const file of jsonFiles) {
            const filePath = path.join(dirPath, file);
            const text = fs.readFileSync(filePath, 'utf-8');

            let parsed: unknown;
            try {
                parsed = JSON.parse(text);
            } catch (error) {
                violations.push({
                    level: 'error',
                    code: 'FILE_PARSE_ERROR',
                    schema: schemaName,
                    path: filePath,
                    message: `invalid JSON: ${(error as Error).message}`,
                });
                continue;
            }

            if (file === descFileName) {
                const structural = validateStructure('schema', parsed);
                for (const structuralError of structural.errors) {
                    violations.push({
                        level: 'error',
                        code: 'SCHEMA_VALIDATION',
                        schema: schemaName,
                        field: structuralError.field,
                        path: filePath,
                        message: structuralError.message,
                    });
                }
                description = normalizeSchemaDescription(parsed);
                continue;
            }

            const tableName = file.slice(0, -'.json'.length);
            const qualifiedName = `${schemaName}.${tableName}`;

            if (!NAME_RE.test(tableName)) {
                violations.push({
                    level: 'error',
                    code: 'TABLE_NAME_VALID',
                    schema: schemaName,
                    table: tableName,
                    path: filePath,
                    message: `table name "${tableName}" must be lowercase snake_case (matching ${NAME_RE})`,
                });
            }

            const structural = validateStructure('table', parsed);
            for (const structuralError of structural.errors) {
                violations.push({
                    level: 'error',
                    code: 'SCHEMA_VALIDATION',
                    schema: schemaName,
                    table: tableName,
                    field: structuralError.field,
                    path: filePath,
                    message: structuralError.message,
                });
            }

            const loadedTable = createTableType({
                schema: schemaName,
                name: tableName,
                qualifiedName,
                filePath,
                structurallyValid: structural.valid,
                definition: normalizeTableDefinition(parsed),
            });
            loadedTables.push(loadedTable);
            tables.set(qualifiedName, loadedTable);
        }

        if (description === null) {
            violations.push({
                level: 'error',
                code: 'SCHEMA_DESC_PRESENT',
                schema: schemaName,
                path: path.join(dirPath, descFileName),
                message: `schema "${schemaName}" is missing its description file "${descFileName}"`,
            });
        }

        schemas.set(schemaName, {
            name: schemaName,
            dirPath,
            description,
            tables: loadedTables,
        });
    }

    return {
        world: {
            rootDir: absoluteRoot,
            schemas,
            tables,
        },
        violations,
    };
}
