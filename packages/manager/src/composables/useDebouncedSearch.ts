import { getCurrentInstance, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { useLatestRequest } from '@mivend/ui-kit/src/composables/useLatestRequest';

export interface DebouncedSearch<R> {
    term: Ref<string>;
    results: Ref<R>;
    loading: Ref<boolean>;
}

// One server request per pause in typing; a stale or post-clear response never overwrites newer state.
export function useDebouncedSearch<R>(
    fetcher: (term: string) => Promise<R>,
    empty: R,
    delayMs = 300,
): DebouncedSearch<R> {
    const term = ref('');
    const results = ref(empty) as Ref<R>;
    const { loading, run, cancel } = useLatestRequest(fetcher, items => {
        results.value = items;
    });
    let timer: ReturnType<typeof setTimeout> | undefined;

    watch(term, value => {
        clearTimeout(timer);
        if (!value.trim()) {
            cancel();
            results.value = empty;
            return;
        }
        timer = setTimeout(() => void run(value), delayMs);
    });
    if (getCurrentInstance()) onBeforeUnmount(() => clearTimeout(timer));

    return { term, results, loading };
}
