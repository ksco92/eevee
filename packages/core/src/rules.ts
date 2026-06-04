/**
 * Layer 2 (semantic) rules: cross-field and cross-file checks that a JSON
 * Schema cannot express.
 *
 * Each rule is a pure function `(world) => Violation[]`. Intra-table rules run
 * only on tables that passed Layer 1 (structural) validation, since Layer 1
 * already reports malformed files; cross-file rules resolve targets against the
 * full set of parseable tables.
 */

import {
    ForeignKey,
    LoadedTable,
    TableType,
    Violation,
    World,
} from './model';
import {
    isValidColumnType, isValidHiveType, 
} from './types';
import {
    parseIcebergTransform,
    parseIcebergType,
    transformLegalOnType,
} from './iceberg';

/** A semantic rule. */
export type Rule = (world: World) => Violation[];

function validTables(world: World): LoadedTable[] {
    return [
        ...world.tables.values(),
    ].filter((table) => table.structurallyValid);
}

function columnNames(table: LoadedTable): Set<string> {
    return new Set(table.definition.columns.map((column) => column.name));
}

function findDuplicates(names: string[]): string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const name of names) {
        if (seen.has(name)) {
            duplicates.add(name);
        }
        seen.add(name);
    }
    return [
        ...duplicates,
    ];
}

function base(table: LoadedTable): Pick<Violation, 'schema' | 'table' | 'path'> {
    return {
        schema: table.schema,
        table: table.name,
        path: table.filePath,
    };
}

/// PK_COLUMNS_EXIST — every primary-key column exists in `columns`.
function checkPrimaryKey(world: World): Violation[] {
    const violations: Violation[] = [];
    for (const table of validTables(world)) {
        const names = columnNames(table);
        for (const pkColumn of table.definition.primaryKey) {
            if (!names.has(pkColumn)) {
                violations.push({
                    level: 'error',
                    code: 'PK_COLUMNS_EXIST',
                    ...base(table),
                    field: 'primaryKey',
                    message: `primary-key column "${pkColumn}" is not defined in columns`,
                });
            }
        }
    }
    return violations;
}

/// NO_DUPLICATE_COLUMNS — column names are unique within a table.
function checkDuplicateColumns(world: World): Violation[] {
    const violations: Violation[] = [];
    for (const table of validTables(world)) {
        for (const duplicate of findDuplicates(table.definition.columns.map((column) => column.name))) {
            violations.push({
                level: 'error',
                code: 'NO_DUPLICATE_COLUMNS',
                ...base(table),
                field: 'columns',
                message: `duplicate column name "${duplicate}"`,
            });
        }
    }
    return violations;
}

/// COLUMN_TYPE_VALID — every column type is valid for the table's engine.
function checkColumnTypes(world: World): Violation[] {
    const violations: Violation[] = [];
    for (const table of validTables(world)) {
        table.definition.columns.forEach((column, index) => {
            if (!isValidColumnType(table.definition.tableType, column.type)) {
                violations.push({
                    level: 'error',
                    code: 'COLUMN_TYPE_VALID',
                    ...base(table),
                    field: `columns[${index}].type`,
                    message: `"${column.type}" is not a valid ${table.definition.tableType} type `
                        + `for column "${column.name}"`,
                });
            }
        });
    }
    return violations;
}

