import { computed, onMounted, ref, type ComputedRef, type Ref } from 'vue';
import { useAuthStore } from '../stores/auth';
import { fetchDepartments } from '../api/team';
import { fetchOrdersSummary, type OrdersSummary } from '../api/orders';
import { useCurrency } from './useCurrency';

export interface OrdersOverview {
    summary: Ref<OrdersSummary | null>;
    summaryLoading: Ref<boolean>;
    summaryError: Ref<boolean>;
    departmentName: Ref<string | null>;
    loadSummary: () => Promise<void>;
    attentionItems: ComputedRef<{ code: string; title: string; meta: string }[]>;
    operationalMetrics: ComputedRef<{ label: string; value: string }[]>;
    savedViews: ComputedRef<{ key: string; label: string; count: number }[]>;
    todayAmountFormatted: ComputedRef<string>;
}

// KPIs, attention list and the department badge around the orders list; none of it gates the list.
export function useOrdersOverview(): OrdersOverview {
    const authStore = useAuthStore();
    const { formatMinor } = useCurrency();
    const summary = ref<OrdersSummary | null>(null);
    const summaryLoading = ref(true);
    const summaryError = ref(false);
    const departmentName = ref<string | null>(null);

    async function loadSummary(): Promise<void> {
        summaryLoading.value = true;
        summaryError.value = false;
        try {
            summary.value = await fetchOrdersSummary();
        } catch (e) {
            console.warn('[orders] could not load summary:', e);
            summaryError.value = true;
        } finally {
            summaryLoading.value = false;
        }
    }

    async function loadDepartment(): Promise<void> {
        try {
            const departmentId = authStore.administrator?.customFields.departmentId;
            const departments = await fetchDepartments();
            // The administrator stores the ERP id, not the Department row id.
            departmentName.value = departments.find(d => d.erpId === departmentId)?.name ?? null;
        } catch (e) {
            console.warn('[orders] could not load department name:', e);
        }
    }

    onMounted(() => {
        void loadSummary();
        void loadDepartment();
    });

    const attentionItems = computed(
        () =>
            summary.value?.attentionCandidates.map(c => ({
                code: c.code,
                title: `${c.code} ${c.state === 'PaymentSettled' ? 'shipment overdue' : 'price limit exceeded'}`,
                meta: c.customerName,
            })) ?? [],
    );

    const operationalMetrics = computed(() => {
        if (!summary.value) return [];
        return [
            { label: 'Open orders', value: String(summary.value.openCount) },
            { label: 'Waiting approval', value: String(summary.value.waitingApprovalCount) },
            { label: 'Overdue', value: String(summary.value.overdueCount) },
            { label: 'Open orders amount', value: formatMinor(summary.value.totalAmount) },
        ];
    });

    const savedViews = computed(() => [
        { key: 'processing', label: 'My processing', count: summary.value?.processingCount ?? 0 },
        {
            key: 'waiting-approval',
            label: 'Waiting approval',
            count: summary.value?.waitingApprovalCount ?? 0,
        },
        { key: 'today', label: "Today's orders", count: summary.value?.todayCount ?? 0 },
        { key: 'drafts', label: 'Drafts', count: summary.value?.draftCount ?? 0 },
    ]);

    const todayAmountFormatted = computed(() =>
        summary.value ? formatMinor(summary.value.todayAmount) : '',
    );

    return {
        summary,
        summaryLoading,
        summaryError,
        departmentName,
        loadSummary,
        attentionItems,
        operationalMetrics,
        savedViews,
        todayAmountFormatted,
    };
}
