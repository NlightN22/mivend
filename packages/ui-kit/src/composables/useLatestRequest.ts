import { ref, type Ref } from 'vue';

export interface UseLatestRequest<Args extends unknown[]> {
    loading: Ref<boolean>;
    run: (...args: Args) => Promise<void>;
}

// Guards a reactive-params-driven async fetch (page/filter/sort change -> refetch) against an
// out-of-order network response overwriting fresher state. Real incident this generalizes:
// PrimeVue's paginator doesn't disable itself while a page fetch is in flight, so a second
// page-change click can start a new fetch before the first one's response resolves — over real
// network latency (a VPN/proxy hop, not localhost's near-zero latency), whichever response
// arrives *last* wins by default, not whichever was requested last, so a user could see "page 2"
// showing page 3's rows with page 3 itself empty. This is a generic version of the ad hoc
// `loadSeq`/`seq` counter that first fixed it in two places (CustomerOrdersTab.vue/
// CustomerInvoicesTab.vue) — same "two instances, extract" precedent as this project's other
// shared composables (see e.g. useDebouncedCallback's own doc comment).
//
// This doesn't cancel the stale network request itself (this project's `adminApi` client has no
// `AbortSignal` support to cancel through yet — that would be the more complete fix, see
// AGENTS.md's manager-portal rules) — it only guarantees a stale response is never *applied*.
// `loading` reflects only the latest call, matching what `run`'s caller actually cares about.
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
