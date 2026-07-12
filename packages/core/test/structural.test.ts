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

test('a partition may carry an optional fieldId', () => {
    const result = validateStructure('table', {
        ...validTable,
        tableType: 'iceberg_parquet_v2',
        partitions: [
            {
                name: 'a',
                type: 'identity',
                description: 'partition a',
                fieldId: 1000,
            },
        ],
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
});

test('an unknown property on a partition fails structural validation', () => {
    const result = validateStructure('table', {
        ...validTable,
        partitions: [
            {
                name: 'a',
                type: 'identity',
                description: 'partition a',
                surprise: true,
            },
        ],
    });
    expect(result.valid).toBe(false);
});

test('a column may not carry a partition fieldId', () => {
    const result = validateStructure('table', {
        ...validTable,
        columns: [
            {
                name: 'a',
                type: 'int',
                description: 'col a',
                fieldId: 1000,
            },
        ],
    });
    expect(result.valid).toBe(false);
});

test('a table may carry a valid dataQuality.awsDqdl pass-through', () => {
    const result = validateStructure('table', {
        ...validTable,
        dataQuality: {
            awsDqdl: [
                'ColumnValues "a" >= 0',
                'IsComplete "a"',
            ],
        },
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
});

test('a non-string dataQuality.awsDqdl entry fails structural validation', () => {
    const result = validateStructure('table', {
        ...validTable,
        dataQuality: {
            awsDqdl: [
                42,
            ],
        },
    });
    expect(result.valid).toBe(false);
});

test('an empty-string dataQuality.awsDqdl entry fails structural validation', () => {
    const result = validateStructure('table', {
        ...validTable,
        dataQuality: {
            awsDqdl: [
                '',
            ],
        },
    });
    expect(result.valid).toBe(false);
});

test('an unknown key inside dataQuality fails structural validation', () => {
    const result = validateStructure('table', {
        ...validTable,
        dataQuality: {
            awsDqdl: [
                'IsComplete "a"',
            ],
            surprise: true,
        },
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
