<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useUrlSyncedState } from '../../composables/useUrlSyncedState';
import {
    MvPanel,
    MvFilterBar,
    MvFilterField,
    MvInput,
    MvSelect,
    MvKpiCard,
    MvKpiCarousel,
    MvButton,
    MvPagination,
} from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import {
    fetchCustomersPage,
    fetchCustomersSummary,
    fetchHighUsageCustomers,
    fetchCreditByCounterpartyId,
    fetchActiveDiscountCountsByCustomer,
    fetchLastOrderDatesByCounterpartyId,
    type CustomerListItem,
    type CustomerCredit,
    type CustomersSummary,
    type HighUsageCustomer,
} from '../../api/customers';
import { fetchBranchOptions, fetchManagerOptions, type BranchOption, type ManagerOption } from '../../api/orders';
import { fetchExpiringDiscountGrants } from '../../api/discounts';
import { downloadCsv } from '../../utils/csv';
import CustomersTable from '../../components/customers/CustomersTable.vue';
import NeedsAttentionPanel, { type AttentionEntry } from '../../components/customers/NeedsAttentionPanel.vue';

const authStore = useAuthStore();
// "My Clients" only makes sense for Manager, whose list is their own assigned book — every
// other role sees a department/company-wide list, so the generic title fits better there (see
// docs/ai/manager-portal-pages/04-customers-list.md).
const title = computed(() => (authStore.roleCode === 'manager' ? 'My Clients' : 'Customers'));

const PAGE_SIZE = 20;

// `customers` now holds only the current page (see issue #39 — server-side pagination via
// fetchCustomersPage/CounterpartyService.findVisiblePage). KPIs and "Needs attention" no longer
// derive from this — they come from dedicated summary/top-N backend queries below, since they
// must reflect the FULL visible set, not just the page on screen.
const customers = ref<CustomerListItem[]>([]);
const totalItems = ref(0);
const page = ref(1);
const credit = ref<Map<string, CustomerCredit>>(new Map());
const discountCounts = ref<Map<string, number>>(new Map());
const lastOrderDates = ref<Map<string, string>>(new Map());
const branches = ref<BranchOption[]>([]);
const managers = ref<ManagerOption[]>([]);
const expiringGrantsByCustomerId = ref<Map<string, string>>(new Map());
const summary = ref<CustomersSummary | null>(null);
const highUsageCustomers = ref<HighUsageCustomer[]>([]);
const loading = ref(true);

// Same window used by the dashboard's discount banner (docs/ai/manager-portal-concept.md §8.2 —
// no exact threshold has been decided).
const EXPIRING_SOON_DAYS = 14;
const ATTENTION_TOP_N = 5;

// Sentinel value for the Manager select's "Unassigned" option — distinct from '' (no filter) and
// from any real manager id. See CounterpartyService.findVisiblePage's `unassignedOnly` doc
// comment for why this is a dedicated flag, not `managerId: null`.
const UNASSIGNED_SENTINEL = '__unassigned__';

interface CustomerFiltersState extends Record<string, string> {
    search: string;
    status: string;
    managerId: string;
    branchId: string;
    groupLabel: string;
}
const DEFAULT_FILTERS: CustomerFiltersState = {
    search: '',
    status: '',
    managerId: '',
    branchId: '',
    groupLabel: '',
};
const filters = reactive<CustomerFiltersState>({ ...DEFAULT_FILTERS });

// Manager portal rule (AGENTS.md): every filtered/sorted/paginated view must be a shareable URL.
const { fromQuery, toQuery } = useUrlSyncedState(DEFAULT_FILTERS);
fromQuery(filters, page);

