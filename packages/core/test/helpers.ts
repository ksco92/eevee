/**
 * Test helpers: build in-memory worlds and tables without touching disk.
 */

import {
    Bucketing,
    CheckConstraint,
    Column,
    ExclusionConstraint,
    ForeignKey,
    Index,
    Partition,
    SortField,
    UniqueConstraint,
    Violation,
} from '../src/model';
import {
    TableTypeBase,
} from '../src/table-type';
import {
    createTableType,
} from '../src/table-types/registry';
import {
    LoadedSchema,
    World,
} from '../src/world';

/** Convenience column factory. */
export function col(name: string, type: string, nullable?: boolean): Column {
    return {
        name,
        type,
        description: `column ${name}`,
        nullable,
    };
}

/** Convenience partition factory. */
export function part(name: string, type: string): Partition {
    return {
        name,
        type,
        description: `partition ${name}`,
    };
}

/** Input shape for `makeTable` (everything optional but `name`). */
export interface TableInput {
    schema?: string;
    name: string;
    tableType?: string;
    isRawData?: boolean;
    formatVersion?: number;
    columns?: Column[];
    primaryKey?: string[];
    partitions?: Partition[];
    sortOrder?: SortField[];
    identifierFields?: string[];
    indexes?: Index[];
    uniqueConstraints?: UniqueConstraint[];
    checkConstraints?: CheckConstraint[];
    exclusionConstraints?: ExclusionConstraint[];
    bucketing?: Bucketing;
    tableProperties?: Record<string, string>;
    dependsOn?: string[];
    foreignKeys?: ForeignKey[];
    structurallyValid?: boolean;
}

/** Build a concrete `TableTypeBase` with sensible defaults. */
export function makeTable(input: TableInput): TableTypeBase {
    const schema = input.schema ?? 'analytics';
    const name = input.name;
    return createTableType({
        schema,
        name,
        qualifiedName: `${schema}.${name}`,
        filePath: `/virtual/${schema}/${name}.json`,
        structurallyValid: input.structurallyValid ?? true,
        definition: {
            specVersion: '0',
            description: `table ${name}`,
            tableType: input.tableType ?? 'hive_parquet',
            isRawData: input.isRawData ?? true,
            formatVersion: input.formatVersion,
            columns: input.columns ?? [],
            primaryKey: input.primaryKey ?? [],
            partitions: input.partitions ?? [],
            sortOrder: input.sortOrder ?? [],
            identifierFields: input.identifierFields ?? [],
            indexes: input.indexes ?? [],
            uniqueConstraints: input.uniqueConstraints ?? [],
            checkConstraints: input.checkConstraints ?? [],
            exclusionConstraints: input.exclusionConstraints ?? [],
            bucketing: input.bucketing,
            tableProperties: input.tableProperties ?? {},
            dependsOn: input.dependsOn ?? [],
            foreignKeys: input.foreignKeys ?? [],
        },
    });
}

/** Build a `World` from a list of tables, grouping them into schemas. */
export function makeWorld(tables: TableTypeBase[]): World {
    const tableMap = new Map<string, TableTypeBase>();
    const schemaMap = new Map<string, LoadedSchema>();
    for (const table of tables) {
        tableMap.set(table.qualifiedName, table);
        let schema = schemaMap.get(table.schema);
        if (!schema) {
            schema = {
                name: table.schema,
                dirPath: `/virtual/${table.schema}`,
                description: {
                    specVersion: '0',
                    description: `schema ${table.schema}`,
                },
                tables: [],
            };
            schemaMap.set(table.schema, schema);
        }
        schema.tables.push(table);
    }
    return {
        rootDir: '/virtual',
        schemas: schemaMap,
        tables: tableMap,
    };
}

/** Extract the codes from a list of violations. */
export function codes(violations: Violation[]): string[] {
    return violations.map((violation) => violation.code);
}
