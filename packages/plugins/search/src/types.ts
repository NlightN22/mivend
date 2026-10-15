import type { SearchInput } from '@vendure/common/lib/generated-types';
import { Logger } from '@vendure/core';

export const loggerCtx = 'SearchPlugin';

export type SearchBackend = 'internal' | 'external';

// Read once at bootstrap, never toggled at runtime; both backends never active, no fallback.
// Defaults to 'internal' so an unset SEARCH_BACKEND fails safe to the existing behavior.
export const SEARCH_BACKEND_DEFAULT: SearchBackend = 'internal';

export function getSearchBackend(): SearchBackend {
    const raw = process.env.SEARCH_BACKEND;
    if (raw === 'internal' || raw === 'external') return raw;
    if (raw !== undefined) {
        Logger.warn(
            `Unrecognized SEARCH_BACKEND="${raw}", falling back to "${SEARCH_BACKEND_DEFAULT}"`,
            loggerCtx,
        );
    }
    return SEARCH_BACKEND_DEFAULT;
}

// ElasticsearchPlugin adds `inStock` to SearchInput; the external backend's schema does the same.
export type ShopSearchInput = SearchInput & {
    inStock?: boolean | null;
    priceRangeWithTax?: { min: number; max: number } | null;
};
