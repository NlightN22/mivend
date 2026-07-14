<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { MvPanel, MvFilterBar, MvFilterField, MvInput, MvSelect, MvKpiCard, MvButton, MvPagination } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import {
    fetchCustomersPage,
    fetchCustomersSummary,
    fetchHighUsageCustomers,
    fetchCreditByCounterpartyId,
    fetchActiveDiscountCountsByPriceType,
    fetchLastOrderDatesByCounterpartyId,
    type CustomerListItem,
    type CustomerCredit,
    type CustomersSummary,
    type HighUsageCustomer,
} from '../../api/customers';
import { fetchBranchOptions, type BranchOption } from '../../api/orders';
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
const expiringGrantsByCustomerId = ref<Map<string, string>>(new Map());
const summary = ref<CustomersSummary | null>(null);
const highUsageCustomers = ref<HighUsageCustomer[]>([]);
const loading = ref(true);

// Same window used by the dashboard's discount banner (docs/ai/manager-portal-concept.md §8.2 —
// no exact threshold has been decided).
const EXPIRING_SOON_DAYS = 14;
const ATTENTION_TOP_N = 5;

const search = ref('');
const statusFilter = ref('');
const STATUS_OPTIONS = [
    { value: '', label: 'All statuses' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
];

// Status filtering still happens client-side over the current page only — the backend doesn't
// take a status filter arg yet (search is the only pushed-down filter). Acceptable for now since
// it only narrows what's already loaded, doesn't hide rows that should have been fetched.
const filtered = computed(() => {
    if (!statusFilter.value) return customers.value;
    return customers.value.filter(c =>
        statusFilter.value === 'active' ? c.isActive : !c.isActive,
    );
});

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
    search.value = '';
    statusFilter.value = '';
    page.value = 1;
}

function exportCsv(): void {
    downloadCsv(
        'customers.csv',
        ['Company name', 'INN', 'Credit limit', 'Credit balance', 'Active discounts', 'Last order', 'Status'],
        filtered.value.map(c => {
            const row = credit.value.get(c.id);
            const lastOrder = lastOrderDates.value.get(c.id);
            return [
                c.shortName,
                c.inn ?? '',
                row?.creditLimit ?? '',
                row?.creditBalance ?? '',
                discountCounts.value.get(c.priceType) ?? 0,
                lastOrder ? new Date(lastOrder).toLocaleDateString('en-US') : '',
                c.isActive ? 'Active' : 'Inactive',
            ];
        }),
    );
}

async function loadPage(): Promise<void> {
    loading.value = true;
    try {
        const listOptions = {
            take: PAGE_SIZE,
            skip: (page.value - 1) * PAGE_SIZE,
            search: search.value.trim() || undefined,
        };
        const [pageResult, creditMap] = await Promise.all([
            fetchCustomersPage(listOptions),
            fetchCreditByCounterpartyId(listOptions),
        ]);
        customers.value = pageResult.items;
        totalItems.value = pageResult.totalItems;
        credit.value = creditMap;
        discountCounts.value = await fetchActiveDiscountCountsByPriceType(
            pageResult.items.map(c => c.priceType),
        );
    } finally {
        loading.value = false;
    }
}

watch([search, page], () => void loadPage());
watch(search, () => {
    page.value = 1;
});

onMounted(async () => {
    await loadPage();
    const [lastOrderMap, branchOptions, expiringGrants, summaryResult, highUsage] = await Promise.all([
        fetchLastOrderDatesByCounterpartyId(),
        fetchBranchOptions(),
        fetchExpiringDiscountGrants(EXPIRING_SOON_DAYS),
        fetchCustomersSummary(),
        fetchHighUsageCustomers(ATTENTION_TOP_N),
    ]);
    lastOrderDates.value = lastOrderMap;
    branches.value = branchOptions;
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

        <div v-if="!loading" class="customers-page__kpis">
            <MvKpiCard label="Active clients" :value="activeClientsCount" />
            <MvKpiCard
                v-if="canReadCredit"
                label="Credit balance used"
                :value="new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalCreditBalance / 100)"
                :caption="`${highUsageCount} clients above 80%`"
                accent
            />
            <MvKpiCard label="Discounts expiring soon" :value="expiringGrantsCount" accent to="/discounts" />
        </div>

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
                        <MvSelect :model-value="statusFilter" :options="STATUS_OPTIONS" @update:model-value="statusFilter = $event" />
                    </MvFilterField>
                </MvFilterBar>

                <MvPagination :page="page" :page-size="PAGE_SIZE" :total="totalItems" @update:page="page = $event" />
                <CustomersTable
                    v-if="!loading"
                    :customers="filtered"
                    :credit="credit"
                    :discount-counts="discountCounts"
                    :last-order-dates="lastOrderDates"
                    :branches="branches"
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

.customers-page__kpis {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
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
    .customers-page__kpis {
        grid-template-columns: repeat(2, 1fr);
    }

    .customers-page__grid {
        grid-template-columns: 1fr;
    }
}
</style>
