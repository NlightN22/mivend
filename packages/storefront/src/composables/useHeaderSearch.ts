import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { SuggestionGroup, SuggestionItem } from '@mivend/ui-kit';
import { useCatalogStore } from '../stores/catalog';
import { buildSearchLocation, clearedSearchLocation, resolveScopeLabel } from './searchScope';
import { useSearchSuggestions } from './useSearchSuggestions';

export function useHeaderSearch(): {
    searchQuery: Ref<string>;
    scopeLabel: ComputedRef<string | undefined>;
    suggestions: Ref<SuggestionGroup[] | undefined>;
    onSelectSuggestion: (item: SuggestionItem) => void;
    onSearch: (value: string) => void;
    onRemoveScope: () => void;
} {
    const router = useRouter();
    const route = useRoute();
    const catalogStore = useCatalogStore();
    const searchQuery = ref((route.query.q as string) ?? '');
    const scopeSlug = computed(() => (route.query.collection as string) || undefined);
    const scopeLabel = computed(() => resolveScopeLabel(catalogStore.collections, scopeSlug.value));
    const suggestions = useSearchSuggestions(searchQuery, scopeSlug);

    watch(
        () => route.query.q,
        q => {
            searchQuery.value = (q as string) ?? '';
        },
    );
    watch(searchQuery, value => {
        const target = clearedSearchLocation(
            value,
            route.query.q as string | undefined,
            scopeSlug.value,
        );
        if (target) router.push(target);
    });

    return {
        searchQuery,
        scopeLabel,
        suggestions,
        onSelectSuggestion: item => {
            if (item.to) router.push(item.to);
        },
        onSearch: value => router.push(buildSearchLocation(value, scopeSlug.value)),
        onRemoveScope: () =>
            router.push(buildSearchLocation((route.query.q as string) ?? '', undefined)),
    };
}
