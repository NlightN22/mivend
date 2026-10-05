import { computed, type ComputedRef, type Ref } from 'vue';

import {
    applyCategoryCounts,
    buildCategoryPanel,
    type CategoryPanelData,
    type CollectionNode,
} from '../../../shared/src/collectionTree';

// With a search term the panel shows only categories that have matches, with their counts;
// otherwise the full category tree.
export function useCategoryPanel(
    collections: Ref<CollectionNode[]>,
    selectedSlug: Ref<string | undefined>,
    searchTerm: Ref<string>,
    categoryCounts: Ref<Map<string, number>>,
): ComputedRef<CategoryPanelData> {
    return computed(() => {
        const tree = searchTerm.value
            ? applyCategoryCounts(collections.value, categoryCounts.value)
            : collections.value;
        return buildCategoryPanel(tree, selectedSlug.value);
    });
}
