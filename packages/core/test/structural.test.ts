/**
 * Tests for Layer 1 structural (JSON Schema) validation.
 */

import {
    validateStructure, 
} from '../src/structural';

const validTable = {
    specVersion: '0',
    description: 'A table.',
    tableType: 'hive_parquet',
    isRawData: true,
    columns: [
        {
            name: 'a',
            type: 'int',
            description: 'col a',
        },
    ],
    primaryKey: [
        'a',
    ],
};

test('a well-formed table passes structural validation', () => {
    const result = validateStructure('table', validTable);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
});

test('a missing required field fails structural validation', () => {
    const {
        specVersion, ...withoutVersion 
    } = validTable;
    void specVersion;
    const result = validateStructure('table', withoutVersion);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((error) => error.message.includes('(root)'))).toBe(true);
});

test('an unknown property fails structural validation', () => {
    const result = validateStructure('table', {
        ...validTable,
        surprise: true,
    });
    expect(result.valid).toBe(false);
});

test('a bad enum value fails structural validation', () => {
    const result = validateStructure('table', {
        ...validTable,
        tableType: 'mysql',
    });
    expect(result.valid).toBe(false);
});

test('a well-formed schema description passes', () => {
    const result = validateStructure('schema', {
        specVersion: '0',
        description: 'A schema.',
    });
    expect(result.valid).toBe(true);
});

test('an empty schema description fails', () => {
    const result = validateStructure('schema', {
        specVersion: '0',
        description: '',
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('description');
});
