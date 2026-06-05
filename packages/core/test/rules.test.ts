/**
 * Tests for the Layer 2 semantic rules.
 */

import {
    Index,
} from '../src/model';
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
                'created_at',
            ],
            partitions: [
                part('created_at', 'range'),
            ],
        }),
    ]);
    expect(runSemanticRules(world)).toHaveLength(0);
});

test('POSTGRES_PARTITION_KEY_IN_PK fires when a partition column is not in the primary key', () => {
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
    expect(codes(runSemanticRules(world))).toContain('POSTGRES_PARTITION_KEY_IN_PK');
});

test('POSTGRES_PARTITION_KEY_IN_PK does not fire for a partition column missing from columns', () => {
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
    const result = codes(runSemanticRules(world));
    expect(result).toContain('POSTGRES_PARTITION_COLUMN_EXISTS');
    expect(result).not.toContain('POSTGRES_PARTITION_KEY_IN_PK');
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

/// Postgres indexes

function pgWithIndexes(indexes: Index[]) {
    return makeWorld([
        makeTable({
            name: 't',
            tableType: 'postgres_18',
            indexes,
            columns: [
                col('a', 'integer'),
                col('b', 'integer'),
                col('c', 'integer'),
            ],
            primaryKey: [
                'a',
            ],
        }),
    ]);
}

test('a valid Postgres index produces no violations', () => {
    const result = runSemanticRules(pgWithIndexes([
        {
            name: 'idx_a',
            method: 'btree',
            unique: true,
            columns: [
                {
                    name: 'a',
                    sort: 'asc',
                    nulls: 'last',
                },
            ],
            include: [
                'b',
            ],
        },
    ]));
    expect(result).toHaveLength(0);
});

test('POSTGRES_INDEX_NAME_UNIQUE fires on duplicate index names', () => {
    const result = codes(runSemanticRules(pgWithIndexes([
        {
            name: 'dup',
            method: 'btree',
            columns: [
                {
                    name: 'a',
                },
            ],
            include: [],
        },
        {
            name: 'dup',
            method: 'btree',
            columns: [
                {
                    name: 'b',
                },
            ],
            include: [],
        },
    ])));
    expect(result).toContain('POSTGRES_INDEX_NAME_UNIQUE');
});

test('POSTGRES_INDEX_METHOD_VALID fires on an unknown method', () => {
    const result = codes(runSemanticRules(pgWithIndexes([
        {
            name: 'idx',
            method: 'rtree',
            columns: [
                {
                    name: 'a',
                },
            ],
            include: [],
        },
    ])));
    expect(result).toContain('POSTGRES_INDEX_METHOD_VALID');
});

test('POSTGRES_INDEX_COLUMN_EXISTS fires when a key column is missing', () => {
    const result = codes(runSemanticRules(pgWithIndexes([
        {
            name: 'idx',
            method: 'btree',
            columns: [
                {
                    name: 'ghost',
                },
            ],
            include: [],
        },
    ])));
    expect(result).toContain('POSTGRES_INDEX_COLUMN_EXISTS');
});

test('POSTGRES_INDEX_COLUMN_EXISTS fires when an include column is missing', () => {
    const result = codes(runSemanticRules(pgWithIndexes([
        {
            name: 'idx',
            method: 'btree',
            columns: [
                {
                    name: 'a',
                },
            ],
            include: [
                'ghost',
            ],
        },
    ])));
    expect(result).toContain('POSTGRES_INDEX_COLUMN_EXISTS');
});

test('POSTGRES_INDEX_NO_DUPLICATE_COLUMNS fires on a repeated key column', () => {
    const result = codes(runSemanticRules(pgWithIndexes([
        {
            name: 'idx',
            method: 'btree',
            columns: [
                {
                    name: 'a',
                },
                {
                    name: 'a',
                },
            ],
            include: [],
        },
    ])));
    expect(result).toContain('POSTGRES_INDEX_NO_DUPLICATE_COLUMNS');
});

test('POSTGRES_INDEX_NO_DUPLICATE_COLUMNS fires on a repeated include column', () => {
    const result = codes(runSemanticRules(pgWithIndexes([
        {
            name: 'idx',
            method: 'btree',
            columns: [
                {
                    name: 'a',
                },
            ],
            include: [
                'b',
                'b',
            ],
        },
    ])));
    expect(result).toContain('POSTGRES_INDEX_NO_DUPLICATE_COLUMNS');
});

test('POSTGRES_INDEX_NO_DUPLICATE_COLUMNS fires when an include column is also a key column', () => {
    const result = codes(runSemanticRules(pgWithIndexes([
        {
            name: 'idx',
            method: 'btree',
            columns: [
                {
                    name: 'a',
                },
            ],
            include: [
                'a',
            ],
        },
    ])));
    expect(result).toContain('POSTGRES_INDEX_NO_DUPLICATE_COLUMNS');
});

test('POSTGRES_INDEX_UNIQUE_BTREE_ONLY fires on a unique non-btree index', () => {
    const result = codes(runSemanticRules(pgWithIndexes([
        {
            name: 'idx',
            method: 'gin',
            unique: true,
            columns: [
                {
                    name: 'a',
                },
            ],
            include: [],
        },
    ])));
    expect(result).toContain('POSTGRES_INDEX_UNIQUE_BTREE_ONLY');
});

test('a unique btree index does not trigger POSTGRES_INDEX_UNIQUE_BTREE_ONLY', () => {
    const result = codes(runSemanticRules(pgWithIndexes([
        {
            name: 'idx',
            method: 'btree',
            unique: true,
            columns: [
                {
                    name: 'a',
                },
            ],
            include: [],
        },
    ])));
    expect(result).not.toContain('POSTGRES_INDEX_UNIQUE_BTREE_ONLY');
});

test('POSTGRES_INDEX_SORT_VALID fires on an unknown sort', () => {
    const result = codes(runSemanticRules(pgWithIndexes([
        {
            name: 'idx',
            method: 'btree',
            columns: [
                {
                    name: 'a',
                    sort: 'ascending',
                },
            ],
            include: [],
        },
    ])));
    expect(result).toContain('POSTGRES_INDEX_SORT_VALID');
});

test('POSTGRES_INDEX_NULLS_VALID fires on an unknown nulls option', () => {
    const result = codes(runSemanticRules(pgWithIndexes([
        {
            name: 'idx',
            method: 'btree',
            columns: [
                {
                    name: 'a',
                    nulls: 'top',
                },
            ],
            include: [],
        },
    ])));
    expect(result).toContain('POSTGRES_INDEX_NULLS_VALID');
});

test('indexes are ignored for non-Postgres engines', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'hive_parquet',
            indexes: [
                {
                    name: 'idx',
                    method: 'rtree',
                    columns: [
                        {
                            name: 'ghost',
                        },
                    ],
                    include: [],
                },
            ],
            columns: [
                col('a', 'int'),
            ],
            primaryKey: [
                'a',
            ],
        }),
    ]);
    const result = codes(runSemanticRules(world));
    expect(result).not.toContain('POSTGRES_INDEX_METHOD_VALID');
    expect(result).not.toContain('POSTGRES_INDEX_COLUMN_EXISTS');
});

