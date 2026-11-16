import { Ref, ref } from 'vue';
import { tr } from '../utils/lazyLabels';
import { useLatestRequest } from '@mivend/ui-kit';
import { fetchPriceTypeGaps, type PriceTypeGapRow } from '../api/priceTypeGaps';

export interface UsePriceTypeGaps {
    error: Ref<string>;
    items: Ref<PriceTypeGapRow[]>;
    total: Ref<number>;
    page: Ref<number>;
    pageSize: Ref<number>;
    search: Ref<string>;
    loading: Ref<boolean>;
    load: () => Promise<void>;
}

export function usePriceTypeGaps(): UsePriceTypeGaps {
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
            error.value =
                e instanceof Error ? e.message : tr('settingsSystem.priceTypeGaps.loadFailed');
        }
    }

    return { error, items, total, page, pageSize, search, loading, load };
}
