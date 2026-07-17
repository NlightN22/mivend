import type { CodegenConfig } from '@graphql-codegen/cli';

// Requires the Vendure dev server running on localhost:3000 (see make dev) — introspection
// happens against the real Shop API schema, not a static SDL file.
const config: CodegenConfig = {
    schema: 'http://localhost:3000/shop-api',
    documents: 'src/**/*.graphql',
    ignoreNoDocuments: true,
    generates: {
        './src/api/generated/graphql.ts': {
            plugins: ['typescript', 'typescript-operations', 'typed-document-node'],
            config: {
                documentMode: 'string',
                skipTypename: true,
            },
        },
    },
};

export default config;