/// Hive table properties

function hiveWithProps(tableProperties: Record<string, string>) {
    return makeWorld([
        makeTable({
            name: 't',
            tableType: 'hive_parquet',
            tableProperties,
            columns: [
                col('a', 'int'),
            ],
            primaryKey: [
                'a',
            ],
        }),
    ]);
}

test('a valid Hive table-property set produces no violations', () => {
    const result = runSemanticRules(hiveWithProps({
        'parquet.compression': 'SNAPPY',
        transactional: 'true',
        transactional_properties: 'insert_only',
    }));
    expect(result).toHaveLength(0);
});

test('HIVE_PROPERTY_ENUM_VALID fires on an unknown compression codec', () => {
    const result = codes(runSemanticRules(hiveWithProps({
        'parquet.compression': 'lzma',
    })));
    expect(result).toContain('HIVE_PROPERTY_ENUM_VALID');
});

test('Hive compression codecs are matched case-insensitively', () => {
    const result = codes(runSemanticRules(hiveWithProps({
        'parquet.compression': 'zstd',
    })));
    expect(result).not.toContain('HIVE_PROPERTY_ENUM_VALID');
});

test('HIVE_PROPERTY_ENUM_VALID fires on an unknown transactional value', () => {
    const result = codes(runSemanticRules(hiveWithProps({
        transactional: 'maybe',
    })));
    expect(result).toContain('HIVE_PROPERTY_ENUM_VALID');
});

test('HIVE_FULL_ACID_REQUIRES_ORC fires when a transactional table is not insert-only', () => {
    const result = codes(runSemanticRules(hiveWithProps({
        transactional: 'true',
    })));
    expect(result).toContain('HIVE_FULL_ACID_REQUIRES_ORC');
});

test('HIVE_FULL_ACID_REQUIRES_ORC fires when transactional_properties is default', () => {
    const result = codes(runSemanticRules(hiveWithProps({
        transactional: 'true',
        transactional_properties: 'default',
    })));
    expect(result).toContain('HIVE_FULL_ACID_REQUIRES_ORC');
});

test('HIVE_FULL_ACID_REQUIRES_ORC stays silent for insert-only ACID', () => {
    const result = codes(runSemanticRules(hiveWithProps({
        transactional: 'true',
        transactional_properties: 'insert_only',
    })));
    expect(result).not.toContain('HIVE_FULL_ACID_REQUIRES_ORC');
});

