/**
 * Public API for the FDD core package.
 */

export * from './model';
export {
    LoadedSchema,
    World,
    runSemanticRules,
} from './world';
export {
    validateRoot,
    loadValidatedRoot,
    formatViolation,
    LoadValidatedOptions,
} from './validate';
export {
    loadRoot,
    LoadOutcome,
} from './loader';
export {
    TableTypeBase,
    TableTypeFields,
} from './table-type';
export {
    createTableType,
} from './table-types/registry';
export {
    HiveParquetTable,
} from './table-types/hive-parquet';
export {
    IcebergParquetTable,
} from './table-types/iceberg-parquet';
export {
    Postgres18Table,
} from './table-types/postgres-18';
export {
    validateStructure,
    StructuralKind,
    StructuralResult,
    StructuralError,
} from './structural';
export {
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
export {
    buildDagDot,
} from './diagram/dag';
export {
    buildErDot,
} from './diagram/er';
export {
    renderDot,
} from './diagram/render';
