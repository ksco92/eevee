/**
 * Tests for the entity-relationship DOT builder.
 */

import {
    buildErDot, 
} from '../../src/diagram/er';
import {
    col,
    makeTable,
    makeWorld,
} from '../helpers';

function erWorld() {
    return makeWorld([
        makeTable({
            schema: 'analytics',
            name: 'customers',
            isRawData: true,
            columns: [
                col('id', 'bigint'),
                col('tags', 'map<string,int>'),
            ],
            primaryKey: [
                'id',
            ],
        }),
        makeTable({
            schema: 'analytics',
            name: 'orders',
            isRawData: false,
            columns: [
                col('order_id', 'bigint'),
                col('customer_id', 'bigint'),
            ],
            primaryKey: [
                'order_id',
            ],
            dependsOn: [
                'analytics.customers',
            ],
            foreignKeys: [
                {
                    sourceTable: 'analytics.customers',
                    sourceColumn: 'id',
                    localColumn: 'customer_id',
                    allowNulls: false,
                },
                {
                    sourceTable: 'ghost.missing',
                    sourceColumn: 'id',
                    localColumn: 'order_id',
                    allowNulls: true,
                },
            ],
        }),
    ]);
}

test('renders tables with primary-key markers and escaped types', () => {
    const dot = buildErDot(erWorld());
    expect(dot).toContain('digraph er {');
    expect(dot).toContain('<b>analytics.customers</b>');
    expect(dot).toContain('PK id : bigint');
    expect(dot).toContain('tags : map&lt;string,int&gt;');
    expect(dot).toContain('order_id : bigint');
});

test('draws foreign-key edges only for resolved targets', () => {
    const dot = buildErDot(erWorld());
    expect(dot).toContain('"analytics.orders" -> "analytics.customers" [label="customer_id"];');
    expect(dot).not.toContain('ghost.missing');
});

test('output is stable across runs', () => {
    expect(buildErDot(erWorld())).toBe(buildErDot(erWorld()));
});