test('HIVE_FULL_ACID_REQUIRES_ORC stays silent for a non-transactional table', () => {
    const result = codes(runSemanticRules(hiveWithProps({
        transactional: 'false',
    })));
    expect(result).not.toContain('HIVE_FULL_ACID_REQUIRES_ORC');
});

test('unknown Hive table properties pass through unvalidated', () => {
    const result = runSemanticRules(hiveWithProps({
        'my.custom.key': 'whatever',
        'orc.compress': 'ZLIB',
    }));
    expect(result).toHaveLength(0);
});

test('Hive table properties are ignored for non-Hive engines', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'postgres_18',
            tableProperties: {
                'parquet.compression': 'lzma',
                transactional: 'true',
            },
            columns: [
                col('a', 'integer'),
            ],
            primaryKey: [
                'a',
            ],
        }),
    ]);
    const result = codes(runSemanticRules(world));
    expect(result).not.toContain('HIVE_PROPERTY_ENUM_VALID');
    expect(result).not.toContain('HIVE_FULL_ACID_REQUIRES_ORC');
});

/// Hive bucketing

test('a valid Hive bucketing spec produces no violations', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'hive_parquet',
            columns: [
                col('user_id', 'bigint'),
                col('event_ts', 'timestamp'),
            ],
            primaryKey: [
                'user_id',
            ],
            bucketing: {
                columns: [
                    'user_id',
                ],
                bucketCount: 32,
                sortedBy: [
                    {
                        column: 'event_ts',
                        direction: 'desc',
                    },
                ],
            },
        }),
    ]);
    expect(runSemanticRules(world)).toHaveLength(0);
});

test('HIVE_BUCKET_COLUMN_EXISTS fires when a bucket column is missing', () => {
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
            bucketing: {
                columns: [
                    'ghost',
                ],
                bucketCount: 8,
                sortedBy: [],
            },
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('HIVE_BUCKET_COLUMN_EXISTS');
});

test('HIVE_BUCKET_NOT_PARTITION_COLUMN fires when a bucket column is a partition column', () => {
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
            bucketing: {
                columns: [
                    'load_date',
                ],
                bucketCount: 8,
                sortedBy: [],
            },
        }),
    ]);
    const result = codes(runSemanticRules(world));
    expect(result).toContain('HIVE_BUCKET_NOT_PARTITION_COLUMN');
    expect(result).not.toContain('HIVE_BUCKET_COLUMN_EXISTS');
});

test('HIVE_BUCKET_NO_DUPLICATE_COLUMNS fires on a repeated bucket column', () => {
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
            bucketing: {
                columns: [
                    'a',
                    'a',
                ],
                bucketCount: 8,
                sortedBy: [],
            },
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('HIVE_BUCKET_NO_DUPLICATE_COLUMNS');
});

test('HIVE_BUCKET_COUNT_POSITIVE fires on a non-positive bucket count', () => {
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
            bucketing: {
                columns: [
                    'a',
                ],
                bucketCount: 0,
                sortedBy: [],
            },
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('HIVE_BUCKET_COUNT_POSITIVE');
});

test('HIVE_BUCKET_COUNT_POSITIVE fires on a non-integer bucket count', () => {
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
            bucketing: {
                columns: [
                    'a',
                ],
                bucketCount: 3.5,
                sortedBy: [],
            },
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('HIVE_BUCKET_COUNT_POSITIVE');
});

test('HIVE_SORT_COLUMN_EXISTS fires when a sort column is missing', () => {
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
            bucketing: {
                columns: [
                    'a',
                ],
                bucketCount: 8,
                sortedBy: [
                    {
                        column: 'ghost',
                        direction: 'asc',
                    },
                ],
            },
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('HIVE_SORT_COLUMN_EXISTS');
});

test('HIVE_SORT_DIRECTION_VALID fires on an unknown sort direction', () => {
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
            bucketing: {
                columns: [
                    'a',
                ],
                bucketCount: 8,
                sortedBy: [
                    {
                        column: 'a',
                        direction: 'upwards',
                    },
                ],
            },
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('HIVE_SORT_DIRECTION_VALID');
});

test('Hive sort direction is case-insensitive', () => {
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
            bucketing: {
                columns: [
                    'a',
                ],
                bucketCount: 8,
                sortedBy: [
                    {
                        column: 'a',
                        direction: 'ASC',
                    },
                ],
            },
        }),
    ]);
    expect(codes(runSemanticRules(world))).not.toContain('HIVE_SORT_DIRECTION_VALID');
});

test('bucketing is ignored for non-Hive engines', () => {
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
            bucketing: {
                columns: [
                    'ghost',
                ],
                bucketCount: 0,
                sortedBy: [],
            },
        }),
    ]);
    const result = codes(runSemanticRules(world));
    expect(result).not.toContain('HIVE_BUCKET_COLUMN_EXISTS');
    expect(result).not.toContain('HIVE_BUCKET_COUNT_POSITIVE');
});

