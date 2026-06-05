/**
 * Top-level validation: load a dataset root (Layer 1) and run the semantic
 * rules (Layer 2), aggregating every violation.
 */

import {
    ValidationResult, 
} from './model';
import {
    loadRoot, 
} from './loader';
import {
    runSemanticRules, 
} from './rules';

/**
 * Validate a dataset root.
 *
 * @param rootDir Path to the dataset root.
 * @returns The aggregate result. `ok` is false when any error-level violation exists.
 * @throws Error When `rootDir` is not an existing directory.
 */
export function validateRoot(rootDir: string): ValidationResult {
    const {
        world, violations, 
    } = loadRoot(rootDir);
    const semantic = runSemanticRules(world);
    const all = [
        ...violations,
        ...semantic,
    ];
    const ok = !all.some((violation) => violation.level === 'error');
    return {
        ok,
        violations: all,
    };
}
