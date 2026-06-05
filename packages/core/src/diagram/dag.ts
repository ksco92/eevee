/**
 * Dependency-graph (DAG) rendering. Produces Graphviz DOT for the `dependsOn`
 * graph: one node per table (labelled with the table name only), clustered by
 * schema, with an edge from each upstream table to each downstream table.
 *
 * The DOT is built deterministically (schemas, tables, and edges are sorted) so
 * the rendered SVG is stable and diff-friendly.
 */

import {
    World,
} from '../world';

/** Escape a string for use inside a double-quoted DOT identifier or label. */
function escapeDot(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Build Graphviz DOT for the dependency DAG of a loaded root.
 *
 * @param world The loaded dataset root.
 * @returns A DOT `digraph` document.
 */
export function buildDagDot(world: World): string {
    const lines: string[] = [
        'digraph dependencies {',
        '    rankdir=LR;',
        '    node [shape=box, style=rounded];',
    ];

    const schemas = [
        ...world.schemas.values(),
    ].sort((a, b) => a.name.localeCompare(b.name));
    for (const schema of schemas) {
        lines.push(`    subgraph "cluster_${escapeDot(schema.name)}" {`);
        lines.push(`        label="${escapeDot(schema.name)}";`);
        const tables = [
            ...schema.tables,
        ].sort((a, b) => a.name.localeCompare(b.name));
        for (const table of tables) {
            lines.push(`        "${escapeDot(table.qualifiedName)}" [label="${escapeDot(table.name)}"];`);
        }
        lines.push('    }');
    }

    const tables = [
        ...world.tables.values(),
    ].sort((a, b) => a.qualifiedName.localeCompare(b.qualifiedName));
    for (const table of tables) {
        const dependencies = [
            ...table.definition.dependsOn,
        ].sort((a, b) => a.localeCompare(b));
        for (const dependency of dependencies) {
            if (world.tables.has(dependency)) {
                lines.push(`    "${escapeDot(dependency)}" -> "${escapeDot(table.qualifiedName)}";`);
            }
        }
    }

    lines.push('}');
    return lines.join('\n');
}