/// Postgres generated columns

function genCol(name: string, type: string, generated: string, expressionColumns: string[]) {
    return {
        name,
        type,
        description: `column ${name}`,
        generated,
        expressionColumns,
    };
}

test('a valid Postgres generated column produces no violations', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'postgres_18',
            columns: [
                col('id', 'integer'),
                col('amount', 'numeric(10,2)'),
                genCol('doubled', 'numeric(10,2)', 'stored', [
                    'amount',
                ]),
            ],
            primaryKey: [
                'id',
            ],
        }),
    ]);
    expect(runSemanticRules(world)).toHaveLength(0);
});

test('POSTGRES_GENERATED_KIND_VALID fires on an unknown generated kind', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'postgres_18',
            columns: [
                col('id', 'integer'),
                genCol('x', 'integer', 'computed', [
                    'id',
                ]),
            ],
            primaryKey: [
                'id',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('POSTGRES_GENERATED_KIND_VALID');
});

test('POSTGRES_GENERATED_EXPRESSION_COLUMN_EXISTS fires on a missing reference', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'postgres_18',
            columns: [
                col('id', 'integer'),
                genCol('x', 'integer', 'stored', [
                    'ghost',
                ]),
            ],
            primaryKey: [
                'id',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('POSTGRES_GENERATED_EXPRESSION_COLUMN_EXISTS');
});

test('POSTGRES_GENERATED_NO_SELF_REFERENCE fires when a generated column references itself', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'postgres_18',
            columns: [
                col('id', 'integer'),
                genCol('x', 'integer', 'stored', [
                    'x',
                ]),
            ],
            primaryKey: [
                'id',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('POSTGRES_GENERATED_NO_SELF_REFERENCE');
});

test('POSTGRES_GENERATED_NO_GENERATED_REFERENCE fires when a generated column references another generated column', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'postgres_18',
            columns: [
                col('id', 'integer'),
                col('base', 'integer'),
                genCol('first', 'integer', 'stored', [
                    'base',
                ]),
                genCol('second', 'integer', 'stored', [
                    'first',
                ]),
            ],
            primaryKey: [
                'id',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('POSTGRES_GENERATED_NO_GENERATED_REFERENCE');
});

test('POSTGRES_GENERATED_NOT_IN_PARTITION_KEY fires when a generated column is a partition key', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'postgres_18',
            columns: [
                col('id', 'integer'),
                col('amount', 'numeric(10,2)'),
                genCol('total', 'numeric(10,2)', 'stored', [
                    'amount',
                ]),
            ],
            partitions: [
                part('total', 'range'),
            ],
            primaryKey: [
                'id',
                'total',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('POSTGRES_GENERATED_NOT_IN_PARTITION_KEY');
});

test('POSTGRES_VIRTUAL_GENERATED_NOT_IN_PK fires when a virtual generated column is in the primary key', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'postgres_18',
            columns: [
                col('id', 'integer'),
                genCol('full_name', 'text', 'virtual', []),
            ],
            primaryKey: [
                'id',
                'full_name',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('POSTGRES_VIRTUAL_GENERATED_NOT_IN_PK');
});

test('a stored generated column in the primary key does not trigger the virtual-PK rule', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'postgres_18',
            columns: [
                col('id', 'integer'),
                {
                    name: 'slug',
                    type: 'text',
                    description: 'column slug',
                    generated: 'stored',
                },
            ],
            primaryKey: [
                'id',
                'slug',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).not.toContain('POSTGRES_VIRTUAL_GENERATED_NOT_IN_PK');
});

test('generated columns are ignored for non-Postgres engines', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'hive_parquet',
            columns: [
                col('id', 'int'),
                genCol('x', 'int', 'computed', [
                    'ghost',
                ]),
            ],
            primaryKey: [
                'id',
            ],
        }),
    ]);
    const result = codes(runSemanticRules(world));
    expect(result).not.toContain('POSTGRES_GENERATED_KIND_VALID');
    expect(result).not.toContain('POSTGRES_GENERATED_EXPRESSION_COLUMN_EXISTS');
});

/// Postgres identity and default columns

test('a valid Postgres identity column produces no violations', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'postgres_18',
            columns: [
                {
                    name: 'id',
                    type: 'bigint',
                    description: 'surrogate key',
                    identity: 'always',
                },
            ],
            primaryKey: [
                'id',
            ],
        }),
    ]);
    expect(runSemanticRules(world)).toHaveLength(0);
});

test('a valid Postgres default column produces no violations', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'postgres_18',
            columns: [
                col('id', 'integer'),
                {
                    name: 'created_at',
                    type: 'timestamptz',
                    description: 'creation time',
                    default: 'now()',
                },
            ],
            primaryKey: [
                'id',
            ],
        }),
    ]);
    expect(runSemanticRules(world)).toHaveLength(0);
});