const search = computed({
    get: () => filters.search,
    set: (value: string) => { filters.search = value; },
});
const statusFilter = computed({
    get: () => filters.status as '' | 'active' | 'inactive',
    set: (value: '' | 'active' | 'inactive') => { filters.status = value; },
});
const managerFilter = computed({
    get: () => filters.managerId,
    set: (value: string) => { filters.managerId = value; },
});
const branchFilter = computed({
    get: () => filters.branchId,
    set: (value: string) => { filters.branchId = value; },
});
const groupFilter = computed({
    get: () => filters.groupLabel,
    set: (value: string) => { filters.groupLabel = value; },
});
const STATUS_OPTIONS = [
    { value: '', label: 'All statuses' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
];
const managerOptions = computed(() => [
    { value: '', label: 'All managers' },
    { value: UNASSIGNED_SENTINEL, label: 'Unassigned' },
    ...managers.value.map(m => ({ value: m.id, label: m.name })),
]);
const branchOptions = computed(() => [
    { value: '', label: 'All branches' },
    ...branches.value.map(b => ({ value: b.erpId, label: b.name })),
]);

const activeClientsCount = computed(() => summary.value?.activeCount ?? 0);
// Null (not 0) means "no ReadCounterpartyCredit" — see CounterpartyResolver.counterpartySummary.
// Distinguished from a real zero so the KPI card can be hidden rather than showing a misleading
// "$0.00 used".
const canReadCredit = computed(() => summary.value?.totalCreditBalance != null);
const totalCreditBalance = computed(() => summary.value?.totalCreditBalance ?? 0);
const highUsageCount = computed(() => summary.value?.highUsageCount ?? 0);
const expiringGrantsCount = computed(() => expiringGrantsByCustomerId.value.size);

const attentionItems = computed<AttentionEntry[]>(() => {
    const highUsage: AttentionEntry[] = highUsageCustomers.value.map(c => {
        const percent = c.creditLimit > 0 ? Math.round((c.creditBalance / c.creditLimit) * 100) : 0;
        return {
            customerId: c.id,
            title: c.shortName,
            meta: `Credit balance is at ${percent}%; new deferred-payment order may need approval.`,
            tag: 'Risk',
            variant: 'danger',
        };
    });
    const expiring: AttentionEntry[] = [...expiringGrantsByCustomerId.value.entries()]
        .slice(0, ATTENTION_TOP_N)
        .map(([customerId, validTo]) => ({
            customerId,
            title: customers.value.find(c => c.id === customerId)?.shortName ?? '—',
            meta: `Discount grant expires ${new Date(validTo).toLocaleDateString('en-US')}.`,
            tag: 'Discounts',
            variant: 'warning',
        }));
    return [...highUsage, ...expiring];
});

function resetFilters(): void {
    Object.assign(filters, DEFAULT_FILTERS);
    page.value = 1;
}

function exportCsv(): void {
    downloadCsv(
        'customers.csv',
        ['Company name', 'INN', 'Credit limit', 'Credit balance', 'Active discounts', 'Last order', 'Status'],
        customers.value.map(c => {
            const row = credit.value.get(c.id);
            const lastOrder = lastOrderDates.value.get(c.id);
            return [
                c.shortName,
                c.inn ?? '',
                row?.creditLimit ?? '',
                row?.creditBalance ?? '',
                discountCounts.value.get(c.id) ?? 0,
                lastOrder ? new Date(lastOrder).toLocaleDateString('en-US') : '',
                c.isActive ? 'Active' : 'Inactive',
            ];
        }),
    );
}

async function loadPage(): Promise<void> {
    loading.value = true;
    try {
        const isUnassignedFilter = managerFilter.value === UNASSIGNED_SENTINEL;
        const listOptions = {
            take: PAGE_SIZE,
            skip: (page.value - 1) * PAGE_SIZE,
            search: search.value.trim() || undefined,
            status: statusFilter.value || undefined,
            managerId: !isUnassignedFilter && managerFilter.value ? managerFilter.value : undefined,
            branchId: branchFilter.value || undefined,
            groupLabel: groupFilter.value.trim() || undefined,
            unassignedOnly: isUnassignedFilter || undefined,
        };
        const [pageResult, creditMap] = await Promise.all([
            fetchCustomersPage(listOptions),
            fetchCreditByCounterpartyId(listOptions),
        ]);
        customers.value = pageResult.items;
        totalItems.value = pageResult.totalItems;
        credit.value = creditMap;
        discountCounts.value = await fetchActiveDiscountCountsByCustomer(
            pageResult.items.map(c => c.id),
        );
    } finally {
        loading.value = false;
    }
}

watch([search, statusFilter, managerFilter, branchFilter, groupFilter, page], () => {
    toQuery(filters, page);
    void loadPage();
});
watch([search, statusFilter, managerFilter, branchFilter, groupFilter], () => {
    page.value = 1;
});

onMounted(async () => {
    await loadPage();
    const [lastOrderMap, branchOptionsResult, managerOptionsResult, expiringGrants, summaryResult, highUsage] =
        await Promise.all([
            fetchLastOrderDatesByCounterpartyId(),
            fetchBranchOptions(),
            fetchManagerOptions(),
            fetchExpiringDiscountGrants(EXPIRING_SOON_DAYS),
            fetchCustomersSummary(),
            fetchHighUsageCustomers(ATTENTION_TOP_N),
        ]);
    lastOrderDates.value = lastOrderMap;
    branches.value = branchOptionsResult;
    managers.value = managerOptionsResult;
    summary.value = summaryResult;
    highUsageCustomers.value = highUsage;
    const grantsMap = new Map<string, string>();
    for (const grant of expiringGrants) {
        for (const cp of grant.counterparties) {
            if (!grantsMap.has(cp.id)) grantsMap.set(cp.id, grant.validTo);
        }
    }
    expiringGrantsByCustomerId.value = grantsMap;
});
</script>

<template>
    <div class="customers-page">
        <div class="customers-page__header">
            <div>
                <div class="customers-page__breadcrumb">Customers</div>
                <h1 class="customers-page__title">{{ title }}</h1>
            </div>
        </div>

        <MvKpiCarousel v-if="summary" class="customers-page__kpis">
            <MvKpiCard label="Active clients" :value="activeClientsCount" />
            <MvKpiCard
                v-if="canReadCredit"
                label="Credit balance used"
                :value="new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalCreditBalance / 100)"
                :caption="`${highUsageCount} clients above 80%`"
                accent
            />
            <MvKpiCard label="Discounts expiring soon" :value="expiringGrantsCount" accent to="/discounts" />
        </MvKpiCarousel>

        <div class="customers-page__grid">
            <MvPanel title="Client list">
                <template #header-actions>
                    <MvButton size="sm" variant="secondary" @click="exportCsv">Export CSV</MvButton>
                </template>
                <MvFilterBar @reset="resetFilters">
                    <MvFilterField label="Search">
                        <MvInput size="sm" :model-value="search" placeholder="Company name or INN..." @update:model-value="search = $event" />
                    </MvFilterField>
                    <MvFilterField label="Status">
                        <MvSelect :model-value="statusFilter" :options="STATUS_OPTIONS" @update:model-value="statusFilter = ($event as typeof statusFilter)" />
                    </MvFilterField>
                    <MvFilterField v-if="authStore.roleCode !== 'manager'" label="Manager">
                        <MvSelect :model-value="managerFilter" :options="managerOptions" @update:model-value="managerFilter = ($event as string)" />
                    </MvFilterField>
                    <MvFilterField label="Branch">
                        <MvSelect :model-value="branchFilter" :options="branchOptions" @update:model-value="branchFilter = ($event as string)" />
                    </MvFilterField>
                    <MvFilterField label="Group">
                        <MvInput size="sm" :model-value="groupFilter" placeholder="ERP group label..." @update:model-value="groupFilter = $event" />
                    </MvFilterField>
                </MvFilterBar>

                <MvPagination :page="page" :page-size="PAGE_SIZE" :total="totalItems" @update:page="page = $event" />
                <CustomersTable
                    :customers="customers"
                    :credit="credit"
                    :discount-counts="discountCounts"
                    :last-order-dates="lastOrderDates"
                    :branches="branches"
                    :managers="managers"
                    :loading="loading"
                    :page-size="PAGE_SIZE"
                />
                <MvPagination :page="page" :page-size="PAGE_SIZE" :total="totalItems" @update:page="page = $event" />
            </MvPanel>

            <aside class="customers-page__right-stack">
                <MvPanel title="Needs attention">
                    <NeedsAttentionPanel :items="attentionItems" />
                </MvPanel>
            </aside>
        </div>
    </div>
</template>

<style scoped>
.customers-page {
    display: flex;
    flex-direction: column;
    gap: 18px;
}

.customers-page__breadcrumb {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
    margin-bottom: 6px;
}

.customers-page__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

.customers-page__grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: 18px;
    align-items: start;
}

.customers-page__right-stack {
    display: grid;
    gap: 18px;
}

@media (max-width: 1200px) {
    .customers-page__grid {
        grid-template-columns: 1fr;
    }
}
</style>
