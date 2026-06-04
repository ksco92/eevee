module.exports = {
    testEnvironment: 'node',

    roots: [
        '<rootDir>/test',
    ],
    testMatch: [
        '**/*.test.ts',
    ],

    transform: {
        '^.+\\.tsx?$': [
            'ts-jest',
            {
                diagnostics: {
                    ignoreCodes: [
                        151002,
                    ],
                },
            },
        ],
    },

    collectCoverage: true,
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/cli.ts',
        '!src/index.ts',
    ],
    coverageDirectory: 'build/coverage',
    coverageReporters: [
        'html',
        'text-summary',
        'text',
        'lcov',
    ],
    coverageThreshold: {
        global: {
            statements: 95,
            branches: 95,
            functions: 95,
            lines: 95,
        },
    },
};
