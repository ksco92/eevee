/**
 * Tests for the Layer 2 semantic rules.
 */

import {
    runSemanticRules,
} from '../src/world';
import {
    codes,
    col,
    makeTable,
    makeWorld,
    part,
} from './helpers';

/// Primary key

test('PK_COLUMNS_EXIST fires when a primary-key column is missing', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            columns: [
                col('a', 'int'),
            ],
            primaryKey: [
                'b',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('PK_COLUMNS_EXIST');
});

test('PK_COLUMNS_EXIST passes when all primary-key columns exist', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            columns: [
                col('a', 'int'),
            ],
            primaryKey: [
                'a',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).not.toContain('PK_COLUMNS_EXIST');
});

test('structurally-invalid tables are skipped by intra-table rules', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            structurallyValid: false,
            columns: [
                col('a', 'int'),
            ],
            primaryKey: [
                'missing',
            ],
        }),
    ]);
    expect(runSemanticRules(world)).toHaveLength(0);
});

/// Duplicate columns

test('NO_DUPLICATE_COLUMNS fires on a repeated column name', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            columns: [
                col('a', 'int'),
                col('a', 'string'),
            ],
            primaryKey: [
                'a',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('NO_DUPLICATE_COLUMNS');
});

/// Column types

test('COLUMN_TYPE_VALID fires on an unknown type', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            columns: [
                col('a', 'not_a_type'),
            ],
            primaryKey: [
                'a',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('COLUMN_TYPE_VALID');
});

/// Partitions — postgres

test('a valid Postgres partition produces no partition violations', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'postgres_18',
            columns: [
                col('id', 'integer'),
                col('created_at', 'timestamptz'),
            ],
            primaryKey: [
                'id',
            ],
            partitions: [
                part('created_at', 'range'),
            ],
        }),
    ]);
    expect(runSemanticRules(world)).toHaveLength(0);
});

test('POSTGRES_PARTITION_COLUMN_EXISTS fires when the key column is missing', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'postgres_18',
            columns: [
                col('id', 'integer'),
            ],
            primaryKey: [
                'id',
            ],
            partitions: [
                part('ghost', 'range'),
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('POSTGRES_PARTITION_COLUMN_EXISTS');
});

test('POSTGRES_PARTITION_STRATEGY_VALID fires on an unknown strategy', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'postgres_18',
            columns: [
                col('id', 'integer'),
                col('created_at', 'timestamptz'),
            ],
            primaryKey: [
                'id',
            ],
            partitions: [
                part('created_at', 'weekly'),
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('POSTGRES_PARTITION_STRATEGY_VALID');
});

test('NO_DUPLICATE_PARTITIONS fires on a repeated Postgres key column', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'postgres_18',
            columns: [
                col('id', 'integer'),
                col('created_at', 'timestamptz'),
            ],
            primaryKey: [
                'id',
            ],
            partitions: [
                part('created_at', 'range'),
                part('created_at', 'range'),
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('NO_DUPLICATE_PARTITIONS');
});

test('POSTGRES_PARTITION_SINGLE_STRATEGY fires when strategies are mixed', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'postgres_18',
            columns: [
                col('id', 'integer'),
                col('region', 'text'),
                col('created_at', 'timestamptz'),
            ],
            primaryKey: [
                'id',
            ],
            partitions: [
                part('created_at', 'range'),
                part('region', 'list'),
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('POSTGRES_PARTITION_SINGLE_STRATEGY');
});

test('POSTGRES_PARTITION_SINGLE_STRATEGY ignores invalid strategies', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'postgres_18',
            columns: [
                col('id', 'integer'),
                col('region', 'text'),
                col('created_at', 'timestamptz'),
            ],
            primaryKey: [
                'id',
            ],
            partitions: [
                part('created_at', 'range'),
                part('region', 'weekly'),
            ],
        }),
    ]);
    const result = codes(runSemanticRules(world));
    expect(result).toContain('POSTGRES_PARTITION_STRATEGY_VALID');
    expect(result).not.toContain('POSTGRES_PARTITION_SINGLE_STRATEGY');
});

