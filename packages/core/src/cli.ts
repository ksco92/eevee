#!/usr/bin/env node
/**
 * `fdd` command-line interface.
 *
 * v0 ships the `validate` command. Diagram commands (`graph`, `er`) arrive in a
 * later milestone. The CLI is a thin shell over the library; all logic and tests
 * live in the modules it calls.
 */

import {
    validateRoot, 
} from './validate';
import {
    ValidationResult, Violation, 
} from './model';

const USAGE = `fdd — Flexible Dataset Definition validator

Usage:
  fdd validate <root> [--format json|human]
  fdd help

Options:
  --format   Output format for "validate" (default: human).`;

function formatViolation(violation: Violation): string {
    const location = [
        violation.schema,
        violation.table,
    ].filter(Boolean).join('.');
    const where = location ? ` ${location}` : '';
    const field = violation.field ? ` (${violation.field})` : '';
    return `  ${violation.level.toUpperCase()} [${violation.code}]${where}${field}: ${violation.message}`;
}

function printHuman(result: ValidationResult): void {
    const errors = result.violations.filter((violation) => violation.level === 'error');
    const warnings = result.violations.filter((violation) => violation.level === 'warning');

    for (const violation of result.violations) {
        const line = formatViolation(violation);
        if (violation.level === 'error') {
            console.error(line);
        } else {
            console.warn(line);
        }
    }

    if (result.ok) {
        console.log(`OK — ${warnings.length} warning(s), 0 error(s).`);
    } else {
        console.error(`FAILED — ${errors.length} error(s), ${warnings.length} warning(s).`);
    }
}

function runValidate(rest: string[]): number {
    let format = 'human';
    const positional: string[] = [];
    for (let i = 0; i < rest.length; i += 1) {
        if (rest[i] === '--format') {
            i += 1;
            format = rest[i] ?? 'human';
        } else {
            positional.push(rest[i]);
        }
    }

    const root = positional[0];
    if (!root) {
        console.error('usage: fdd validate <root> [--format json|human]');
        return 1;
    }

    if (format !== 'human' && format !== 'json') {
        console.error(`unknown format "${format}" (expected "human" or "json")`);
        return 1;
    }

    let result: ValidationResult;
    try {
        result = validateRoot(root);
    } catch (error) {
        console.error((error as Error).message);
        return 1;
    }

    if (format === 'json') {
        console.log(JSON.stringify({
            ok: result.ok,
            violations: result.violations,
        }, null, 2));
    } else {
        printHuman(result);
    }

    return result.ok ? 0 : 1;
}

function main(argv: string[]): number {
    const args = argv.slice(2);
    const command = args[0];

    if (!command) {
        console.error(USAGE);
        return 1;
    }
    if (command === 'help' || command === '--help' || command === '-h') {
        console.log(USAGE);
        return 0;
    }
    if (command === 'validate') {
        return runValidate(args.slice(1));
    }

    console.error(`unknown command: ${command}`);
    console.error(USAGE);
    return 1;
}

process.exit(main(process.argv));
