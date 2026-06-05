/**
 * Tests for the per-engine column-type registries.
 */

import {
    isValidHiveType,
    isValidPostgresType,
} from '../src/types';

/// Hive

test('hive primitives and parameterized scalars validate', () => {
    expect(isValidHiveType('bigint')).toBe(true);
    expect(isValidHiveType('double precision')).toBe(true);
    expect(isValidHiveType('decimal(10,2)')).toBe(true);
    expect(isValidHiveType('varchar(255)')).toBe(true);
    expect(isValidHiveType('char(3)')).toBe(true);
});

test('hive nested types validate recursively', () => {
    expect(isValidHiveType('array<int>')).toBe(true);
    expect(isValidHiveType('map<string,int>')).toBe(true);
    expect(isValidHiveType('struct<a:int,b:array<string>>')).toBe(true);
    expect(isValidHiveType('uniontype<int,string>')).toBe(true);
});

test('hive rejects malformed nested and unknown types', () => {
    expect(isValidHiveType('array<int,int>')).toBe(false);
    expect(isValidHiveType('map<int>')).toBe(false);
    expect(isValidHiveType('struct<:int>')).toBe(false);
    expect(isValidHiveType('struct<a>')).toBe(false);
    expect(isValidHiveType('list<int>')).toBe(false);
    expect(isValidHiveType('nope')).toBe(false);
});

/// Postgres

test('postgres exact and multiword types validate', () => {
    expect(isValidPostgresType('integer')).toBe(true);
    expect(isValidPostgresType('timestamp with time zone')).toBe(true);
    expect(isValidPostgresType('double precision')).toBe(true);
    expect(isValidPostgresType('jsonb')).toBe(true);
});

test('postgres parameterized types validate', () => {
    expect(isValidPostgresType('varchar(320)')).toBe(true);
    expect(isValidPostgresType('numeric(12,2)')).toBe(true);
    expect(isValidPostgresType('bit(8)')).toBe(true);
    expect(isValidPostgresType('timestamp(3)')).toBe(true);
});

test('postgres array suffixes are accepted', () => {
    expect(isValidPostgresType('integer[]')).toBe(true);
    expect(isValidPostgresType('text[][]')).toBe(true);
    expect(isValidPostgresType('numeric(10,2)[]')).toBe(true);
});

test('postgres rejects bad parameters and unknown types', () => {
    expect(isValidPostgresType('integer(3)')).toBe(false);
    expect(isValidPostgresType('varchar(abc)')).toBe(false);
    expect(isValidPostgresType('nope')).toBe(false);
});