/// Partition rules — engine-specific. Emits several codes.
function checkPartitions(world: World): Violation[] {
    const violations: Violation[] = [];
    for (const table of validTables(world)) {
        const {
            tableType, partitions, 
        } = table.definition;

        if (tableType === TableType.POSTGRES_18 && partitions.length > 0) {
            violations.push({
                level: 'error',
                code: 'PARTITIONS_ALLOWED_FOR_TYPE',
                ...base(table),
                field: 'partitions',
                message: 'partitions are not supported for postgres_18 in v0',
            });
            continue;
        }

        for (const duplicate of findDuplicates(partitions.map((partition) => partition.name))) {
            violations.push({
                level: 'error',
                code: 'NO_DUPLICATE_PARTITIONS',
                ...base(table),
                field: 'partitions',
                message: `duplicate partition name "${duplicate}"`,
            });
        }

        const names = columnNames(table);
        partitions.forEach((partition, index) => {
            if (tableType === TableType.HIVE_PARQUET) {
                if (names.has(partition.name)) {
                    violations.push({
                        level: 'error',
                        code: 'HIVE_PARTITION_NOT_IN_COLUMNS',
                        ...base(table),
                        field: `partitions[${index}].name`,
                        message: `Hive partition "${partition.name}" must not also be a data column`,
                    });
                }
                if (!isValidHiveType(partition.type)) {
                    violations.push({
                        level: 'error',
                        code: 'HIVE_PARTITION_TYPE_VALID',
                        ...base(table),
                        field: `partitions[${index}].type`,
                        message: `"${partition.type}" is not a valid Hive partition type`,
                    });
                }
            } else if (tableType === TableType.ICEBERG_PARQUET) {
                const sourceColumn = table.definition.columns.find((column) => column.name === partition.name);
                if (sourceColumn === undefined) {
                    violations.push({
                        level: 'error',
                        code: 'ICEBERG_TRANSFORM_SOURCE_EXISTS',
                        ...base(table),
                        field: `partitions[${index}].name`,
                        message: `Iceberg partition source column "${partition.name}" is not defined in columns`,
                    });
                    return;
                }
                const transform = parseIcebergTransform(partition.type);
                if (transform === null) {
                    violations.push({
                        level: 'error',
                        code: 'ICEBERG_TRANSFORM_VALID',
                        ...base(table),
                        field: `partitions[${index}].type`,
                        message: `"${partition.type}" is not a valid Iceberg partition transform`,
                    });
                    return;
                }
                const sourceType = parseIcebergType(sourceColumn.type);
                if (sourceType !== null && !transformLegalOnType(transform, sourceType)) {
                    violations.push({
                        level: 'error',
                        code: 'ICEBERG_TRANSFORM_SOURCE_TYPE_LEGAL',
                        ...base(table),
                        field: `partitions[${index}].type`,
                        message: `transform "${partition.type}" is not legal on `
                            + `column "${partition.name}" of type "${sourceColumn.type}"`,
                    });
                }
            }
        });
    }
    return violations;
}

/// RAW_NO_DEPENDS_ON / NONRAW_REQUIRES_DEPENDS_ON.
function checkRawConsistency(world: World): Violation[] {
    const violations: Violation[] = [];
    for (const table of validTables(world)) {
        const {
            isRawData, dependsOn, 
        } = table.definition;
        if (isRawData && dependsOn.length > 0) {
            violations.push({
                level: 'error',
                code: 'RAW_NO_DEPENDS_ON',
                ...base(table),
                field: 'dependsOn',
                message: 'raw tables (isRawData=true) must not declare dependsOn',
            });
        }
        if (!isRawData && dependsOn.length === 0) {
            violations.push({
                level: 'error',
                code: 'NONRAW_REQUIRES_DEPENDS_ON',
                ...base(table),
                field: 'dependsOn',
                message: 'non-raw tables (isRawData=false) must declare at least one dependsOn',
            });
        }
    }
    return violations;
}

/// DEPENDS_ON_RESOLVES — every dependsOn entry resolves to a real table.
function checkDependsOnResolves(world: World): Violation[] {
    const violations: Violation[] = [];
    for (const table of validTables(world)) {
        table.definition.dependsOn.forEach((dependency, index) => {
            if (!world.tables.has(dependency)) {
                violations.push({
                    level: 'error',
                    code: 'DEPENDS_ON_RESOLVES',
                    ...base(table),
                    field: `dependsOn[${index}]`,
                    message: `dependsOn "${dependency}" does not resolve to a known table`,
                });
            }
        });
    }
    return violations;
}

