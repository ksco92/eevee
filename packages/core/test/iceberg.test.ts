/**
 * Tests for the ported Iceberg type and transform logic.
 */

import {
    analyzeIcebergType,
    IcebergTransform,
    IcebergTransformKind,
    IcebergType,
    IcebergTypeKind,
    isNestedIcebergType,
    isValidIcebergType,
    parseIcebergTransform,
    parseIcebergType,
    transformLegalOnType,
} from '../src/iceberg';

function typeOf(kind: IcebergTypeKind): IcebergType {
    return {
        kind,
    };
}

function transform(kind: IcebergTransformKind): IcebergTransform {
    return {
        kind,
    };
}

/// parseIcebergType

test('primitive iceberg types parse', () => {
    expect(parseIcebergType('long')).toEqual({
        kind: IcebergTypeKind.LONG,
    });
    expect(isValidIcebergType('timestamptz')).toBe(true);
});

test('decimal parses within bounds and rejects out of bounds', () => {
    expect(parseIcebergType('decimal(10,2)')).toEqual({
        kind: IcebergTypeKind.DECIMAL,
        decimalPrecision: 10,
        decimalScale: 2,
    });
    expect(parseIcebergType('decimal(0,0)')).toBeNull();
    expect(parseIcebergType('decimal(39,2)')).toBeNull();
    expect(parseIcebergType('decimal(5,9)')).toBeNull();
});

test('fixed parses with a positive length and rejects zero', () => {
    expect(parseIcebergType('fixed[16]')).toEqual({
        kind: IcebergTypeKind.FIXED,
        fixedLength: 16,
    });
    expect(parseIcebergType('fixed[0]')).toBeNull();
});

test('unknown scalar iceberg types are rejected as UNKNOWN', () => {
    expect(parseIcebergType('whatever')).toBeNull();
    expect(isValidIcebergType('whatever')).toBe(false);
    const result = analyzeIcebergType('whatever');
    expect(result.ok).toBe(false);
    if (!result.ok) {
        expect(result.code).toBe('UNKNOWN');
    }
});

/// Nested iceberg types

test('struct parses into ordered fields', () => {
    expect(parseIcebergType('struct<polarity:double,neg:double,neu:double,pos:double>')).toEqual({
        kind: IcebergTypeKind.STRUCT,
        structFields: [
            {
                name: 'polarity',
                type: {
                    kind: IcebergTypeKind.DOUBLE,
                },
            },
            {
                name: 'neg',
                type: {
                    kind: IcebergTypeKind.DOUBLE,
                },
            },
            {
                name: 'neu',
                type: {
                    kind: IcebergTypeKind.DOUBLE,
                },
            },
            {
                name: 'pos',
                type: {
                    kind: IcebergTypeKind.DOUBLE,
                },
            },
        ],
    });
});

test('list parses into an element type', () => {
    expect(parseIcebergType('list<string>')).toEqual({
        kind: IcebergTypeKind.LIST,
        elementType: {
            kind: IcebergTypeKind.STRING,
        },
    });
});

test('map parses into key and value types', () => {
    expect(parseIcebergType('map<string,long>')).toEqual({
        kind: IcebergTypeKind.MAP,
        keyType: {
            kind: IcebergTypeKind.STRING,
        },
        valueType: {
            kind: IcebergTypeKind.LONG,
        },
    });
});

test('nested types recurse and preserve inner parameterized types', () => {
    expect(parseIcebergType('struct<a:struct<b:int>,c:list<map<string,decimal(20,10)>>>')).toEqual({
        kind: IcebergTypeKind.STRUCT,
        structFields: [
            {
                name: 'a',
                type: {
                    kind: IcebergTypeKind.STRUCT,
                    structFields: [
                        {
                            name: 'b',
                            type: {
                                kind: IcebergTypeKind.INT,
                            },
                        },
                    ],
                },
            },
            {
                name: 'c',
                type: {
                    kind: IcebergTypeKind.LIST,
                    elementType: {
                        kind: IcebergTypeKind.MAP,
                        keyType: {
                            kind: IcebergTypeKind.STRING,
                        },
                        valueType: {
                            kind: IcebergTypeKind.DECIMAL,
                            decimalPrecision: 20,
                            decimalScale: 10,
                        },
                    },
                },
            },
        ],
    });
});

test('nested constructors are case-insensitive and tolerate whitespace', () => {
    expect(isValidIcebergType('STRUCT< a : INT , b : STRING >')).toBe(true);
    expect(parseIcebergType('LIST<Long>')).toEqual({
        kind: IcebergTypeKind.LIST,
        elementType: {
            kind: IcebergTypeKind.LONG,
        },
    });
});

test('isNestedIcebergType distinguishes nested from scalar types', () => {
    expect(isNestedIcebergType({
        kind: IcebergTypeKind.STRUCT,
    })).toBe(true);
    expect(isNestedIcebergType({
        kind: IcebergTypeKind.LIST,
    })).toBe(true);
    expect(isNestedIcebergType({
        kind: IcebergTypeKind.MAP,
    })).toBe(true);
    expect(isNestedIcebergType({
        kind: IcebergTypeKind.LONG,
    })).toBe(false);
});

