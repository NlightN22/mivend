import { computed, type ComputedRef, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { CatalogFacetsLabels } from '@mivend/ui-kit';

interface FacetGroupLike {
    code: string;
    name: string;
}

export function useCatalogFacetLabels<G extends FacetGroupLike>(
    facetGroups: Ref<G[]>,
): { labels: ComputedRef<CatalogFacetsLabels>; groups: ComputedRef<G[]> } {
    const { t, te } = useI18n();
    const labels = computed(() => ({
        category: t('catalogFacets.category'),
        availability: t('catalogFacets.availability'),
        inStockOnly: t('catalogFilters.inStock'),
        price: t('catalogFacets.price'),
        from: t('catalogFacets.from'),
        to: t('catalogFacets.to'),
        reset: t('catalogFacets.reset'),
    }));
    // Built-in facet codes get a UI title; characteristic facets keep their DB name.
    const groups = computed(() =>
        facetGroups.value.map(g => {
            const key = `catalogFacets.groups.${g.code}`;
            return te(key) ? { ...g, name: t(key) } : g;
        }),
    );
    return { labels, groups };
}
