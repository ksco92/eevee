/**
 * End-to-end tests for `validateRoot`.
 */

import * as path from 'path';

import {
    formatViolation,
    loadValidatedRoot,
    validateRoot,
} from '../src/validate';
import {
    Violation,
} from '../src/model';
import {
    codes,
} from './helpers';

const EXAMPLES = path.resolve(__dirname, '../../../examples');

function fixture(name: string): string {
    return path.resolve(__dirname, 'fixtures', name);
}

test('the example root validates cleanly', () => {
    const result = validateRoot(EXAMPLES);
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
});

test('a semantic error makes validation fail', () => {
    const result = validateRoot(fixture('broken'));
    expect(result.ok).toBe(false);
    expect(codes(result.violations)).toContain('NONRAW_REQUIRES_DEPENDS_ON');
});

test('warnings alone do not fail validation', () => {
    const result = validateRoot(fixture('warning'));
    expect(result.ok).toBe(true);
    expect(codes(result.violations)).toContain('FK_SOURCE_IS_KEY');
    expect(result.violations.filter((violation) => violation.level === 'error')).toHaveLength(0);
});

test('loadValidatedRoot returns the world for a clean root', () => {
    const world = loadValidatedRoot(EXAMPLES);
    expect(world.rootDir).toBe(EXAMPLES);
    expect(world.tables.size).toBeGreaterThan(0);
});

test('loadValidatedRoot throws on error-level violations with a formatted message', () => {
    expect(() => loadValidatedRoot(fixture('broken'))).toThrow(/validation failed for/);
    expect(() => loadValidatedRoot(fixture('broken'))).toThrow(/NONRAW_REQUIRES_DEPENDS_ON/);
});

test('loadValidatedRoot does not throw on warnings and delivers them to onWarning', () => {
    const warnings: Violation[] = [];
    const world = loadValidatedRoot(fixture('warning'), {
        onWarning: (warning) => warnings.push(warning),
    });
    expect(world.tables.size).toBeGreaterThan(0);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.every((warning) => warning.level === 'warning')).toBe(true);
    expect(codes(warnings)).toContain('FK_SOURCE_IS_KEY');
});

test('loadValidatedRoot tolerates a clean root with no onWarning callback', () => {
    expect(() => loadValidatedRoot(EXAMPLES)).not.toThrow();
});

test('formatViolation renders level, code, location, field, and message', () => {
    const line = formatViolation({
        level: 'error',
        code: 'PK_COLUMNS_EXIST',
        schema: 'analytics',
        table: 'orders',
        field: 'primaryKey',
        message: 'column "missing" does not exist',
    });
    expect(line).toBe('ERROR [PK_COLUMNS_EXIST] analytics.orders (primaryKey): column "missing" does not exist');
});

test('formatViolation omits absent location and field segments', () => {
    const line = formatViolation({
        level: 'warning',
        code: 'SOME_RULE',
        message: 'heads up',
    });
    expect(line).toBe('WARNING [SOME_RULE]: heads up');
});