test('malformed nested types are rejected as MALFORMED', () => {
    const cases = [
        'struct<a:int',
        'struct<>',
        'struct<a>',
        'struct<:int>',
        'struct<a b:int>',
        'list<>',
        'list<int,long>',
        'map<string>',
        'map<string,int,long>',
        'list<not_a_type>',
        'struct<a:not_a_type>',
        'map<not_a_type,int>',
        'map<string,not_a_type>',
        'struct<a:int]>',
        'map<string)>',
    ];
    for (const typeStr of cases) {
        const result = analyzeIcebergType(typeStr);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.code).toBe('MALFORMED');
        }
    }
});

test('duplicate struct field names are rejected as DUPLICATE_FIELD', () => {
    const result = analyzeIcebergType('struct<a:int,a:long>');
    expect(result.ok).toBe(false);
    if (!result.ok) {
        expect(result.code).toBe('DUPLICATE_FIELD');
    }
    expect(parseIcebergType('struct<a:int,a:long>')).toBeNull();
});

test('a duplicate field nested inside another struct keeps its precise code', () => {
    const result = analyzeIcebergType('struct<outer:struct<a:int,a:long>>');
    expect(result.ok).toBe(false);
    if (!result.ok) {
        expect(result.code).toBe('DUPLICATE_FIELD');
    }
});

test('nested source types are never legal transform targets', () => {
    expect(transformLegalOnType(transform(IcebergTransformKind.IDENTITY), typeOf(IcebergTypeKind.STRUCT))).toBe(false);
    expect(transformLegalOnType(transform(IcebergTransformKind.VOID), typeOf(IcebergTypeKind.LIST))).toBe(false);
});

test('iceberg type and transform parsing is case-insensitive', () => {
    expect(parseIcebergType('LONG')).toEqual({
        kind: IcebergTypeKind.LONG,
    });
    expect(parseIcebergTransform('DAY')).toEqual({
        kind: IcebergTransformKind.DAY,
    });
});

test('decimal tolerates surrounding whitespace', () => {
    expect(parseIcebergType('decimal( 10 , 2 )')).toEqual({
        kind: IcebergTypeKind.DECIMAL,
        decimalPrecision: 10,
        decimalScale: 2,
    });
});

/// parseIcebergTransform

test('nullary transforms parse', () => {
    expect(parseIcebergTransform('identity')).toEqual({
        kind: IcebergTransformKind.IDENTITY,
    });
    expect(parseIcebergTransform('year')).toEqual({
        kind: IcebergTransformKind.YEAR,
    });
});

test('parameterized transforms parse and validate the parameter', () => {
    expect(parseIcebergTransform('bucket[16]')).toEqual({
        kind: IcebergTransformKind.BUCKET,
        param: 16,
    });
    expect(parseIcebergTransform('truncate[8]')).toEqual({
        kind: IcebergTransformKind.TRUNCATE,
        param: 8,
    });
    expect(parseIcebergTransform('bucket[0]')).toBeNull();
    expect(parseIcebergTransform('truncate[0]')).toBeNull();
});

test('unknown transforms are rejected', () => {
    expect(parseIcebergTransform('decade')).toBeNull();
});

/// transformLegalOnType

test('identity and void are legal on any type', () => {
    expect(transformLegalOnType(transform(IcebergTransformKind.IDENTITY), typeOf(IcebergTypeKind.STRING))).toBe(true);
    expect(transformLegalOnType(transform(IcebergTransformKind.VOID), typeOf(IcebergTypeKind.BOOLEAN))).toBe(true);
});

test('year/month/day require a temporal type', () => {
    expect(transformLegalOnType(transform(IcebergTransformKind.YEAR), typeOf(IcebergTypeKind.DATE))).toBe(true);
    expect(transformLegalOnType(transform(IcebergTransformKind.MONTH), typeOf(IcebergTypeKind.TIMESTAMP))).toBe(true);
    expect(transformLegalOnType(transform(IcebergTransformKind.DAY), typeOf(IcebergTypeKind.STRING))).toBe(false);
});

test('hour requires a timestamp type', () => {
    expect(transformLegalOnType(transform(IcebergTransformKind.HOUR), typeOf(IcebergTypeKind.TIMESTAMPTZ))).toBe(true);
    expect(transformLegalOnType(transform(IcebergTransformKind.HOUR), typeOf(IcebergTypeKind.DATE))).toBe(false);
});

test('bucket is legal on hashable types and illegal on float', () => {
    expect(transformLegalOnType(transform(IcebergTransformKind.BUCKET), typeOf(IcebergTypeKind.STRING))).toBe(true);
    expect(transformLegalOnType(transform(IcebergTransformKind.BUCKET), typeOf(IcebergTypeKind.FLOAT))).toBe(false);
});

test('truncate is legal on int/string/decimal and illegal on date', () => {
    expect(transformLegalOnType(transform(IcebergTransformKind.TRUNCATE), typeOf(IcebergTypeKind.INT))).toBe(true);
    expect(transformLegalOnType(transform(IcebergTransformKind.TRUNCATE), typeOf(IcebergTypeKind.DATE))).toBe(false);
});