test('POSTGRES_IDENTITY_VALID fires on an unknown identity kind', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'postgres_18',
            columns: [
                {
                    name: 'id',
                    type: 'bigint',
                    description: 'id',
                    identity: 'sometimes',
                },
            ],
            primaryKey: [
                'id',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('POSTGRES_IDENTITY_VALID');
});

test('POSTGRES_IDENTITY_TYPE_INTEGER fires when an identity column is not an integer type', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'postgres_18',
            columns: [
                {
                    name: 'id',
                    type: 'text',
                    description: 'id',
                    identity: 'always',
                },
            ],
            primaryKey: [
                'id',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('POSTGRES_IDENTITY_TYPE_INTEGER');
});

test('POSTGRES_COLUMN_GENERATION_EXCLUSIVE fires when a column is both generated and has a default', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'postgres_18',
            columns: [
                col('id', 'integer'),
                {
                    name: 'x',
                    type: 'integer',
                    description: 'x',
                    generated: 'stored',
                    default: '0',
                },
            ],
            primaryKey: [
                'id',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('POSTGRES_COLUMN_GENERATION_EXCLUSIVE');
});

test('POSTGRES_COLUMN_GENERATION_EXCLUSIVE fires when a column is both an identity and has a default', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'postgres_18',
            columns: [
                {
                    name: 'id',
                    type: 'bigint',
                    description: 'id',
                    identity: 'always',
                    default: '1',
                },
            ],
            primaryKey: [
                'id',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('POSTGRES_COLUMN_GENERATION_EXCLUSIVE');
});

test('valid Postgres collation, compression, and storage produce no violations', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'postgres_18',
            columns: [
                col('id', 'integer'),
                {
                    name: 'name',
                    type: 'varchar(320)',
                    description: 'name',
                    collation: 'en_US',
                    compression: 'lz4',
                    storage: 'extended',
                },
            ],
            primaryKey: [
                'id',
            ],
        }),
    ]);
    expect(runSemanticRules(world)).toHaveLength(0);
});

test('POSTGRES_COLLATION_ON_TEXT_TYPE fires when collation is set on a non-text type', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'postgres_18',
            columns: [
                {
                    name: 'id',
                    type: 'integer',
                    description: 'id',
                    collation: 'en_US',
                },
            ],
            primaryKey: [
                'id',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('POSTGRES_COLLATION_ON_TEXT_TYPE');
});

test('POSTGRES_COMPRESSION_VALID fires on an unknown compression method', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'postgres_18',
            columns: [
                col('id', 'integer'),
                {
                    name: 'doc',
                    type: 'jsonb',
                    description: 'doc',
                    compression: 'zstd',
                },
            ],
            primaryKey: [
                'id',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('POSTGRES_COMPRESSION_VALID');
});

test('POSTGRES_STORAGE_VALID fires on an unknown storage strategy', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'postgres_18',
            columns: [
                col('id', 'integer'),
                {
                    name: 'doc',
                    type: 'jsonb',
                    description: 'doc',
                    storage: 'inline',
                },
            ],
            primaryKey: [
                'id',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('POSTGRES_STORAGE_VALID');
});

test('collation, compression, and storage are ignored for non-Postgres engines', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'hive_parquet',
            columns: [
                {
                    name: 'id',
                    type: 'int',
                    description: 'id',
                    collation: 'en_US',
                    compression: 'zstd',
                    storage: 'inline',
                },
            ],
            primaryKey: [
                'id',
            ],
        }),
    ]);
    const result = codes(runSemanticRules(world));
    expect(result).not.toContain('POSTGRES_COLLATION_ON_TEXT_TYPE');
    expect(result).not.toContain('POSTGRES_COMPRESSION_VALID');
    expect(result).not.toContain('POSTGRES_STORAGE_VALID');
});

test('identity and default attributes are ignored for non-Postgres engines', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'hive_parquet',
            columns: [
                {
                    name: 'id',
                    type: 'int',
                    description: 'id',
                    identity: 'sometimes',
                    default: '0',
                },
            ],
            primaryKey: [
                'id',
            ],
        }),
    ]);
    const result = codes(runSemanticRules(world));
    expect(result).not.toContain('POSTGRES_IDENTITY_VALID');
    expect(result).not.toContain('POSTGRES_COLUMN_GENERATION_EXCLUSIVE');
});

/// Postgres unique and check constraints

test('a valid Postgres unique constraint produces no violations', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'postgres_18',
            uniqueConstraints: [
                {
                    name: 'uq_email',
                    columns: [
                        'email',
                    ],
                    nullsNotDistinct: false,
                },
            ],
            columns: [
                col('id', 'integer'),
                col('email', 'text'),
            ],
            primaryKey: [
                'id',
            ],
        }),
    ]);
    expect(runSemanticRules(world)).toHaveLength(0);
});

