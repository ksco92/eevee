/**
 * Tests for the filesystem loader.
 */

import * as path from 'path';

import {
    loadRoot, 
} from '../src/loader';
import {
    codes, 
} from './helpers';

const EXAMPLES = path.resolve(__dirname, '../../../examples');

function fixture(name: string): string {
    return path.resolve(__dirname, 'fixtures', name);
}

test('loads the example root cleanly', () => {
    const {
        world, violations, 
    } = loadRoot(EXAMPLES);
    expect(violations).toHaveLength(0);
    expect(world.tables.size).toBe(4);
    expect(world.schemas.get('raw')?.description).not.toBeNull();
    expect(world.tables.get('analytics.orders')?.structurallyValid).toBe(true);

    const orders = world.tables.get('analytics.orders');
    const orderId = orders?.definition.columns.find((column) => column.name === 'order_id');
    expect(orderId?.nullable).toBe(false);
    expect(orders?.definition.formatVersion).toBe(2);
    expect(orders?.definition.sortOrder).toHaveLength(2);
    expect(orders?.definition.sortOrder[0].transform).toBeUndefined();
    expect(orders?.definition.sortOrder[1].transform).toBe('day');
    expect(orders?.definition.identifierFields).toEqual([
        'order_id',
    ]);

    const customers = world.tables.get('analytics.customers');
    expect(customers?.definition.indexes).toHaveLength(1);
    expect(customers?.definition.indexes[0].unique).toBe(true);
    expect(customers?.definition.indexes[0].columns[0].sort).toBe('asc');
    expect(customers?.definition.indexes[0].include).toEqual([
        'is_active',
    ]);
    expect(customers?.definition.uniqueConstraints).toHaveLength(1);
    expect(customers?.definition.uniqueConstraints[0].columns).toEqual([
        'email',
    ]);
    expect(customers?.definition.checkConstraints).toHaveLength(1);
    expect(customers?.definition.checkConstraints[0].columns).toEqual([
        'lifetime_value',
    ]);
    const generatedColumn = customers?.definition.columns.find((column) => column.name === 'lifetime_value_cents');
    expect(generatedColumn?.generated).toBe('stored');
    expect(generatedColumn?.expressionColumns).toEqual([
        'lifetime_value',
    ]);
    const identityColumn = customers?.definition.columns.find((column) => column.name === 'customer_id');
    expect(identityColumn?.identity).toBe('always');
    const defaultColumn = customers?.definition.columns.find((column) => column.name === 'is_active');
    expect(defaultColumn?.default).toBe('true');
    const emailColumn = customers?.definition.columns.find((column) => column.name === 'email');
    expect(emailColumn?.collation).toBe('en_US');
    expect(emailColumn?.compression).toBe('lz4');
    expect(emailColumn?.storage).toBe('extended');

    const customersRaw = world.tables.get('raw.customers_raw');
    expect(customersRaw?.definition.bucketing?.bucketCount).toBe(16);
    expect(customersRaw?.definition.bucketing?.columns).toEqual([
        'id',
    ]);
    expect(customersRaw?.definition.bucketing?.sortedBy[0].direction).toBe('asc');
});

test('reports a JSON parse error', () => {
    const {
        violations, 
    } = loadRoot(fixture('parse-error'));
    expect(codes(violations)).toContain('FILE_PARSE_ERROR');
});

test('reports a missing schema-description file', () => {
    const {
        world, violations, 
    } = loadRoot(fixture('missing-desc'));
    expect(codes(violations)).toContain('SCHEMA_DESC_PRESENT');
    expect(world.schemas.get('m')?.description).toBeNull();
});

test('normalizes a structurally invalid table without throwing', () => {
    const {
        world, violations, 
    } = loadRoot(fixture('malformed'));
    expect(codes(violations)).toContain('SCHEMA_VALIDATION');

    const table = world.tables.get('ms.bad_types');
    expect(table?.structurallyValid).toBe(false);
    expect(table?.definition.columns).toHaveLength(2);
    expect(table?.definition.columns[0].name).toBe('');
    expect(table?.definition.columns[1].name).toBe('a');
    expect(table?.definition.partitions).toHaveLength(0);
    expect(table?.definition.tableProperties).toEqual({
        'good.key': 'ok',
    });
    expect(table?.definition.bucketing?.bucketCount).toBe(0);
    expect(table?.definition.exclusionConstraints[0].elements[0].column).toBe('a');
    expect(table?.definition.exclusionConstraints[0].elements[0].operator).toBe('=');
    expect(table?.definition.primaryKey).toEqual([
        'a',
    ]);
    expect(table?.definition.isRawData).toBe(false);
    expect(table?.definition.foreignKeys[0].allowNulls).toBe(false);
});

test('reports a structurally invalid schema-description file', () => {
    const {
        violations, 
    } = loadRoot(fixture('bad-schema-desc'));
    const schemaErrors = violations.filter((violation) => violation.code === 'SCHEMA_VALIDATION' && violation.table === undefined);
    expect(schemaErrors.length).toBeGreaterThan(0);
});

test('skips hidden directories at the root', () => {
    const {
        world, violations, 
    } = loadRoot(fixture('hidden-dirs'));
    expect([
        ...world.schemas.keys(),
    ]).toEqual([
        'real',
    ]);
    expect(violations.some((violation) => violation.schema === '.hidden')).toBe(false);
});

test('reports schema and table names that are not lowercase snake_case', () => {
    const {
        violations, 
    } = loadRoot(fixture('bad-names'));
    const reported = codes(violations);
    expect(reported).toContain('SCHEMA_NAME_VALID');
    expect(reported).toContain('TABLE_NAME_VALID');
});

test('throws when the root is not a directory', () => {
    expect(() => loadRoot(path.resolve(__dirname, 'fixtures', 'does-not-exist'))).toThrow('not a directory');
});
