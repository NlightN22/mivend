import { ref, type Ref } from 'vue';
import { shopApi } from '../api/client';
import { SearchCapabilitiesDocument } from '../api/generated/graphql';
import { toSortOptions, type SortOption } from './search-sort';

const sortOptions = ref<SortOption[]>(toSortOptions(['relevance']));
const priceRange = ref(false);
let loading: Promise<void> | null = null;

async function fetchCapabilities(): Promise<void> {
    try {
        const { searchCapabilities } = await shopApi(SearchCapabilitiesDocument, {});
        sortOptions.value = toSortOptions(searchCapabilities.sortKeys);
        priceRange.value = searchCapabilities.priceRange;
    } catch {
        loading = null;
    }
}

function loadOnce(): Promise<void> {
    loading ??= fetchCapabilities();
    return loading;
}

export function useSearchCapabilities(): {
    sortOptions: Ref<SortOption[]>;
    priceRange: Ref<boolean>;
    ready: Promise<void>;
} {
    return { sortOptions, priceRange, ready: loadOnce() };
}
