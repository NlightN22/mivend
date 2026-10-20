import { computed, type ComputedRef, type Ref } from 'vue';
import { useDocuments, type DocumentSummary } from '../documents/useDocuments';
import { useOrders } from '../orders/useOrders';
import { useOrderStatusesStore } from '../../stores/orderStatuses';
import { countIssuedThisMonth, monthCountLabel } from './dashboardCounts';

const DOCUMENTS_SCAN = 10;
const IN_PROCESSING_GROUP = 'pending';

export interface AccountSummary {
    documents: Ref<DocumentSummary[]>;
    documentsLoading: Ref<boolean>;
    documentsError: Ref<unknown>;
    documentsThisMonth: ComputedRef<{ n: number; label: string } | null>;
    activeOrders: ComputedRef<number | null>;
    inProcessingOrders: ComputedRef<number | null>;
    loadDocuments: () => Promise<void>;
    load: () => void;
}

// One documents fetch and two order counts shared by the dashboard cards, quick actions and documents block.
export function useAccountSummary(): AccountSummary {
    const docs = useDocuments();
    const active = useOrders();
    const inProcessing = useOrders();
    const statuses = useOrderStatusesStore();

    const documentsThisMonth = computed(() => {
        if (docs.loading.value || docs.error.value) return null;
        const value = countIssuedThisMonth(
            docs.documents.value.map(d => String(d.issueDate)),
            docs.totalItems.value,
            new Date(),
        );
        return { n: value.count, label: monthCountLabel(value) };
    });

    const countOf = (source: ReturnType<typeof useOrders>): ComputedRef<number | null> =>
        computed(() =>
            source.loading.value || source.error.value || !statuses.loaded
                ? null
                : source.totalItems.value,
        );

    function loadDocuments(): Promise<void> {
        return docs.load({ take: DOCUMENTS_SCAN, skip: 0 });
    }

    async function loadOrders(): Promise<void> {
        await statuses.load();
        // Without the dictionary there are no final codes and the active count would include closed orders.
        if (!statuses.loaded) return;
        const inProcessingCodes = statuses.codesInGroups([IN_PROCESSING_GROUP]);
        await Promise.all([
            active.load({ take: 1, skip: 0, excludeErpStatuses: statuses.finalCodes }),
            inProcessingCodes.length
                ? inProcessing.load({ take: 1, skip: 0, erpStatuses: inProcessingCodes })
                : undefined,
        ]);
    }

    function load(): void {
        void loadDocuments();
        void loadOrders().catch(e => console.error('[useAccountSummary]', e));
    }

    return {
        documents: docs.documents,
        documentsLoading: docs.loading,
        documentsError: docs.error,
        documentsThisMonth,
        activeOrders: countOf(active),
        inProcessingOrders: countOf(inProcessing),
        loadDocuments,
        load,
    };
}
