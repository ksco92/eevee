/**
 * The world: the in-memory representation of a loaded dataset root, plus the
 * top-level semantic-rule runner.
 *
 * A `World` holds every schema and every table (as a concrete
 * `TableTypeBase` instance). `runSemanticRules` walks the world, asking each
 * structurally-valid table for its intra-table and cross-file violations,
 * then appends the one global rule that has to see the whole graph at once
 * (cycle detection).
 */

import {
    SchemaDescription,
    Violation,
} from './model';
import type {
    TableTypeBase,
} from './table-type';

/** A schema loaded from disk. */
export interface LoadedSchema {
    /** Schema name (the folder name). */
    readonly name: string;

    /** Absolute path to the schema folder. */
    readonly dirPath: string;

    /** Description from `<schema>.json`, or null if that file is missing. */
    readonly description: SchemaDescription | null;

    /** Tables in this schema. */
    readonly tables: TableTypeBase[];
}

/** The whole loaded dataset root. */
export interface World {
    /** Absolute path to the root. */
    readonly rootDir: string;

    /** Schemas keyed by name. */
    readonly schemas: Map<string, LoadedSchema>;

    /** Tables keyed by `schema.table`. */
    readonly tables: Map<string, TableTypeBase>;
}

/// DEPENDENCY_GRAPH_ACYCLIC — the dependsOn graph has no cycles.
///
/// Standard three-colour DFS. Each back-edge (a dependency pointing at a table
/// still on the current stack) closes a cycle and is detected exactly once,
/// because every table is coloured grey then black a single time. This rule
/// stays a free function because it operates on the whole graph at once, not
/// on any single table in isolation.
function acyclicViolations(world: World): Violation[] {
    const violations: Violation[] = [];
    const white = new Set(world.tables.keys());
    const gray = new Set<string>();

    const visit = (table: TableTypeBase, stack: string[]): void => {
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
                    schema: table.schema,
                    table: table.name,
                    path: table.filePath,
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

/**
 * Run all semantic rules over a world.
 *
 * @param world The loaded dataset root.
 * @returns Every semantic violation found.
 */
export function runSemanticRules(world: World): Violation[] {
    const violations: Violation[] = [];
    for (const table of world.tables.values()) {
        if (!table.structurallyValid) {
            continue;
        }
        violations.push(...table.intraTableViolations());
        violations.push(...table.crossFileViolations(world));
    }
    violations.push(...acyclicViolations(world));
    return violations;
}
