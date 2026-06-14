/**
 * Top-level validation: load a dataset root (Layer 1) and run the semantic
 * rules (Layer 2), aggregating every violation.
 */

import {
    ValidationResult,
    Violation,
} from './model';
import {
    loadRoot,
} from './loader';
import {
    runSemanticRules,
    World,
} from './world';

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

/**
 * Format a single violation as one human-readable line:
 * `LEVEL [CODE] schema.table (field): message`. The location and field
 * segments are omitted when absent.
 *
 * @param violation The violation to format.
 * @returns The formatted line (no leading or trailing whitespace).
 */
export function formatViolation(violation: Violation): string {
    const location = [
        violation.schema,
        violation.table,
    ].filter(Boolean).join('.');
    const where = location ? ` ${location}` : '';
    const field = violation.field ? ` (${violation.field})` : '';
    return `${violation.level.toUpperCase()} [${violation.code}]${where}${field}: ${violation.message}`;
}

/** Options for {@link loadValidatedRoot}. */
export interface LoadValidatedOptions {
    /**
     * Called once for each surviving warning-level violation, in load order.
     * Warnings never fail the load; this is the hook for surfacing them.
     */
    readonly onWarning?: (warning: Violation) => void;
}

/**
 * Load a dataset root, run full validation (structural + semantic), and return
 * the validated world. Throws when any error-level violation exists; warnings
 * do not fail the load and are delivered to `options.onWarning` if provided.
 *
 * @param rootDir Path to the dataset root.
 * @param options Optional callbacks, including `onWarning`.
 * @returns The validated World.
 * @throws Error When `rootDir` is not a directory, or any error-level violation is found.
 */
export function loadValidatedRoot(rootDir: string, options?: LoadValidatedOptions): World {
    const {
        world, violations,
    } = loadRoot(rootDir);
    const all = [
        ...violations,
        ...runSemanticRules(world),
    ];

    const errors = all.filter((violation) => violation.level === 'error');
    if (errors.length > 0) {
        const detail = errors.map(formatViolation).join('\n');
        throw new Error(`validation failed for "${rootDir}":\n${detail}`);
    }

    if (options?.onWarning) {
        for (const warning of all) {
            if (warning.level === 'warning') {
                options.onWarning(warning);
            }
        }
    }

    return world;
}