function checkForeignKey(world: World, table: LoadedTable, fk: ForeignKey, index: number): Violation[] {
    const violations: Violation[] = [];
    const field = `foreignKeys[${index}]`;
    const localNames = columnNames(table);

    if (!localNames.has(fk.localColumn)) {
        violations.push({
            level: 'error',
            code: 'FK_LOCAL_COLUMN_EXISTS',
            ...base(table),
            field: `${field}.localColumn`,
            message: `local column "${fk.localColumn}" is not defined in columns`,
        });
    }

    if (!table.definition.dependsOn.includes(fk.sourceTable)) {
        violations.push({
            level: 'error',
            code: 'FK_IMPLIES_DEPENDENCY',
            ...base(table),
            field: `${field}.sourceTable`,
            message: `foreign key targets "${fk.sourceTable}" but it is not listed in dependsOn`,
        });
    }

    const target = world.tables.get(fk.sourceTable);
    if (target === undefined) {
        violations.push({
            level: 'error',
            code: 'FK_SOURCE_TABLE_RESOLVES',
            ...base(table),
            field: `${field}.sourceTable`,
            message: `foreign key source table "${fk.sourceTable}" does not resolve to a known table`,
        });
        return violations;
    }

    const targetHasColumn = target.definition.columns.some((column) => column.name === fk.sourceColumn);
    if (!targetHasColumn) {
        violations.push({
            level: 'error',
            code: 'FK_SOURCE_COLUMN_EXISTS',
            ...base(table),
            field: `${field}.sourceColumn`,
            message: `foreign key source column "${fk.sourceColumn}" is not defined in "${fk.sourceTable}"`,
        });
        return violations;
    }

    if (!target.definition.primaryKey.includes(fk.sourceColumn)) {
        violations.push({
            level: 'warning',
            code: 'FK_SOURCE_IS_KEY',
            ...base(table),
            field: `${field}.sourceColumn`,
            message: `foreign key source column "${fk.sourceColumn}" is not part of the primary key `
                + `of "${fk.sourceTable}"`,
        });
    }

    return violations;
}

/// Foreign-key rules.
function checkForeignKeys(world: World): Violation[] {
    const violations: Violation[] = [];
    for (const table of validTables(world)) {
        table.definition.foreignKeys.forEach((fk, index) => {
            violations.push(...checkForeignKey(world, table, fk, index));
        });
    }
    return violations;
}

/// DEPENDENCY_GRAPH_ACYCLIC — the dependsOn graph has no cycles.
///
/// Standard three-colour DFS. Each back-edge (a dependency pointing at a table
/// still on the current stack) closes a cycle and is detected exactly once,
/// because every table is coloured grey then black a single time.
function checkAcyclic(world: World): Violation[] {
    const violations: Violation[] = [];
    const white = new Set(world.tables.keys());
    const gray = new Set<string>();

    const visit = (table: LoadedTable, stack: string[]): void => {
        const node = table.qualifiedName;
        white.delete(node);
        gray.add(node);
        stack.push(node);

        for (const dependency of table.definition.dependsOn) {
            const dependencyTable = world.tables.get(dependency);
            if (dependencyTable === undefined) {
                continue;
            }
            if (gray.has(dependency)) {
                const cycle = [
                    ...stack.slice(stack.indexOf(dependency)),
                    dependency,
                ];
                violations.push({
                    level: 'error',
                    code: 'DEPENDENCY_GRAPH_ACYCLIC',
                    ...base(table),
                    field: 'dependsOn',
                    message: `dependency cycle detected: ${cycle.join(' -> ')}`,
                });
            } else if (white.has(dependency)) {
                visit(dependencyTable, stack);
            }
        }

        stack.pop();
        gray.delete(node);
    };

    for (const table of world.tables.values()) {
        if (white.has(table.qualifiedName)) {
            visit(table, []);
        }
    }

    return violations;
}

/** All semantic rules, in execution order. */
export const RULES: readonly Rule[] = [
    checkPrimaryKey,
    checkDuplicateColumns,
    checkColumnTypes,
    checkPartitions,
    checkRawConsistency,
    checkDependsOnResolves,
    checkForeignKeys,
    checkAcyclic,
];

/**
 * Run all semantic rules over a world.
 *
 * @param world The loaded dataset root.
 * @returns Every semantic violation found.
 */
export function runSemanticRules(world: World): Violation[] {
    return RULES.flatMap((rule) => rule(world));
}
