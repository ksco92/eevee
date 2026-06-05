/**
 * Tests for the ported Iceberg type and transform logic.
 */

import {
    IcebergTransform,
    IcebergTransformKind,
    IcebergType,
    IcebergTypeKind,
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

test('unknown iceberg types are rejected', () => {
    expect(parseIcebergType('struct<a:int>')).toBeNull();
    expect(isValidIcebergType('whatever')).toBe(false);
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
