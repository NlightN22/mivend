import { useRoute, useRouter } from 'vue-router';
import type { Ref } from 'vue';

// First implementation of AGENTS.md's Manager portal rule ("every page with search/filter/
// sort/pagination controls must sync that state to the URL, bidirectionally") — reusable for
// future page retrofits (see the rule's tracked rollout issue) rather than each page
// reinventing query-string serialization. Deliberately generic: a flat Record<string, string>
// of filter values plus a page number, nothing page-specific.
export function useUrlSyncedState<F extends Record<string, string>>(
    defaults: F,
): {
    fromQuery: (filters: F, page: Ref<number>) => void;
    toQuery: (filters: F, page: Ref<number>) => void;
} {
    const route = useRoute();
    const router = useRouter();

    function fromQuery(filters: F, page: Ref<number>): void {
        for (const key of Object.keys(defaults) as (keyof F)[]) {
            const value = route.query[key as string];
            if (typeof value === 'string') {
                filters[key] = value as F[typeof key];
            }
        }
        const pageParam = route.query.page;
        const parsedPage = typeof pageParam === 'string' ? Number(pageParam) : NaN;
        if (Number.isInteger(parsedPage) && parsedPage > 0) {
            page.value = parsedPage;
        }
    }

    // Uses router.replace, not push, so filter tweaks don't spam browser history — only real
    // navigation should create a history entry (see AGENTS.md).
    function toQuery(filters: F, page: Ref<number>): void {
        const query: Record<string, string> = {};
        for (const key of Object.keys(defaults) as (keyof F)[]) {
            const value = filters[key];
            if (value && value !== defaults[key]) {
                query[key as string] = value;
            }
        }
        if (page.value > 1) {
            query.page = String(page.value);
        }
        void router.replace({ query });
    }

    return { fromQuery, toQuery };
}
