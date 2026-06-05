/**
 * Test helpers: build in-memory worlds and tables without touching disk.
 */

import {
    Column,
    ForeignKey,
    LoadedSchema,
    LoadedTable,
    Partition,
    Violation,
    World,
} from '../src/model';

/** Convenience column factory. */
export function col(name: string, type: string): Column {
    return {
        name,
        type,
        description: `column ${name}`,
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
    columns?: Column[];
    primaryKey?: string[];
    partitions?: Partition[];
    dependsOn?: string[];
    foreignKeys?: ForeignKey[];
    structurallyValid?: boolean;
}

/** Build a `LoadedTable` with sensible defaults. */
export function makeTable(input: TableInput): LoadedTable {
    const schema = input.schema ?? 'analytics';
    const name = input.name;
    return {
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
            columns: input.columns ?? [],
            primaryKey: input.primaryKey ?? [],
            partitions: input.partitions ?? [],
            dependsOn: input.dependsOn ?? [],
            foreignKeys: input.foreignKeys ?? [],
        },
    };
}

/** Build a `World` from a list of tables, grouping them into schemas. */
export function makeWorld(tables: LoadedTable[]): World {
    const tableMap = new Map<string, LoadedTable>();
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
