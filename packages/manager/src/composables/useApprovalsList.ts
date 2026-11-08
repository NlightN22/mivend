import { onMounted, ref, shallowRef, watch, type Ref } from 'vue';
import { useLatestRequest } from '@mivend/ui-kit';
import {
    fetchCounterpartyReferencesByErpId,
    fetchOrderReferences,
    type ApprovalRequestSummary,
} from '../api/approvals';
import {
    fetchApprovalsList,
    type ApprovalsListFilters,
    type ApprovalsSort,
    type ApprovalsView,
} from '../api/approvals-list';
import { fetchManagerOptions, type ManagerOption } from '../api/orders';
import { parsePayload, type ApprovalRowContext } from '../components/approvals/approvalsListRows';
import { useCurrency } from './useCurrency';
import { useUrlSyncedState } from './useUrlSyncedState';
import {
    APPROVALS_URL_DEFAULTS,
    fromUrlState,
    toUrlState,
    type ApprovalsListUrlState,
} from './approvalsListUrl';

export interface ApprovalsListState {
    items: Ref<ApprovalRequestSummary[]>;
    context: Ref<ApprovalRowContext>;
    totalItems: Ref<number>;
    counts: Ref<Record<ApprovalsView, number> | null>;
    loading: Ref<boolean>;
    failed: Ref<boolean>;
    reload: () => void;
    filters: Ref<ApprovalsListFilters>;
    sort: Ref<ApprovalsSort>;
    page: Ref<number>;
    pageSize: Ref<number>;
    managers: Ref<ManagerOption[]>;
}

// Names are resolved for the visible page only; the server filters on ids and codes.
async function resolveReferences(
    items: ApprovalRequestSummary[],
): Promise<Pick<ApprovalRowContext, 'orders' | 'counterparties'>> {
    const orderIds = new Set<string>();
    const erpIds = new Set<string>();
    for (const r of items) {
        const p = parsePayload(r.payload);
        if (r.requestType === 'priceAdjustmentApproval' && p.orderId)
            orderIds.add(String(p.orderId));
        if (p.counterpartyErpId) erpIds.add(String(p.counterpartyErpId));
    }
    const [orders, counterparties] = await Promise.all([
        fetchOrderReferences([...orderIds]),
        fetchCounterpartyReferencesByErpId([...erpIds]),
    ]);
    return { orders, counterparties };
}

// Filters, sort, page and page size live in the URL, so a filtered list is a shareable link.
export function useApprovalsList(administratorId: () => string): ApprovalsListState {
    const { fromQuery, toQuery } = useUrlSyncedState(APPROVALS_URL_DEFAULTS);
    const { formatMinorExact } = useCurrency();

    const items = ref<ApprovalRequestSummary[]>([]);
    const totalItems = ref(0);
    const counts = ref<Record<ApprovalsView, number> | null>(null);
    const managers = ref<ManagerOption[]>([]);
    const context = ref<ApprovalRowContext>({
        managers: [],
        orders: new Map(),
        counterparties: new Map(),
        money: formatMinorExact,
    });

    const urlState: ApprovalsListUrlState = { ...APPROVALS_URL_DEFAULTS };
    const page = ref(1);
    fromQuery(urlState, page);
    const initial = fromUrlState(urlState);
    const filters = shallowRef<ApprovalsListFilters>(initial.filters);
    const sort = ref<ApprovalsSort>(initial.sort);
    const pageSize = ref(initial.pageSize);

    const failed = ref(false);
    const { loading, run } = useLatestRequest(
        async () => {
            try {
                const result = await fetchApprovalsList(
                    filters.value,
                    sort.value,
                    page.value,
                    pageSize.value,
                    administratorId(),
                );
                const references = await resolveReferences(result.page.items);
                return { result, references };
            } catch (e) {
                console.warn('[approvals] could not load the list:', e);
                return null;
            }
        },
        loaded => {
            failed.value = loaded === null;
            items.value = loaded?.result.page.items ?? [];
            totalItems.value = loaded?.result.page.totalItems ?? 0;
            if (loaded) {
                counts.value = loaded.result.counts;
                context.value = {
                    ...context.value,
                    ...loaded.references,
                    managers: managers.value,
                };
            }
        },
    );
    const reload = (): void => void run();

    watch([filters, sort, pageSize], () => {
        page.value = 1;
    });
    watch([filters, sort, pageSize, page], () => {
        reload();
        toQuery(toUrlState(filters.value, sort.value, pageSize.value), page);
    });
    watch(managers, list => {
        context.value = { ...context.value, managers: list };
    });

    onMounted(() => {
        reload();
        void fetchManagerOptions().then(result => (managers.value = result));
    });

    return {
        items,
        context,
        totalItems,
        counts,
        loading,
        failed,
        reload,
        filters,
        sort,
        page,
        pageSize,
        managers,
    };
}
