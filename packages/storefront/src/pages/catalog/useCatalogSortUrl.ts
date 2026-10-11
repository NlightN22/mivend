import { watch } from 'vue';
import type { Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const DEFAULT_SORT = 'relevance';

export function useCatalogSortUrl(sortKey: Ref<string>): void {
    const route = useRoute();
    const router = useRouter();

    watch(sortKey, key => {
        const current = (route.query.sort as string) || DEFAULT_SORT;
        if (key === current) return;
        void router.push({
            query: { ...route.query, sort: key === DEFAULT_SORT ? undefined : key },
        });
    });

    watch(
        () => route.query.sort,
        sort => {
            sortKey.value = (sort as string) || DEFAULT_SORT;
        },
    );
}