/// Partitions — duplicates

test('NO_DUPLICATE_PARTITIONS fires on repeated partition names', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'hive_parquet',
            columns: [
                col('a', 'int'),
            ],
            primaryKey: [
                'a',
            ],
            partitions: [
                part('p', 'date'),
                part('p', 'date'),
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('NO_DUPLICATE_PARTITIONS');
});

/// Partitions — hive

test('HIVE_PARTITION_NOT_IN_COLUMNS fires when a partition shadows a column', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'hive_parquet',
            columns: [
                col('a', 'int'),
            ],
            primaryKey: [
                'a',
            ],
            partitions: [
                part('a', 'date'),
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('HIVE_PARTITION_NOT_IN_COLUMNS');
});

test('HIVE_PARTITION_TYPE_VALID fires on a bad hive partition type', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'hive_parquet',
            columns: [
                col('a', 'int'),
            ],
            primaryKey: [
                'a',
            ],
            partitions: [
                part('load_date', 'not_a_type'),
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('HIVE_PARTITION_TYPE_VALID');
});

test('a valid hive partition produces no partition violations', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'hive_parquet',
            columns: [
                col('a', 'int'),
            ],
            primaryKey: [
                'a',
            ],
            partitions: [
                part('load_date', 'date'),
            ],
        }),
    ]);
    expect(runSemanticRules(world)).toHaveLength(0);
});

/// Partitions — iceberg

test('ICEBERG_TRANSFORM_SOURCE_EXISTS fires when the source column is missing', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'iceberg_parquet',
            columns: [
                col('a', 'long'),
            ],
            primaryKey: [
                'a',
            ],
            partitions: [
                part('missing', 'day'),
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('ICEBERG_TRANSFORM_SOURCE_EXISTS');
});

test('ICEBERG_TRANSFORM_VALID fires on an unknown transform', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'iceberg_parquet',
            columns: [
                col('ts', 'timestamp'),
                col('a', 'long'),
            ],
            primaryKey: [
                'a',
            ],
            partitions: [
                part('ts', 'not_a_transform'),
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('ICEBERG_TRANSFORM_VALID');
});

test('ICEBERG_TRANSFORM_SOURCE_TYPE_LEGAL fires when a transform is illegal on the type', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'iceberg_parquet',
            columns: [
                col('name', 'string'),
                col('a', 'long'),
            ],
            primaryKey: [
                'a',
            ],
            partitions: [
                part('name', 'hour'),
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('ICEBERG_TRANSFORM_SOURCE_TYPE_LEGAL');
});

test('iceberg transform legality is skipped when the source type is unparseable', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'iceberg_parquet',
            columns: [
                col('weird', 'not_a_type'),
                col('a', 'long'),
            ],
            primaryKey: [
                'a',
            ],
            partitions: [
                part('weird', 'identity'),
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).not.toContain('ICEBERG_TRANSFORM_SOURCE_TYPE_LEGAL');
});

test('Iceberg allows multiple transforms on the same source column', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'iceberg_parquet',
            columns: [
                col('ts', 'timestamp'),
                col('a', 'long'),
            ],
            primaryKey: [
                'a',
            ],
            partitions: [
                part('ts', 'year'),
                part('ts', 'month'),
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).not.toContain('NO_DUPLICATE_PARTITIONS');
});

test('Iceberg flags a genuinely duplicated partition (same source and transform)', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'iceberg_parquet',
            columns: [
                col('ts', 'timestamp'),
                col('a', 'long'),
            ],
            primaryKey: [
                'a',
            ],
            partitions: [
                part('ts', 'day'),
                part('ts', 'day'),
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('NO_DUPLICATE_PARTITIONS');
});

test('Iceberg treats case variants of a transform as the same partition', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'iceberg_parquet',
            columns: [
                col('ts', 'timestamp'),
                col('a', 'long'),
            ],
            primaryKey: [
                'a',
            ],
            partitions: [
                part('ts', 'day'),
                part('ts', 'DAY'),
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('NO_DUPLICATE_PARTITIONS');
});

