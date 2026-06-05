/**
 * ESLint flat-config for the FDD core package (ESLint >= v9).
 *
 * Mirrors the arceus repo's config:
 * 1. Base JS rules + Node globals.
 * 2. TypeScript: parser + rules from @typescript-eslint.
 * 3. Tests: Jest plugin flat preset + combined Node/Jest globals.
 */

const js = require('@eslint/js');
const globalsDB = require('globals');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const jestPlugin = require('eslint-plugin-jest');

const styleRules = {
    'comma-dangle': [
        'error',
        'always-multiline',
    ],
    'indent': [
        'error',
        4,
        {
            SwitchCase: 1,
        },
    ],
    'array-bracket-newline': [
        'error',
        {
            minItems: 1,
        },
    ],
    'array-element-newline': [
        'error',
        {
            minItems: 2,
        },
    ],
    'object-curly-newline': [
        'error',
        {
            minProperties: 1,
        },
    ],
    'object-property-newline': [
        'error',
        {
            allowAllPropertiesOnSameLine: false,
        },
    ],
};

/** @type {import('eslint').Linter.FlatConfig[]} */
module.exports = [
    {
        ignores: [
            'node_modules/**',
            '**/*.d.ts',
            '**/*.js',
            'coverage/**',
            'dist/**',
            'build/**',
        ],
    },
    {
        ...js.configs.recommended,
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globalsDB.node,
            },
        },
        rules: {
            ...styleRules,
        },
    },

    {
        files: [
            '**/*.ts',
            '**/*.tsx',
        ],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                project: './tsconfig.json',
                ecmaVersion: 'latest',
                sourceType: 'module',
            },
            globals: {
                ...globalsDB.node,
            },
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
        },
        rules: {
            ...tsPlugin.configs.recommended.rules,
            ...styleRules,
        },
    },

    {
        files: [
            '**/*.test.ts',
            '**/*.test.tsx',
        ],
        ...jestPlugin.configs['flat/recommended'],
        languageOptions: {
            globals: {
                ...globalsDB.node,
                ...globalsDB.jest,
            },
        },
        rules: {
            'jest/expect-expect': [
                'error',
                {
                    assertFunctionNames: [
                        'expect',
                    ],
                },
            ],
        },
    },
];