test('POSTGRES_UNIQUE_NAME_UNIQUE fires on duplicate constraint names', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'postgres_18',
            uniqueConstraints: [
                {
                    name: 'dup',
                    columns: [
                        'a',
                    ],
                },
                {
                    name: 'dup',
                    columns: [
                        'b',
                    ],
                },
            ],
            columns: [
                col('a', 'integer'),
                col('b', 'integer'),
            ],
            primaryKey: [
                'a',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('POSTGRES_UNIQUE_NAME_UNIQUE');
});

test('POSTGRES_UNIQUE_COLUMN_EXISTS fires when a constraint column is missing', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'postgres_18',
            uniqueConstraints: [
                {
                    name: 'uq',
                    columns: [
                        'ghost',
                    ],
                },
            ],
            columns: [
                col('a', 'integer'),
            ],
            primaryKey: [
                'a',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('POSTGRES_UNIQUE_COLUMN_EXISTS');
});

test('POSTGRES_UNIQUE_NO_DUPLICATE_COLUMNS fires on a repeated column', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'postgres_18',
            uniqueConstraints: [
                {
                    name: 'uq',
                    columns: [
                        'a',
                        'a',
                    ],
                },
            ],
            columns: [
                col('a', 'integer'),
            ],
            primaryKey: [
                'a',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('POSTGRES_UNIQUE_NO_DUPLICATE_COLUMNS');
});

test('a valid Postgres check constraint produces no violations', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'postgres_18',
            checkConstraints: [
                {
                    name: 'ck_price',
                    expression: 'price > 0',
                    columns: [
                        'price',
                    ],
                },
            ],
            columns: [
                col('id', 'integer'),
                col('price', 'numeric(10,2)'),
            ],
            primaryKey: [
                'id',
            ],
        }),
    ]);
    expect(runSemanticRules(world)).toHaveLength(0);
});

test('POSTGRES_CHECK_NAME_UNIQUE fires on duplicate constraint names', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'postgres_18',
            checkConstraints: [
                {
                    name: 'dup',
                    expression: 'a > 0',
                    columns: [
                        'a',
                    ],
                },
                {
                    name: 'dup',
                    expression: 'a < 100',
                    columns: [
                        'a',
                    ],
                },
            ],
            columns: [
                col('a', 'integer'),
            ],
            primaryKey: [
                'a',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('POSTGRES_CHECK_NAME_UNIQUE');
});

test('POSTGRES_CHECK_COLUMN_EXISTS fires when a referenced column is missing', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'postgres_18',
            checkConstraints: [
                {
                    name: 'ck',
                    expression: 'ghost > 0',
                    columns: [
                        'ghost',
                    ],
                },
            ],
            columns: [
                col('a', 'integer'),
            ],
            primaryKey: [
                'a',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('POSTGRES_CHECK_COLUMN_EXISTS');
});

test('POSTGRES_UNIQUE_REDUNDANT_WITH_PK warns when a unique constraint duplicates the primary key', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'postgres_18',
            uniqueConstraints: [
                {
                    name: 'uq',
                    columns: [
                        'id',
                    ],
                },
            ],
            columns: [
                col('id', 'integer'),
            ],
            primaryKey: [
                'id',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('POSTGRES_UNIQUE_REDUNDANT_WITH_PK');
});

test('POSTGRES_UNIQUE_INCLUDES_PARTITION_KEYS fires when a unique omits a partition key', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'postgres_18',
            uniqueConstraints: [
                {
                    name: 'uq',
                    columns: [
                        'id',
                    ],
                },
            ],
            partitions: [
                part('created_at', 'range'),
            ],
            columns: [
                col('id', 'integer'),
                col('created_at', 'timestamptz'),
            ],
            primaryKey: [
                'id',
                'created_at',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).toContain('POSTGRES_UNIQUE_INCLUDES_PARTITION_KEYS');
});

test('POSTGRES_UNIQUE_INCLUDES_PARTITION_KEYS stays silent when the unique includes the partition key', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'postgres_18',
            uniqueConstraints: [
                {
                    name: 'uq',
                    columns: [
                        'email',
                        'created_at',
                    ],
                },
            ],
            partitions: [
                part('created_at', 'range'),
            ],
            columns: [
                col('id', 'integer'),
                col('email', 'text'),
                col('created_at', 'timestamptz'),
            ],
            primaryKey: [
                'id',
                'created_at',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).not.toContain('POSTGRES_UNIQUE_INCLUDES_PARTITION_KEYS');
});

