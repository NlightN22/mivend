import { useRoute, useRouter } from 'vue-router';
import type { LocationQueryRaw } from 'vue-router';
import type { Ref } from 'vue';

export type UrlSyncMode = 'replace' | 'push';

export interface UrlSyncedState<F extends Record<string, string>> {
    fromQuery: (filters: F, page: Ref<number>) => void;
    toQuery: (filters: F, page: Ref<number>, mode?: UrlSyncMode) => void;
    pushQuery: (filters: F, page: Ref<number>) => void;
}

// Syncs a flat Record<string, string> of filters plus a `page` number with the URL query.
// Only the owned keys are touched; foreign keys (e.g. a parent's `tab`) are preserved.
export function useUrlSyncedState<F extends Record<string, string>>(
    defaults: F,
): UrlSyncedState<F> {
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

    function buildQuery(filters: F, page: Ref<number>): Record<string, string> {
        const query: Record<string, string> = {};
        for (const [key, value] of Object.entries(route.query)) {
            if (typeof value === 'string') query[key] = value;
        }
        for (const key of Object.keys(defaults) as (keyof F)[]) {
            const value = filters[key];
            if (value && value !== defaults[key]) {
                query[key as string] = value;
            } else {
                delete query[key as string];
            }
        }
        if (page.value > 1) {
            query.page = String(page.value);
        } else {
            delete query.page;
        }
        return query;
    }

    function isCurrent(query: Record<string, string>): boolean {
        const current = route.query;
        const keys = new Set([...Object.keys(query), ...Object.keys(current)]);
        return [...keys].every(k => (query[k] ?? undefined) === (current[k] ?? undefined));
    }

    function toQuery(filters: F, page: Ref<number>, mode: UrlSyncMode = 'replace'): void {
        const query = buildQuery(filters, page);
        if (isCurrent(query)) return;
        const location: { query: LocationQueryRaw } = { query };
        void (mode === 'push' ? router.push(location) : router.replace(location));
    }

    return {
        fromQuery,
        toQuery,
        pushQuery: (filters, page) => toQuery(filters, page, 'push'),
    };
}