test('Iceberg dedups parameterized transforms regardless of whitespace', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'iceberg_parquet',
            columns: [
                col('a', 'long'),
                col('b', 'long'),
            ],
            primaryKey: [
                'b',
            ],
            partitions: [
                part('a', 'bucket[16]'),
                part('a', 'bucket[ 16 ]'),
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('NO_DUPLICATE_PARTITIONS');
});

test('a valid iceberg partition produces no partition violations', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'iceberg_parquet',
            columns: [
                col('ts', 'timestamp'),
                col('a', 'long'),
            ],
            primaryKey: [
                'a',
            ],
            partitions: [
                part('ts', 'day'),
            ],
        }),
    ]);
    expect(runSemanticRules(world)).toHaveLength(0);
});

/// Iceberg format version

test('ICEBERG_FORMAT_VERSION_VALID fires on an out-of-range format version', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'iceberg_parquet',
            formatVersion: 4,
            columns: [
                col('a', 'long'),
            ],
            primaryKey: [
                'a',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('ICEBERG_FORMAT_VERSION_VALID');
});

test('ICEBERG_FORMAT_VERSION_VALID passes on a supported format version', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'iceberg_parquet',
            formatVersion: 2,
            columns: [
                col('a', 'long'),
            ],
            primaryKey: [
                'a',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).not.toContain('ICEBERG_FORMAT_VERSION_VALID');
});

test('ICEBERG_FORMAT_VERSION_VALID stays silent when the format version is unspecified', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'iceberg_parquet',
            columns: [
                col('a', 'long'),
            ],
            primaryKey: [
                'a',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).not.toContain('ICEBERG_FORMAT_VERSION_VALID');
});

test('format version is ignored for non-Iceberg engines', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'hive_parquet',
            formatVersion: 99,
            columns: [
                col('a', 'int'),
            ],
            primaryKey: [
                'a',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).not.toContain('ICEBERG_FORMAT_VERSION_VALID');
});

/// Raw consistency

