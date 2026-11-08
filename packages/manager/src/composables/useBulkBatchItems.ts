import { ref, watch, type Ref } from 'vue';
import { useLatestRequest } from '@mivend/ui-kit';
import { ITEMS_PAGE_SIZE, fetchBulkBatchItems, type BulkBatchItem } from '../api/bulkOperations';

export interface BulkBatchItemsState {
    items: Ref<BulkBatchItem[]>;
    totalItems: Ref<number>;
    page: Ref<number>;
    outcome: Ref<string>;
    loading: Ref<boolean>;
    error: Ref<string>;
    reload: () => void;
}

// The per-record rows of one batch; `refreshKey` changes while the batch runs so counters and rows stay in step.
export function useBulkBatchItems(
    uuid: Ref<string | null>,
    refreshKey: Ref<unknown>,
): BulkBatchItemsState {
    const items = ref<BulkBatchItem[]>([]);
    const totalItems = ref(0);
    const page = ref(1);
    const outcome = ref('');
    const error = ref('');

    const { loading, run } = useLatestRequest(
        async () => {
            if (!uuid.value) return null;
            try {
                error.value = '';
                return await fetchBulkBatchItems(uuid.value, page.value, outcome.value);
            } catch (e) {
                error.value = e instanceof Error ? e.message : 'Could not load the records';
                return null;
            }
        },
        result => {
            items.value = result?.items ?? [];
            totalItems.value = result?.totalItems ?? 0;
        },
    );
    const reload = (): void => void run();

    watch([uuid, outcome], () => {
        page.value = 1;
    });
    watch([uuid, outcome, page, refreshKey], reload, { immediate: true });

    return { items, totalItems, page, outcome, loading, error, reload };
}

export { ITEMS_PAGE_SIZE };
