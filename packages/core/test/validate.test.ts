/**
 * End-to-end tests for `validateRoot`.
 */

import * as path from 'path';

import {
    validateRoot, 
} from '../src/validate';
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
