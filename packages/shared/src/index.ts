export * from './sync';
export * from './testing/postgres-test-schema';
// vendure-events.ts is backend-only (imports @vendure/core) — same "never touched by Vite"
// carve-out as sync.ts above, see that comment.
export * from './vendure-events';

// Named (not `export *`) so tsc's CommonJS output produces static `exports.foo = ...`
// assignments — Vite/Rollup's CJS interop can't statically detect re-exports that only
// exist via the `export *` → `__exportStar` runtime loop, which broke storefront's build
// the first time this package was consumed by a Vite-bundled frontend (sync.ts is only ever
// consumed by ts-node/Node backend code, so it never hit this).
export {
    buildFacetValueFilters,
    buildFacetGroups,
    type FacetGroup,
    type FacetValue,
    type EsFacetValueResult,
} from './catalogFacets';

export {
    buildCategoryTree,
    resolveCategoryFacetValueId,
    type CollectionNode,
    type RawCollection,
} from './collectionTree';
