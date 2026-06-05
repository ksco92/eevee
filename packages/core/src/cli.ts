#!/usr/bin/env node
/**
 * `flexdataset` command-line interface.
 *
 * Commands: `validate` (structural + semantic checks), `graph` (dependency DAG
 * as SVG), and `er` (entity-relationship diagram as SVG). The CLI is a thin
 * shell over the library; all logic and tests live in the modules it calls.
 */

import * as fs from 'fs';

import {
    validateRoot, 
} from './validate';
import {
    loadRoot, 
} from './loader';
import {
    buildDagDot, 
} from './diagram/dag';
import {
    buildErDot, 
} from './diagram/er';
import {
    renderDot, 
} from './diagram/render';
import {
    ValidationResult, Violation,
} from './model';

const USAGE = `flexdataset — Flexible Dataset Definition validator

Usage:
  flexdataset validate <root> [--format json|human]
  flexdataset graph <root> [--out <file.svg>]
  flexdataset er <root> [--out <file.svg>]
  flexdataset help

Options:
  --format   Output format for "validate" (default: human).
  --out      Write SVG to a file instead of stdout (graph / er).`;

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

function parseOptions(rest: string[], flag: string): { value: string | undefined; positional: string[] } {
    let value: string | undefined;
    const positional: string[] = [];
    for (let i = 0; i < rest.length; i += 1) {
        if (rest[i] === flag) {
            i += 1;
            value = rest[i];
        } else {
            positional.push(rest[i]);
        }
    }
    return {
        value,
        positional,
    };
}

function runValidate(rest: string[]): number {
    const {
        value, positional, 
    } = parseOptions(rest, '--format');
    const format = value ?? 'human';

    const root = positional[0];
    if (!root) {
        console.error('usage: flexdataset validate <root> [--format json|human]');
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

async function runDiagram(command: 'graph' | 'er', rest: string[]): Promise<number> {
    const {
        value: out, positional, 
    } = parseOptions(rest, '--out');

    const root = positional[0];
    if (!root) {
        console.error(`usage: flexdataset ${command} <root> [--out <file.svg>]`);
        return 1;
    }

    try {
        const world = loadRoot(root).world;
        const dot = command === 'graph' ? buildDagDot(world) : buildErDot(world);
        const svg = await renderDot(dot);
        if (out) {
            fs.writeFileSync(out, svg, 'utf-8');
            console.error(`wrote ${out}`);
        } else {
            console.log(svg);
        }
        return 0;
    } catch (error) {
        console.error((error as Error).message);
        return 1;
    }
}

async function main(argv: string[]): Promise<number> {
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
    if (command === 'graph' || command === 'er') {
        return runDiagram(command, args.slice(1));
    }

    console.error(`unknown command: ${command}`);
    console.error(USAGE);
    return 1;
}

main(process.argv).then((code) => {
    process.exit(code);
}).catch((error) => {
    console.error((error as Error).message);
    process.exit(1);
});
