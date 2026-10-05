import { ref, watch, type Ref } from 'vue';
import { useDebouncedCallback, useLatestRequest, type SuggestionGroup } from '@mivend/ui-kit';
import { shopApi } from '../api/client';
import { SearchSuggestionsDocument } from '../api/generated/graphql';

const MIN_TERM_LENGTH = 2;
const DEBOUNCE_MS = 250;

// `undefined` hides the dropdown (too short, in flight, failed); `[]` means a finished search found nothing.
export function useSearchSuggestions(
    query: Ref<string>,
    collectionSlug: Ref<string | undefined>,
): Ref<SuggestionGroup[] | undefined> {
    const groups = ref<SuggestionGroup[] | undefined>(undefined);

    const { run } = useLatestRequest(
        (term: string, slug: string | undefined) =>
            shopApi(SearchSuggestionsDocument, { term, collectionSlug: slug }),
        result => {
            const items = result.search.items.map(item => ({
                id: item.productId,
                label: item.productName,
                subtitle: [item.manufacturer?.name, item.sku].filter(Boolean).join(' · '),
                to: `/product/${item.slug}`,
            }));
            groups.value = items.length > 0 ? [{ type: 'products', label: 'Products', items }] : [];
        },
    );

    const debouncedRun = useDebouncedCallback((term: string) => {
        run(term, collectionSlug.value).catch(() => {
            groups.value = undefined;
        });
    }, DEBOUNCE_MS);

    watch(query, value => {
        const term = value.trim();
        groups.value = undefined;
        if (term.length >= MIN_TERM_LENGTH) debouncedRun(term);
    });

    return groups;
}
