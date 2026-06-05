/**
 * Entity-relationship (ER) rendering. Produces Graphviz DOT where each table is
 * an HTML-label node listing its columns (primary-key columns marked `PK`), with
 * a foreign-key edge from each table to the table it references.
 *
 * Built deterministically (tables and foreign keys sorted; columns kept in
 * declared order) for stable, diff-friendly SVG output.
 */

import {
    World,
} from '../world';

/** Escape text for inclusion in a Graphviz HTML-like label. */
function htmlEscape(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Escape a string for a double-quoted DOT identifier or attribute value. */
function escapeDot(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Build Graphviz DOT for the entity-relationship diagram of a loaded root.
 *
 * @param world The loaded dataset root.
 * @returns A DOT `digraph` document.
 */
export function buildErDot(world: World): string {
    const lines: string[] = [
        'digraph er {',
        '    rankdir=LR;',
        '    node [shape=plaintext];',
    ];

    const tables = [
        ...world.tables.values(),
    ].sort((a, b) => a.qualifiedName.localeCompare(b.qualifiedName));

    for (const table of tables) {
        const primaryKey = new Set(table.definition.primaryKey);
        lines.push(`    "${escapeDot(table.qualifiedName)}" [label=<`);
        lines.push('        <table border="0" cellborder="1" cellspacing="0">');
        lines.push(`        <tr><td bgcolor="lightgrey"><b>${htmlEscape(table.qualifiedName)}</b></td></tr>`);
        for (const column of table.definition.columns) {
            const marker = primaryKey.has(column.name) ? 'PK ' : '';
            const cell = `${htmlEscape(marker + column.name)} : ${htmlEscape(column.type)}`;
            lines.push(`        <tr><td align="left">${cell}</td></tr>`);
        }
        lines.push('        </table>');
        lines.push('    >];');
    }

    for (const table of tables) {
        const foreignKeys = [
            ...table.definition.foreignKeys,
        ].sort(
            (a, b) => `${a.sourceTable} ${a.localColumn}`.localeCompare(`${b.sourceTable} ${b.localColumn}`),
        );
        for (const foreignKey of foreignKeys) {
            if (world.tables.has(foreignKey.sourceTable)) {
                lines.push(
                    `    "${escapeDot(table.qualifiedName)}" -> "${escapeDot(foreignKey.sourceTable)}" `
                    + `[label="${escapeDot(foreignKey.localColumn)}"];`,
                );
            }
        }
    }

    lines.push('}');
    return lines.join('\n');
}
