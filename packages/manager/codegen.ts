import type { CodegenConfig } from '@graphql-codegen/cli';

// Requires the Vendure dev server running on localhost:3000 (see make dev) — introspection
// happens against the real Admin API schema, not a static SDL file. Mirrors
// packages/storefront/codegen.ts exactly, pointed at /admin-api instead of /shop-api.
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
            },
        },
    },
};

export default config;
