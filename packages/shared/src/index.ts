export * from './sync';
export * from './testing/postgres-test-schema';
export * from './testing/transactional-test-connection';
export * from './testing/query-counting-logger';
// vendure-events.ts is backend-only (imports @vendure/core) — same "never touched by Vite"
// carve-out as sync.ts above, see that comment.
export * from './vendure-events';
export {
    FREIGHT_SHIPPING_METHOD_CODE,
    PICKUP_SHIPPING_METHOD_CODE,
    hasFreightShippingLine,
} from './deliveryMethods';
export { lockAggregates, withAggregateLock } from './aggregate-lock';
export { withOrderCancelLocks } from './order-cancel-locks';
export { withSavepoint } from './savepoint';
export { ctxQuery } from './ctx-query';
export { CtxLoader } from './ctx-loader';
export { contentHash } from './content-hash';
export { replaceMembership } from './replace-membership';
export type { MembershipTable } from './replace-membership';

// Named re-exports, not `export *`: Vite/Rollup CJS interop can't detect the __exportStar loop
// tsc must emit static `exports.foo = ...` assignments for browser-bundled consumers.
export { CREDIT_LIMIT_EXCEEDED_KEY } from './creditLimit';
export {
    AWAITING_MANAGER_KEY,
    CARD_AMOUNT_CHANGED_CODE,
    CREDIT_ACKNOWLEDGED_KEY,
    EXPECTED_AMOUNT_KEY,
    DEFAULT_PREPAYMENT_RESERVE_DAYS,
    DEFAULT_PROFORMA_PAYMENT_TERM_DAYS,
    PAYMENT_FORMS,
    PAYMENT_FORM_BY_METHOD_CODE,
    PLACEMENT_KEY,
    type PaymentForm,
    type PlacementMetadata,
    type PlacementRoute,
} from './paymentPolicy';

export {
    buildFacetValueFilters,
    buildFacetGroups,
    type FacetGroup,
    type FacetValue,
    type EsFacetValueResult,
} from './catalogFacets';

export {
    buildCategoryTree,
    buildCategoryPanel,
    applyCategoryCounts,
    findCategoryPath,
    filterVisibleCrumbs,
    fetchAllCollections,
    COLLECTIONS_PAGE_SIZE,
    type CategoryCrumb,
    type CategoryPanelData,
    resolveCategoryFacetValueId,
    type CollectionNode,
    type RawCollection,
} from './collectionTree';

// Backend-only (imports Node's `crypto`) — same "never touched by Vite" carve-out as
// vendure-events.ts above.

export { isUnconfirmedTaxRateName, unconfirmedTaxRateName } from './vatRate';
export { cronEveryMs } from './scheduled-task-cron';
export {
    CATEGORY_FACET_CODE,
    CATEGORY_SLUG_PREFIX,
    buildCategoryFacetFilter,
    categorySlug,
    categoryErpIdFromSlug,
    collectFacetValueIds,
    planCategoryVisibilityUpdates,
    resolveCategoryIsPrivate,
    type CategoryVisibilityNode,
} from './categoryCollectionFilter';
export {
    CATEGORY_TREE_LOCK,
    CATEGORY_TREE_LOCK_IDLE_MS,
    CATEGORY_TREE_LOCK_OPTIONS,
    CATEGORY_TREE_LOCK_SLOW_HOLD_MS,
    CATEGORY_TREE_LOCK_WAIT_MS,
    recomputeCategoryTree,
} from './recomputeCategoryTree';
export {
    HIDDEN_CATEGORY_FACET_VALUE_IDS_SQL,
    MAX_EXCLUDE_CATEGORY_IDS,
    excludeCategoryIdsFor,
    productInHiddenCategorySql,
    productNotInHiddenCategorySql,
    type HiddenCategoryRow,
} from './hiddenCategoryProducts';
export {
    ensureParentCategoryCollection,
    moveCategoryIfParentChanged,
} from './categoryParentCollection';
export {
    CHARACTERISTIC_FACET_PREFIX,
    characteristicFacetCode,
    characteristicKeyFromFacetCode,
} from './characteristicFacet';
export { UuidEntity } from './uuid-entity';
export { documentNumberSearchTerm, normalizeDocumentNumber } from './documentNumberSearch';
export {
    API_KEY_MIN_LENGTH,
    extractApiKey,
    isApiKeyUsable,
    ERP_CALLBACK_DEV_PLACEHOLDER_KEY,
    isRestSurfaceEnabled,
    productionRejectValues,
    verifyApiKey,
    type ApiKeyHeaders,
    type ApiKeyOptions,
} from './api-key';
export { isNewerVersion, shouldApplyDocument } from './ordering-version';
export { bigintNumber, toMinorUnits } from './money';

export { classifySelectionFilter } from './selection-filter';
export type { FilterClassification, FilterField, FilterSide, FilterTerm } from './selection-filter';
export { evaluateCounterpartyTerms, evaluateProductTerms } from './selection-filter-eval';
export type { ProductAttributes, RefResolution } from './selection-filter-eval';
export { loadFilterTerms, replaceFilterTerms } from './filter-terms';
export type { FilterTermTable } from './filter-terms';
export * from './contactValidation';
