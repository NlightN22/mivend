import type { CodegenConfig } from '@graphql-codegen/cli';

// Needs the Vendure dev server on localhost:3000; introspects the live Admin API, not a static SDL.
// avoidOptionals: manager types nullable fields as `T | null` (required key), not optional.
const config: CodegenConfig = {
    schema: 'http://localhost:3000/admin-api',
    documents: 'src/**/*.graphql',
    ignoreNoDocuments: true,
    generates: {
        './src/api/generated/graphql.ts': {
            plugins: ['typescript', 'typescript-operations', 'typed-document-node'],
            config: {
                documentMode: 'string',
                skipTypename: true,
                avoidOptionals: { field: true },
                // Call sites use plain string literals ('ASC', 'RUB'), not enum members, so the
                // plugin's default real-enum output would reject them ('ASC' not assignable to SortOrder).
                enumsAsTypes: true,
            },
        },
    },
};

export default config;
