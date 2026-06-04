/**
 * Layer 1 (structural) validation, backed by JSON Schema via ajv.
 *
 * The schema files in `./schema` are the portable artifact: any language can
 * validate a file natively against them. This module is the TypeScript core's
 * own use of those same schemas.
 */

import Ajv, {
    ValidateFunction, 
} from 'ajv';
import addFormats from 'ajv-formats';

import tableSchema from './schema/table.schema.json';
import schemaSchema from './schema/schema.schema.json';

/** Which structural schema to validate against. */
export type StructuralKind = 'table' | 'schema';

/** A single structural error, before file context is attached. */
export interface StructuralError {
    /** JSON pointer to the offending field (empty string for the root). */
    readonly field: string;

    /** Human-readable description. */
    readonly message: string;
}

/** Outcome of validating one file structurally. */
export interface StructuralResult {
    /** True when the file matches its structural schema. */
    readonly valid: boolean;

    /** Errors found (empty when valid). */
    readonly errors: StructuralError[];
}

const ajv = new Ajv({
    allErrors: true,
    allowUnionTypes: true,
});
addFormats(ajv);

const validators: Record<StructuralKind, ValidateFunction> = {
    table: ajv.compile(tableSchema),
    schema: ajv.compile(schemaSchema),
};

/**
 * Validate parsed JSON against a structural schema.
 *
 * @param kind Which schema to use.
 * @param data Parsed JSON content.
 * @returns Whether it is valid plus any structural errors.
 */
export function validateStructure(kind: StructuralKind, data: unknown): StructuralResult {
    const validate = validators[kind];
    const valid = validate(data) as boolean;
    if (valid) {
        return {
            valid: true,
            errors: [],
        };
    }

    /* istanbul ignore next: ajv always populates `errors` when validation fails */
    const rawErrors = validate.errors ?? [];
    const errors: StructuralError[] = rawErrors.map((error) => ({
        field: error.instancePath,
        message: `${error.instancePath || '(root)'} ${error.message}`.trim(),
    }));

    return {
        valid: false,
        errors,
    };
}
