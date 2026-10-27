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
                col('total', 'decimal(10,2)'),
                col('ghost_id', 'bigint'),
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
                    localColumn: 'ghost_id',
                    allowNulls: true,
                },
            ],
        }),
        makeTable({
            schema: 'analytics',
            name: 'order_notes',
            isRawData: false,
            columns: [
                col('order_id', 'bigint'),
                col('note', 'string'),
            ],
            primaryKey: [
                'order_id',
            ],
            dependsOn: [
                'analytics.orders',
            ],
            foreignKeys: [
                {
                    sourceTable: 'analytics.orders',
                    sourceColumn: 'order_id',
                    localColumn: 'order_id',
                    allowNulls: false,
                },
            ],
        }),
        makeTable({
            schema: 'analytics',
            name: 'events',
            isRawData: true,
            columns: [
                col('payload', 'string'),
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
    expect(dot).toContain('PK order_id : bigint');
    expect(dot).toContain('FK customer_id : bigint');
    expect(dot).toContain('PK FK order_id : bigint');
});

test('draws foreign-key edges only for resolved targets', () => {
    const dot = buildErDot(erWorld());
    expect(dot).toContain('"analytics.orders" -> "analytics.customers" [label="customer_id"];');
    expect(dot).not.toContain('ghost.missing');
});

test('output is stable across runs', () => {
    expect(buildErDot(erWorld())).toBe(buildErDot(erWorld()));
});

test('keys-only keeps primary-key and foreign-key columns in declared order', () => {
    const dot = buildErDot(erWorld(), {
        keysOnly: true,
    });
    expect(dot).toContain('PK id : bigint');
    expect(dot).toContain('FK customer_id : bigint');
    expect(dot).toContain('PK FK order_id : bigint');
    expect(dot).toContain('<b>analytics.events</b>');
    expect(dot).toContain('"analytics.orders" -> "analytics.customers" [label="customer_id"];');
    expect(dot).not.toContain('tags :');
    expect(dot).not.toContain('total :');
    expect(dot).not.toContain('note :');
    expect(dot).not.toContain('payload :');
    expect(dot.indexOf('PK order_id : bigint')).toBeLessThan(dot.indexOf('FK customer_id : bigint'));
});

test('keysOnly false and omitted options list every column', () => {
    const dot = buildErDot(erWorld());
    expect(buildErDot(erWorld(), {
        keysOnly: false,
    })).toBe(dot);
    expect(dot).toContain('total : decimal(10,2)');
    expect(dot).toContain('payload : string');
});