test('unique and check constraints are ignored for non-Postgres engines', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'hive_parquet',
            uniqueConstraints: [
                {
                    name: 'uq',
                    columns: [
                        'ghost',
                    ],
                },
            ],
            checkConstraints: [
                {
                    name: 'ck',
                    expression: 'ghost > 0',
                    columns: [
                        'ghost',
                    ],
                },
            ],
            columns: [
                col('a', 'int'),
            ],
            primaryKey: [
                'a',
            ],
        }),
    ]);
    const result = codes(runSemanticRules(world));
    expect(result).not.toContain('POSTGRES_UNIQUE_COLUMN_EXISTS');
    expect(result).not.toContain('POSTGRES_CHECK_COLUMN_EXISTS');
});

/// Iceberg sort order

function icebergWithSort(sortOrder: Array<{ column: string; direction: string; nullOrder: string; transform?: string }>) {
    return makeWorld([
        makeTable({
            name: 't',
            tableType: 'iceberg_parquet',
            sortOrder,
            columns: [
                col('a', 'long'),
                col('ts', 'timestamp'),
                col('name', 'string'),
            ],
            primaryKey: [
                'a',
            ],
        }),
    ]);
}

test('a valid Iceberg sort order produces no violations', () => {
    const result = runSemanticRules(icebergWithSort([
        {
            column: 'a',
            direction: 'asc',
            nullOrder: 'nulls-first',
        },
        {
            column: 'ts',
            direction: 'desc',
            nullOrder: 'nulls-last',
            transform: 'day',
        },
    ]));
    expect(result).toHaveLength(0);
});

test('ICEBERG_SORT_COLUMN_EXISTS fires when the sort column is missing', () => {
    const result = codes(runSemanticRules(icebergWithSort([
        {
            column: 'ghost',
            direction: 'asc',
            nullOrder: 'nulls-first',
        },
    ])));
    expect(result).toContain('ICEBERG_SORT_COLUMN_EXISTS');
});

test('ICEBERG_SORT_DIRECTION_VALID fires on an unknown direction', () => {
    const result = codes(runSemanticRules(icebergWithSort([
        {
            column: 'a',
            direction: 'ascending',
            nullOrder: 'nulls-first',
        },
    ])));
    expect(result).toContain('ICEBERG_SORT_DIRECTION_VALID');
});

test('ICEBERG_SORT_NULL_ORDER_VALID fires on an unknown null order', () => {
    const result = codes(runSemanticRules(icebergWithSort([
        {
            column: 'a',
            direction: 'asc',
            nullOrder: 'nulls_first',
        },
    ])));
    expect(result).toContain('ICEBERG_SORT_NULL_ORDER_VALID');
});

test('ICEBERG_SORT_TRANSFORM_VALID fires on an unknown transform', () => {
    const result = codes(runSemanticRules(icebergWithSort([
        {
            column: 'ts',
            direction: 'asc',
            nullOrder: 'nulls-first',
            transform: 'not_a_transform',
        },
    ])));
    expect(result).toContain('ICEBERG_SORT_TRANSFORM_VALID');
});

test('ICEBERG_SORT_TRANSFORM_TYPE_LEGAL fires when a transform is illegal on the column type', () => {
    const result = codes(runSemanticRules(icebergWithSort([
        {
            column: 'name',
            direction: 'asc',
            nullOrder: 'nulls-first',
            transform: 'hour',
        },
    ])));
    expect(result).toContain('ICEBERG_SORT_TRANSFORM_TYPE_LEGAL');
});

test('sort transform legality is skipped when the source type is unparseable', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'iceberg_parquet',
            sortOrder: [
                {
                    column: 'weird',
                    direction: 'asc',
                    nullOrder: 'nulls-first',
                    transform: 'identity',
                },
            ],
            columns: [
                col('weird', 'not_a_type'),
                col('a', 'long'),
            ],
            primaryKey: [
                'a',
            ],
        }),
    ]);
    expect(codes(runSemanticRules(world))).not.toContain('ICEBERG_SORT_TRANSFORM_TYPE_LEGAL');
});

test('NO_DUPLICATE_SORT_FIELDS fires on a repeated sort column', () => {
    const result = codes(runSemanticRules(icebergWithSort([
        {
            column: 'a',
            direction: 'asc',
            nullOrder: 'nulls-first',
        },
        {
            column: 'a',
            direction: 'desc',
            nullOrder: 'nulls-last',
        },
    ])));
    expect(result).toContain('NO_DUPLICATE_SORT_FIELDS');
});

test('an omitted sort transform collides with an explicit identity transform', () => {
    const result = codes(runSemanticRules(icebergWithSort([
        {
            column: 'a',
            direction: 'asc',
            nullOrder: 'nulls-first',
        },
        {
            column: 'a',
            direction: 'asc',
            nullOrder: 'nulls-first',
            transform: 'identity',
        },
    ])));
    expect(result).toContain('NO_DUPLICATE_SORT_FIELDS');
});

