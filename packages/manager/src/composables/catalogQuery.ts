import type { LocationQuery, LocationQueryRaw } from 'vue-router';

export interface CatalogUrlState {
    collection: string | undefined;
    facetValueIds: string[];
    inStock: boolean;
    priceMin: number | null;
    priceMax: number | null;
    page: number;
}

const str = (v: LocationQuery[string]): string | undefined =>
    typeof v === 'string' && v ? v : undefined;

function num(v: LocationQuery[string]): number | null {
    const n = Number(str(v));
    return str(v) !== undefined && Number.isFinite(n) ? n : null;
}

export function parseCatalogQuery(query: LocationQuery): CatalogUrlState {
    const page = Number(str(query.page));
    return {
        collection: str(query.collection),
        facetValueIds: (str(query.fv) ?? '').split(',').filter(Boolean),
        inStock: query.inStock === '1',
        priceMin: num(query.priceMin),
        priceMax: num(query.priceMax),
        page: Number.isInteger(page) && page > 0 ? page : 1,
    };
}

// Keeps unrelated query keys; omits defaults so a pristine catalog has a clean URL.
export function buildCatalogQuery(base: LocationQuery, state: CatalogUrlState): LocationQueryRaw {
    return {
        ...base,
        collection: state.collection,
        fv: state.facetValueIds.length ? state.facetValueIds.join(',') : undefined,
        inStock: state.inStock ? '1' : undefined,
        priceMin: state.priceMin === null ? undefined : String(state.priceMin),
        priceMax: state.priceMax === null ? undefined : String(state.priceMax),
        page: state.page > 1 ? String(state.page) : undefined,
    };
}
