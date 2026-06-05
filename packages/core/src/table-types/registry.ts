/**
 * Registry mapping the `tableType` string to the concrete `TableTypeBase`
 * subclass that implements it. Adding a new engine is a matter of writing a
 * subclass and adding one entry here.
 */

import {
    TableType,
} from '../model';
import {
    TableTypeBase,
    TableTypeFields,
} from '../table-type';
import {
    HiveParquetTable,
} from './hive-parquet';
import {
    IcebergParquetTable,
} from './iceberg-parquet';
import {
    Postgres18Table,
} from './postgres-18';

/** Constructor signature shared by every concrete table subclass. */
type TableTypeConstructor = new (fields: TableTypeFields) => TableTypeBase;

/// Exhaustive map: every value of the `TableType` enum has a concrete subclass.
const REGISTRY: Record<TableType, TableTypeConstructor> = {
    [TableType.HIVE_PARQUET]: HiveParquetTable,
    [TableType.ICEBERG_PARQUET]: IcebergParquetTable,
    [TableType.POSTGRES_18]: Postgres18Table,
};

/**
 * Build the concrete `TableTypeBase` subclass for the given fields.
 *
 * @param fields The normalized table fields.
 * @returns A concrete table instance for the engine named by `fields.definition.tableType`.
 */
export function createTableType(fields: TableTypeFields): TableTypeBase {
    const tableType = fields.definition.tableType as TableType;
    /// An unrecognized `tableType` only occurs when Layer 1 already flagged the
    /// file: such tables are skipped by intra-table rules and skipped as FK
    /// targets, so the choice here is purely for cross-file *resolution* (the
    /// instance still needs to land in `world.tables` so dependsOn / FK source
    /// lookups don't pretend the file is missing). `HiveParquetTable` is the
    /// resolution-only fallback.
    const Constructor = REGISTRY[tableType] ?? HiveParquetTable;
    return new Constructor(fields);
}
