import { computed, ref, watch, type Ref } from 'vue';
import { useDebouncedCallback, useLatestRequest } from '@mivend/ui-kit';
import { fetchGlobalSearch, type SearchGroup } from '../api/globalSearch';

export const GLOBAL_SEARCH_MIN_CHARS = 2;
const DEBOUNCE_MS = 250;

export function useGlobalSearchResults(query: Ref<string>) {
    const groups = ref<SearchGroup[]>([]);
    const failed = ref(false);
    const settledTerm = ref('');
    const term = computed(() => query.value.trim());

    const { loading, run, cancel } = useLatestRequest(
        async (value: string) => {
            try {
                return { value, result: await fetchGlobalSearch(value), ok: true };
            } catch (e) {
                console.warn('[search] could not search:', e);
                return { value, result: [] as SearchGroup[], ok: false };
            }
        },
        r => {
            groups.value = r.result;
            failed.value = !r.ok;
            settledTerm.value = r.value;
        },
    );
    const runSoon = useDebouncedCallback((value: string) => void run(value), DEBOUNCE_MS);

    watch(term, value => {
        if (value.length < GLOBAL_SEARCH_MIN_CHARS) {
            cancel();
            groups.value = [];
            failed.value = false;
            settledTerm.value = '';
            return;
        }
        runSoon(value);
    });

    const active = computed(() => term.value.length >= GLOBAL_SEARCH_MIN_CHARS);
    const pending = computed(() => active.value && settledTerm.value !== term.value);
    return {
        groups,
        failed,
        loading,
        pending,
        active,
        tooShort: computed(() => term.value.length > 0 && !active.value),
        empty: computed(
            () => active.value && !pending.value && !failed.value && groups.value.length === 0,
        ),
    };
}
