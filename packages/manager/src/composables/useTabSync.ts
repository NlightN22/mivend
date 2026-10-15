import { ref, watch } from 'vue';
import type { Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

// Vue watch() skips same-value writes, so a shared sync flag can get stuck; keep one router writer.
// The route-to-tab watcher must never write back to the router.
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

    // Tabs can't clear each other's query keys, so switching must drop all of them.
    // Await router.replace before setting activeTab: the new tab's restore-on-mount reads the query.
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
