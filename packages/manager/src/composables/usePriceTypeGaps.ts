import { ref } from 'vue';
import { useLatestRequest } from '@mivend/ui-kit';
import { fetchPriceTypeGaps, type PriceTypeGapRow } from '../api/priceTypeGaps';

export function usePriceTypeGaps() {
    const error = ref('');
    const items = ref<PriceTypeGapRow[]>([]);
    const total = ref(0);
    const page = ref(1);
    const pageSize = ref(20);
    const search = ref('');

    const { loading, run } = useLatestRequest(
        () =>
            fetchPriceTypeGaps({
                skip: (page.value - 1) * pageSize.value,
                take: pageSize.value,
                search: search.value,
            }),
        r => {
            items.value = r.items;
            total.value = r.totalItems;
        },
    );

    async function load(): Promise<void> {
        try {
            await run();
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Could not load the list';
        }
    }

    return { error, items, total, page, pageSize, search, loading, load };
}
