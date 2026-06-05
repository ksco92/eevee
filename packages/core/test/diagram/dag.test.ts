/**
 * Tests for the dependency-DAG DOT builder.
 */

import {
    buildDagDot, 
} from '../../src/diagram/dag';
import {
    col,
    makeTable,
    makeWorld,
} from '../helpers';

function dagWorld() {
    return makeWorld([
        makeTable({
            schema: 'raw',
            name: 'a',
            isRawData: true,
            columns: [
                col('id', 'bigint'),
            ],
            primaryKey: [
                'id',
            ],
        }),
        makeTable({
            schema: 'analytics',
            name: 'b',
            isRawData: false,
            columns: [
                col('id', 'bigint'),
            ],
            primaryKey: [
                'id',
            ],
            dependsOn: [
                'raw.a',
                'ghost.x',
            ],
        }),
        makeTable({
            schema: 'analytics',
            name: 'c',
            isRawData: false,
            columns: [
                col('id', 'bigint'),
            ],
            primaryKey: [
                'id',
            ],
            dependsOn: [
                'analytics.b',
            ],
        }),
    ]);
}

test('builds a deterministic DAG with schema clusters and resolved edges', () => {
    const dot = buildDagDot(dagWorld());
    expect(dot).toContain('digraph dependencies {');
    expect(dot).toContain('subgraph "cluster_raw" {');
    expect(dot).toContain('subgraph "cluster_analytics" {');
    expect(dot).toContain('"raw.a" [label="a"];');
    expect(dot).toContain('"raw.a" -> "analytics.b";');
});

test('omits edges to unresolved dependencies', () => {
    const dot = buildDagDot(dagWorld());
    expect(dot).not.toContain('ghost.x');
});

test('output is stable across runs', () => {
    expect(buildDagDot(dagWorld())).toBe(buildDagDot(dagWorld()));
});
