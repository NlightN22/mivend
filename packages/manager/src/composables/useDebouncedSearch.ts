import { getCurrentInstance, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { useLatestRequest } from '@mivend/ui-kit/src/composables/useLatestRequest';

export interface DebouncedSearch<T> {
    term: Ref<string>;
    results: Ref<T[]>;
    loading: Ref<boolean>;
}

// One server request per pause in typing; a stale response never overwrites a newer one.
export function useDebouncedSearch<T>(
    fetcher: (term: string) => Promise<T[]>,
    delayMs = 300,
): DebouncedSearch<T> {
    const term = ref('');
    const results = ref<T[]>([]) as Ref<T[]>;
    const { loading, run } = useLatestRequest(fetcher, items => {
        results.value = items;
    });
    let timer: ReturnType<typeof setTimeout> | undefined;

    watch(term, value => {
        clearTimeout(timer);
        if (!value.trim()) {
            results.value = [];
            return;
        }
        timer = setTimeout(() => void run(value), delayMs);
    });
    if (getCurrentInstance()) onBeforeUnmount(() => clearTimeout(timer));

    return { term, results, loading };
}
