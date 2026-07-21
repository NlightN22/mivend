import { ref, watch } from 'vue';
import type { Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

// Extracted out of CustomerDetailPage.vue so this small state machine is unit-testable in
// isolation, without mounting the whole page (auth store, GraphQL fetches, etc.) — see
// AGENTS.md's test-design "minimum sufficient level" rule.
//
// Real regression this fixes: the original inline version used
// `watch(activeTab, tab => router.replace({ query: { ...route.query, tab } }))` plus a second
// `watch(() => route.query.tab, () => activeTab.value = tabFromQuery())` guarded by a mutable
// `syncingFromRoute` flag meant to stop the two watchers from fighting each other. That flag got
// permanently desynced after exactly one real tab switch: Vue's `watch()` never refires from a
// same-value ref write, so when `router.replace` round-tripped back through the route watcher and
// tried to set `activeTab.value` to the value it already had, that assignment was silently a
// no-op — the flag it had just set to `true` was never cleared, so the *next* real tab click found
// the flag still `true` and skipped its own `router.replace` entirely. The net effect: every other
// tab click silently stopped updating the URL (reported live: "нихера нормально не работает"
// clicking tabs back and forth).
//
// Fixed by removing the flag/back-channel entirely: a real, user-initiated switch
// (`selectTab`) is the *only* thing that ever writes to the router, and it always writes
// unconditionally. The query watcher is purely one-directional (route → activeTab), used for
// external navigation (browser back/forward, a pasted URL) — it never writes back, so there is
// nothing for it to fight over.
export function useTabSync<T extends string>(
    validTabs: readonly T[],
    fallback: T,
): { activeTab: Ref<T>; selectTab: (tab: T) => Promise<void> } {
    const route = useRoute();
    const router = useRouter();

    function tabFromQuery(): T {
        const q = route.query.tab;
        return typeof q === 'string' && (validTabs as readonly string[]).includes(q)
            ? (q as T)
            : fallback;
    }

    const activeTab = ref(tabFromQuery()) as Ref<T>;

    // A real tab switch drops every other tab's own filter query params — each tab owns a
    // disjoint set of keys via its own useUrlSyncedState call (see CustomerOrdersTab.vue etc.),
    // and none of them know about each other's keys, so nothing else would clear them. Real bug
    // this fixes (a separate, earlier regression): switching from Orders (with filters active) to
    // Invoices left Orders' filter params sitting in the URL, visible/shareable even though
    // Invoices' own UI showed no corresponding active filter.
    //
    // `router.replace` is awaited *before* `activeTab` is written — not fire-and-forget. A second
    // real regression this fixes: `router.replace` resolves asynchronously, but the old
    // fire-and-forget version wrote `activeTab.value` synchronously first, so the template's
    // `v-else-if="activeTab === '<tab>'"` mounted the next tab's component on the very same tick,
    // before the query string was actually cleared — that new tab's own `useUrlSyncedState`
    // restore-on-mount block then read the *previous* tab's still-present query params. Two
    // different tabs happening to use the same filter key name (e.g. both Payments and Discounts
    // have their own, unrelated `status` filter) meant a value from one tab's status filter
    // silently became the other tab's active filter on switch — reported live: switching from
    // Payments (status=chargeback) straight to Discounts showed a "Status: chargeback" chip on a
    // table that has no such status at all. Awaiting means the query is already clean by the time
    // the next tab's component exists to read it.
    async function selectTab(tab: T): Promise<void> {
        await router.replace({ query: { tab } });
        activeTab.value = tab;
    }

    watch(
        () => route.query.tab,
        () => {
            activeTab.value = tabFromQuery();
        },
    );

    return { activeTab, selectTab };
}
