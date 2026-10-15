import { ref, type Ref } from 'vue';

export interface UseLatestRequest<Args extends unknown[]> {
    loading: Ref<boolean>;
    run: (...args: Args) => Promise<void>;
}

// Responses can arrive out of order, and the last to arrive wins, so stale results must be dropped.
// The network request isn't cancelled (adminApi has no AbortSignal); only its result is ignored.
export function useLatestRequest<T, Args extends unknown[]>(
    fetcher: (...args: Args) => Promise<T>,
    onResult: (result: T) => void,
): UseLatestRequest<Args> {
    const loading = ref(false);
    let seq = 0;

    async function run(...args: Args): Promise<void> {
        const mySeq = ++seq;
        loading.value = true;
        try {
            const result = await fetcher(...args);
            if (mySeq !== seq) return;
            onResult(result);
        } finally {
            if (mySeq === seq) loading.value = false;
        }
    }

    return { loading, run };
}