test('RAW_NO_DEPENDS_ON fires when a raw table declares dependsOn', () => {
    const world = makeWorld([
        makeTable({
            name: 'up',
            columns: [
                col('a', 'int'),
            ],
            primaryKey: [
                'a',
            ],
        }),
        makeTable({
            name: 't',
            isRawData: true,
            columns: [
                col('a', 'int'),
            ],
            primaryKey: [
                'a',
            ],
            dependsOn: [
                'analytics.up',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('RAW_NO_DEPENDS_ON');
});

test('NONRAW_REQUIRES_DEPENDS_ON fires when a non-raw table has no dependsOn', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            isRawData: false,
            columns: [
                col('a', 'int'),
            ],
            primaryKey: [
                'a',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('NONRAW_REQUIRES_DEPENDS_ON');
});

/// Column nullability

test('PK_COLUMN_NOT_NULLABLE fires when a primary-key column is declared nullable', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            columns: [
                col('a', 'int', true),
            ],
            primaryKey: [
                'a',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('PK_COLUMN_NOT_NULLABLE');
});

test('PK_COLUMN_NOT_NULLABLE passes when the primary-key column is non-nullable', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            columns: [
                col('a', 'int', false),
            ],
            primaryKey: [
                'a',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).not.toContain('PK_COLUMN_NOT_NULLABLE');
});

test('PK_COLUMN_NOT_NULLABLE stays silent when nullability is unspecified', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            columns: [
                col('a', 'int'),
            ],
            primaryKey: [
                'a',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).not.toContain('PK_COLUMN_NOT_NULLABLE');
});

test('FK_NULLABILITY_CONSISTENT warns when a non-nullable local column allows nulls', () => {
    const world = makeWorld([
        makeTable({
            schema: 'raw',
            name: 'src',
            columns: [
                col('id', 'int'),
            ],
            primaryKey: [
                'id',
            ],
        }),
        makeTable({
            name: 'child',
            isRawData: false,
            columns: [
                col('src_id', 'int', false),
            ],
            primaryKey: [
                'src_id',
            ],
            dependsOn: [
                'raw.src',
            ],
            foreignKeys: [
                {
                    sourceTable: 'raw.src',
                    sourceColumn: 'id',
                    localColumn: 'src_id',
                    allowNulls: true,
                },
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('FK_NULLABILITY_CONSISTENT');
});

test('FK_NULLABILITY_CONSISTENT stays silent when a nullable local column allows nulls', () => {
    const world = makeWorld([
        makeTable({
            schema: 'raw',
            name: 'src',
            columns: [
                col('id', 'int'),
            ],
            primaryKey: [
                'id',
            ],
        }),
        makeTable({
            name: 'child',
            isRawData: false,
            columns: [
                col('src_id', 'int', true),
            ],
            primaryKey: [
                'src_id',
            ],
            dependsOn: [
                'raw.src',
            ],
            foreignKeys: [
                {
                    sourceTable: 'raw.src',
                    sourceColumn: 'id',
                    localColumn: 'src_id',
                    allowNulls: true,
                },
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).not.toContain('FK_NULLABILITY_CONSISTENT');
});

/// dependsOn resolution

test('DEPENDS_ON_RESOLVES fires for an unknown upstream table', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            isRawData: false,
            columns: [
                col('a', 'int'),
            ],
            primaryKey: [
                'a',
            ],
            dependsOn: [
                'ghost.table',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('DEPENDS_ON_RESOLVES');
});

/// Foreign keys

function fkWorld(fkOverrides: Partial<{ sourceTable: string; sourceColumn: string; localColumn: string }>, options: { dependsOn?: string[]; targetPk?: string[] } = {}) {
    const target = makeTable({
        schema: 'raw',
        name: 'src',
        columns: [
            col('id', 'int'),
            col('other', 'int'),
        ],
        primaryKey: options.targetPk ?? [
            'id',
        ],
    });
    const child = makeTable({
        name: 'child',
        isRawData: false,
        columns: [
            col('src_id', 'int'),
        ],
        primaryKey: [
            'src_id',
        ],
        dependsOn: options.dependsOn ?? [
            'raw.src',
        ],
        foreignKeys: [
            {
                sourceTable: fkOverrides.sourceTable ?? 'raw.src',
                sourceColumn: fkOverrides.sourceColumn ?? 'id',
                localColumn: fkOverrides.localColumn ?? 'src_id',
                allowNulls: false,
            },
        ],
    });
    return makeWorld([
        target,
        child,
    ]);
}

test('a fully valid foreign key produces no violations', () => {
    expect(runSemanticRules(fkWorld({}))).toHaveLength(0);
});

test('FK_LOCAL_COLUMN_EXISTS fires when the local column is missing', () => {
    expect(codes(runSemanticRules(fkWorld({
        localColumn: 'nope',
    })))).toContain('FK_LOCAL_COLUMN_EXISTS');
});

test('FK_IMPLIES_DEPENDENCY fires when the source table is not in dependsOn', () => {
    expect(codes(runSemanticRules(fkWorld({}, {
        dependsOn: [],
    })))).toContain('FK_IMPLIES_DEPENDENCY');
});

test('FK_SOURCE_TABLE_RESOLVES fires when the source table is unknown', () => {
    const result = codes(runSemanticRules(fkWorld({
        sourceTable: 'raw.ghost',
    }, {
        dependsOn: [
            'raw.ghost',
        ],
    })));
    expect(result).toContain('FK_SOURCE_TABLE_RESOLVES');
});

test('FK_SOURCE_COLUMN_EXISTS fires when the source column is missing', () => {
    expect(codes(runSemanticRules(fkWorld({
        sourceColumn: 'ghost',
    })))).toContain('FK_SOURCE_COLUMN_EXISTS');
});

test('FK_SOURCE_IS_KEY warns when the source column is not the primary key', () => {
    const result = codes(runSemanticRules(fkWorld({
        sourceColumn: 'other',
    })));
    expect(result).toContain('FK_SOURCE_IS_KEY');
    expect(result).not.toContain('FK_SOURCE_COLUMN_EXISTS');
});

test('foreign keys to a structurally invalid target skip column-level checks', () => {
    const world = makeWorld([
        makeTable({
            schema: 'raw',
            name: 'src',
            structurallyValid: false,
            columns: [],
            primaryKey: [],
        }),
        makeTable({
            name: 'child',
            isRawData: false,
            columns: [
                col('src_id', 'int'),
            ],
            primaryKey: [
                'src_id',
            ],
            dependsOn: [
                'raw.src',
            ],
            foreignKeys: [
                {
                    sourceTable: 'raw.src',
                    sourceColumn: 'id',
                    localColumn: 'src_id',
                    allowNulls: false,
                },
            ],
        }),
    ]);
    const result = codes(runSemanticRules(world));
    expect(result).not.toContain('FK_SOURCE_COLUMN_EXISTS');
    expect(result).not.toContain('FK_SOURCE_IS_KEY');
    expect(result).not.toContain('FK_SOURCE_TABLE_RESOLVES');
});

test('a self-referential foreign key needs no self-dependency and forms no cycle', () => {
    const world = makeWorld([
        makeTable({
            name: 'employees',
            tableType: 'iceberg_parquet',
            isRawData: true,
            columns: [
                col('id', 'long'),
                col('manager_id', 'long'),
            ],
            primaryKey: [
                'id',
            ],
            foreignKeys: [
                {
                    sourceTable: 'analytics.employees',
                    sourceColumn: 'id',
                    localColumn: 'manager_id',
                    allowNulls: true,
                },
            ],
        }),
    ]);
    expect(runSemanticRules(world)).toHaveLength(0);
});

/// Acyclic dependency graph

test('DEPENDENCY_GRAPH_ACYCLIC fires on a two-node cycle', () => {
    const world = makeWorld([
        makeTable({
            name: 'a',
            isRawData: false,
            columns: [
                col('x', 'int'),
            ],
            primaryKey: [
                'x',
            ],
            dependsOn: [
                'analytics.b',
            ],
        }),
        makeTable({
            name: 'b',
            isRawData: false,
            columns: [
                col('x', 'int'),
            ],
            primaryKey: [
                'x',
            ],
            dependsOn: [
                'analytics.a',
            ],
        }),
    ]);
    const acyclic = runSemanticRules(world).filter((violation) => violation.code === 'DEPENDENCY_GRAPH_ACYCLIC');
    expect(acyclic).toHaveLength(1);
});

test('DEPENDENCY_GRAPH_ACYCLIC fires on a self-loop', () => {
    const world = makeWorld([
        makeTable({
            name: 'a',
            isRawData: false,
            columns: [
                col('x', 'int'),
            ],
            primaryKey: [
                'x',
            ],
            dependsOn: [
                'analytics.a',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('DEPENDENCY_GRAPH_ACYCLIC');
});

test('a linear dependency chain is acyclic', () => {
    const world = makeWorld([
        makeTable({
            name: 'a',
            isRawData: true,
            columns: [
                col('x', 'int'),
            ],
            primaryKey: [
                'x',
            ],
        }),
        makeTable({
            name: 'b',
            isRawData: false,
            columns: [
                col('x', 'int'),
            ],
            primaryKey: [
                'x',
            ],
            dependsOn: [
                'analytics.a',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).not.toContain('DEPENDENCY_GRAPH_ACYCLIC');
});

test('an unresolved dependency is ignored by the cycle check', () => {
    const world = makeWorld([
        makeTable({
            name: 'a',
            isRawData: false,
            columns: [
                col('x', 'int'),
            ],
            primaryKey: [
                'x',
            ],
            dependsOn: [
                'ghost.table',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).not.toContain('DEPENDENCY_GRAPH_ACYCLIC');
});
