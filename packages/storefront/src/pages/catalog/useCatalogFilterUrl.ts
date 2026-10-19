import { nextTick, ref, watch, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { FacetGroup, FilterState } from '../../composables/useProductList';
// Imports the TS source directly — see the comment in useProductList.ts for why 'shared''s
// compiled package output breaks a Vite production build.
import { resolveCategoryFacetValueId } from '../../../../shared/src/collectionTree';

export interface CatalogFilterUrl {
    searchQuery: Ref<string>;
    filters: Ref<FilterState>;
    bindFacetGroups: (facetGroups: Ref<FacetGroup[]>) => void;
    toggleFacetValue: (id: string) => void;
    clearFacetValues: (ids: string[]) => void;
    resetFilters: () => void;
}

export function useCatalogFilterUrl(): CatalogFilterUrl {
    const route = useRoute();
    const router = useRouter();

    function parseFiltersFromQuery(): FilterState {
        const fv = route.query.fv ? String(route.query.fv).split(',').filter(Boolean) : [];
        return {
            facetValueIds: fv,
            inStock: route.query.inStock === '1',
            priceMin: route.query.priceMin ? Number(route.query.priceMin) : null,
            priceMax: route.query.priceMax ? Number(route.query.priceMax) : null,
        };
    }

    const searchQuery = ref((route.query.q as string) ?? '');
    const pendingCategorySlug = ref<string | undefined>(
        route.query.q ? undefined : (route.query.collection as string) || undefined,
    );
    const filters = ref<FilterState>(parseFiltersFromQuery());

    let programmaticChange = false;
    function runProgrammatically(change: () => void): void {
        programmaticChange = true;
        change();
        void nextTick(() => {
            programmaticChange = false;
        });
    }

    let syncingFromUrl = false;
    watch(
        filters,
        f => {
            if (syncingFromUrl) return;
            const query = {
                ...route.query,
                fv: f.facetValueIds.length ? f.facetValueIds.join(',') : undefined,
                inStock: f.inStock ? '1' : undefined,
                priceMin: f.priceMin ?? undefined,
                priceMax: f.priceMax ?? undefined,
            };
            const same = (['fv', 'inStock', 'priceMin', 'priceMax'] as const).every(
                k => String(query[k] ?? '') === String(route.query[k] ?? ''),
            );
            if (same) return;
            // User changes get a history entry; programmatic resets must not add one.
            if (programmaticChange) router.replace({ query });
            else router.push({ query });
        },
        { deep: true },
    );

    function resetFilters(): void {
        pendingCategorySlug.value = undefined;
        filters.value = { facetValueIds: [], inStock: false, priceMin: null, priceMax: null };
    }

    function bindFacetGroups(facetGroups: Ref<FacetGroup[]>): void {
        watch(facetGroups, groups => {
            if (!pendingCategorySlug.value) return;
            const valueId = resolveCategoryFacetValueId(pendingCategorySlug.value, groups);
            if (!valueId) return;
            runProgrammatically(() => {
                filters.value = { ...filters.value, facetValueIds: [valueId] };
            });
            pendingCategorySlug.value = undefined;
        });
    }

    watch(
        () => route.query.q,
        q => {
            searchQuery.value = (q as string) ?? '';
            pendingCategorySlug.value = undefined;
            runProgrammatically(resetFilters);
        },
    );

    watch(
        () => route.query.collection,
        slug => {
            // resetFilters() also clears pendingCategorySlug, so it must run before the assignment.
            runProgrammatically(resetFilters);
            if (!searchQuery.value) pendingCategorySlug.value = (slug as string) || undefined;
        },
    );

    // Restore filters when navigating back via browser history.
    watch(
        () =>
            [route.query.fv, route.query.inStock, route.query.priceMin, route.query.priceMax].join(
                '|',
            ),
        () => {
            syncingFromUrl = true;
            filters.value = parseFiltersFromQuery();
            syncingFromUrl = false;
        },
    );

    return {
        searchQuery,
        filters,
        bindFacetGroups,
        toggleFacetValue: id => {
            const ids = filters.value.facetValueIds;
            filters.value = {
                ...filters.value,
                facetValueIds: ids.includes(id) ? ids.filter(v => v !== id) : [...ids, id],
            };
        },
        clearFacetValues: ids => {
            filters.value = {
                ...filters.value,
                facetValueIds: filters.value.facetValueIds.filter(v => !ids.includes(v)),
            };
        },
        resetFilters,
    };
}