test('different transforms on the same sort column are distinct', () => {
    const result = codes(runSemanticRules(icebergWithSort([
        {
            column: 'ts',
            direction: 'asc',
            nullOrder: 'nulls-first',
            transform: 'year',
        },
        {
            column: 'ts',
            direction: 'asc',
            nullOrder: 'nulls-first',
            transform: 'month',
        },
    ])));
    expect(result).not.toContain('NO_DUPLICATE_SORT_FIELDS');
});

test('sort order is ignored for non-Iceberg engines', () => {
    const world = makeWorld([
        makeTable({
            name: 't',
            tableType: 'hive_parquet',
            sortOrder: [
                {
                    column: 'ghost',
                    direction: 'sideways',
                    nullOrder: 'whoknows',
                },
            ],
            columns: [
                col('a', 'int'),
            ],
            primaryKey: [
                'a',
            ],
        }),
    ]);
    const result = codes(runSemanticRules(world));
    expect(result).not.toContain('ICEBERG_SORT_COLUMN_EXISTS');
    expect(result).not.toContain('ICEBERG_SORT_DIRECTION_VALID');
});

/// Iceberg table properties

function icebergWithProps(tableProperties: Record<string, string>) {
    return makeWorld([
        makeTable({
            name: 't',
            tableType: 'iceberg_parquet',
            tableProperties,
            columns: [
                col('a', 'long'),
            ],
            primaryKey: [
                'a',
            ],
        }),
    ]);
}

test('ICEBERG_PROPERTY_ENUM_VALID fires on an unknown compression codec', () => {
    const result = codes(runSemanticRules(icebergWithProps({
        'write.parquet.compression-codec': 'brotli',
    })));
    expect(result).toContain('ICEBERG_PROPERTY_ENUM_VALID');
});

test('ICEBERG_PROPERTY_ENUM_VALID passes on a supported compression codec', () => {
    const result = codes(runSemanticRules(icebergWithProps({
        'write.parquet.compression-codec': 'zstd',
    })));
    expect(result).not.toContain('ICEBERG_PROPERTY_ENUM_VALID');
});

test('ICEBERG_PROPERTY_POSITIVE_INT fires on a zero snapshot age', () => {
    const result = codes(runSemanticRules(icebergWithProps({
        'history.expire.max-snapshot-age-ms': '0',
    })));
    expect(result).toContain('ICEBERG_PROPERTY_POSITIVE_INT');
});

test('ICEBERG_PROPERTY_POSITIVE_INT fires on a non-numeric value', () => {
    const result = codes(runSemanticRules(icebergWithProps({
        'write.target-file-size-bytes': 'big',
    })));
    expect(result).toContain('ICEBERG_PROPERTY_POSITIVE_INT');
});

test('ICEBERG_PROPERTY_POSITIVE_INT passes on a positive integer', () => {
    const result = codes(runSemanticRules(icebergWithProps({
        'write.target-file-size-bytes': '536870912',
    })));
    expect(result).not.toContain('ICEBERG_PROPERTY_POSITIVE_INT');
});

test('ICEBERG_PROPERTY_INT_RANGE fires on an out-of-range compression level', () => {
    const result = codes(runSemanticRules(icebergWithProps({
        'write.parquet.compression-level': '30',
    })));
    expect(result).toContain('ICEBERG_PROPERTY_INT_RANGE');
});

test('ICEBERG_PROPERTY_INT_RANGE fires on a non-numeric compression level', () => {
    const result = codes(runSemanticRules(icebergWithProps({
        'write.parquet.compression-level': 'high',
    })));
    expect(result).toContain('ICEBERG_PROPERTY_INT_RANGE');
});

test('ICEBERG_PROPERTY_INT_RANGE passes on an in-range compression level', () => {
    const result = codes(runSemanticRules(icebergWithProps({
        'write.parquet.compression-level': '6',
    })));
    expect(result).not.toContain('ICEBERG_PROPERTY_INT_RANGE');
});

test('unknown Iceberg table properties pass through unvalidated', () => {
    const result = runSemanticRules(icebergWithProps({
        'my.custom.key': 'whatever',
        'read.split.target-size': '134217728',
    }));
    expect(result).toHaveLength(0);
});

test('a fully valid Iceberg table-property set produces no violations', () => {
    const result = runSemanticRules(icebergWithProps({
        'write.format.default': 'parquet',
        'write.parquet.compression-codec': 'zstd',
        'write.parquet.compression-level': '9',
        'write.distribution-mode': 'hash',
        'write.target-file-size-bytes': '536870912',
        'history.expire.max-snapshot-age-ms': '604800000',
        'history.expire.min-snapshots-to-keep': '3',
        'write.metadata.compression-codec': 'gzip',
    }));
    expect(result).toHaveLength(0);
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
