import type { CodegenConfig } from '@graphql-codegen/cli';

// Requires the Vendure dev server running on localhost:3000 (see make dev) — introspection
// happens against the real Admin API schema, not a static SDL file. Mirrors
// packages/storefront/codegen.ts, pointed at /admin-api instead of /shop-api — with one
// deliberate deviation: `avoidOptionals` for nullable fields. Manager's pre-codegen API layer
// consistently hand-typed nullable-but-always-present GraphQL fields as `field: T | null`
// (required key), not `field?: T | null` (optional key) — the plugin's default. Matching that
// (rather than storefront's default, which its own consumers were written against) avoids a
// `T | null | undefined` vs `T | null` mismatch at nearly every call site across the whole
// existing manager codebase during the file-by-file migration (issue #86).
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
                // Every existing manager call site treats sort directions/currency codes/etc. as
                // plain string literals ('ASC', 'RUB', ...), never as an imported TS enum member
                // — without this, every such literal fails to type-check against the plugin's
                // default real-`enum` output (e.g. "ASC" not assignable to SortOrder).
                enumsAsTypes: true,
            },
        },
    },
};

export default config;
