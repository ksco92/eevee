/**
 * Public API for the FDD core package.
 */

export * from './model';
export {
    validateRoot,
} from './validate';
export {
    loadRoot,
    LoadOutcome,
} from './loader';
export {
    runSemanticRules,
    RULES,
    Rule,
} from './rules';
export {
    validateStructure,
    StructuralKind,
    StructuralResult,
    StructuralError,
} from './structural';
export {
    isValidColumnType,
    isValidHiveType,
    isValidPostgresType,
} from './types';
export {
    parseIcebergType,
    isValidIcebergType,
    parseIcebergTransform,
    transformLegalOnType,
    IcebergType,
    IcebergTypeKind,
    IcebergTransform,
    IcebergTransformKind,
} from './iceberg';
