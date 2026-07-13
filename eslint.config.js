import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier';

export default [
    js.configs.recommended,
    {
        files: ['**/*.ts'],
        languageOptions: {
            parser: tsParser,
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
        },
        rules: {
            ...tsPlugin.configs.recommended.rules,
            '@typescript-eslint/no-explicit-any': 'error',
            // allowExpressions: true is typescript-eslint's documented exemption for function
            // expressions that aren't part of a declaration (e.g. vue-router's
            // `component: () => import('...')` lazy routes, array/object literal callbacks) —
            // https://typescript-eslint.io/rules/explicit-function-return-type/. Named function
            // declarations and const-assigned arrow functions (the codebase's actual style for
            // exported/reusable functions) still require an explicit return type.
            '@typescript-eslint/explicit-function-return-type': ['warn', { allowExpressions: true }],
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            'no-undef': 'off',
        },
    },
    prettierConfig, // must be last — disables rules that conflict with prettier
    {
        ignores: ['**/dist/**', '**/node_modules/**', '**/storybook-static/**', 'infrastructure/scripts/**'],
    },
];
