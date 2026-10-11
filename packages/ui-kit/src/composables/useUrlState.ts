import { reactive, ref, watch } from 'vue';
import type { Ref } from 'vue';
import { useRoute } from 'vue-router';
import { useUrlSyncedState } from './useUrlSyncedState';

export interface UseUrlStateOptions<F> {
    // Keys edited by typing: they replace the history entry; other changes push a new one.
    typingKeys?: (keyof F)[];
}

// Reactive filters + page bound to the URL both ways: initialised from the query, written on
// change (filter change resets page to 1) and re-read on back/forward navigation.
export function useUrlState<F extends Record<string, string>>(
    defaults: F,
    options: UseUrlStateOptions<F> = {},
): { filters: F; page: Ref<number> } {
    const route = useRoute();
    const { fromQuery, toQuery } = useUrlSyncedState(defaults);
    const keys = Object.keys(defaults) as (keyof F)[];
    const typing = new Set<keyof F>(options.typingKeys ?? []);
    const filters = reactive({ ...defaults }) as F;
    const page = ref(1);
    let synced: F = { ...defaults };
    let syncedPage = 1;

    function readUrl(): void {
        Object.assign(filters, defaults);
        page.value = 1;
        fromQuery(filters, page);
        synced = { ...filters };
        syncedPage = page.value;
    }
    readUrl();

    watch(
        () => [...keys, 'page'].map(k => String(route.query[k as string] ?? '')).join('\u0000'),
        readUrl,
    );

    watch(
        () => [...keys.map(k => filters[k]), page.value],
        () => {
            const changed = keys.filter(k => filters[k] !== synced[k]);
            if (changed.length > 0 && page.value === syncedPage) page.value = 1;
            const replace = changed.length > 0 && changed.every(k => typing.has(k));
            const pageOnly = changed.length === 0 && page.value === syncedPage;
            synced = { ...filters };
            syncedPage = page.value;
            if (pageOnly) return;
            toQuery(filters, page, replace ? 'replace' : 'push');
        },
    );

    return { filters, page };
}
