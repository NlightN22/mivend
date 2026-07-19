import { onUnmounted } from 'vue';

// Debounces any callback that shouldn't fire on every keystroke/tick — e.g. committing a text or
// number filter that triggers a server round-trip. Firing on every input event both hammers the
// backend with one request per keystroke and, for PrimeVue-driven filters specifically, causes a
// re-render of the filter control itself mid-word, which steals input focus (real incident:
// CustomerOrdersDataTable.vue's Order # and Total filters — see AGENTS.md's manager-portal
// rules). Extracted here after the same hand-rolled setTimeout pattern showed up a third time
// (MvCatalogFacets.vue's price range, then CustomerOrdersDataTable's code and total filters) —
// see AGENTS.md's tab-overflow-pattern precedent for the "two instances: note it, third instance:
// extract" rule this follows.
export function useDebouncedCallback<Args extends unknown[]>(
    fn: (...args: Args) => void,
    delayMs = 400,
): (...args: Args) => void {
    let timer: ReturnType<typeof setTimeout> | undefined;

    onUnmounted(() => clearTimeout(timer));

    return (...args: Args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delayMs);
    };
}
