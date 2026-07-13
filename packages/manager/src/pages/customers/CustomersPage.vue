<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { MvPanel, MvFilterBar, MvFilterField, MvInput, MvSelect, MvKpiCard, MvButton } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import {
    fetchCustomersList,
    fetchCreditByCounterpartyId,
    fetchActiveDiscountCountsByPriceType,
    fetchLastOrderDatesByCounterpartyId,
    type CustomerListItem,
    type CustomerCredit,
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

const customers = ref<CustomerListItem[]>([]);
const credit = ref<Map<string, CustomerCredit>>(new Map());
const discountCounts = ref<Map<string, number>>(new Map());
const lastOrderDates = ref<Map<string, string>>(new Map());
const branches = ref<BranchOption[]>([]);
const expiringGrantsByCustomerId = ref<Map<string, string>>(new Map());
const loading = ref(true);

// Same window used by the dashboard's discount banner (docs/ai/manager-portal-concept.md §8.2 —
// no exact threshold has been decided).
const EXPIRING_SOON_DAYS = 14;
const HIGH_USAGE_PERCENT = 80;

const search = ref('');
const statusFilter = ref('');
const STATUS_OPTIONS = [
    { value: '', label: 'All statuses' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
];

const filtered = computed(() => {
    const term = search.value.trim().toLowerCase();
    return customers.value.filter(c => {
        if (statusFilter.value === 'active' && !c.isActive) return false;
        if (statusFilter.value === 'inactive' && c.isActive) return false;
        if (!term) return true;
        return (
            c.shortName.toLowerCase().includes(term) ||
            c.legalName.toLowerCase().includes(term) ||
            (c.inn ?? '').includes(term)
        );
    });
});

const activeClientsCount = computed(() => customers.value.filter(c => c.isActive).length);

const highUsageCustomers = computed(() =>
    customers.value.filter(c => {
        const row = credit.value.get(c.id);
        if (!row || row.creditLimit <= 0) return false;
        return (row.creditBalance / row.creditLimit) * 100 >= HIGH_USAGE_PERCENT;
    }),
);

const totalCreditBalance = computed(() =>
    customers.value.reduce((sum, c) => sum + (credit.value.get(c.id)?.creditBalance ?? 0), 0),
);

const expiringGrantsCount = computed(() => expiringGrantsByCustomerId.value.size);

const attentionItems = computed<AttentionEntry[]>(() => {
    const highUsage: AttentionEntry[] = highUsageCustomers.value.slice(0, 5).map(c => {
        const row = credit.value.get(c.id)!;
        const percent = Math.round((row.creditBalance / row.creditLimit) * 100);
        return {
            customerId: c.id,
            title: c.shortName,
            meta: `Credit balance is at ${percent}%; new deferred-payment order may need approval.`,
            tag: 'Risk',
            variant: 'danger',
        };
    });
    const expiring: AttentionEntry[] = [...expiringGrantsByCustomerId.value.entries()]
        .slice(0, 5)
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

onMounted(async () => {
    try {
        const list = await fetchCustomersList();
        customers.value = list;
        const [creditMap, discountCountsMap, lastOrderMap, branchOptions, expiringGrants] = await Promise.all([
            fetchCreditByCounterpartyId(),
            fetchActiveDiscountCountsByPriceType(list.map(c => c.priceType)),
            fetchLastOrderDatesByCounterpartyId(),
            fetchBranchOptions(),
            fetchExpiringDiscountGrants(EXPIRING_SOON_DAYS),
        ]);
        credit.value = creditMap;
        discountCounts.value = discountCountsMap;
        lastOrderDates.value = lastOrderMap;
        branches.value = branchOptions;
        const grantsMap = new Map<string, string>();
        for (const grant of expiringGrants) {
            for (const cp of grant.counterparties) {
                if (!grantsMap.has(cp.id)) grantsMap.set(cp.id, grant.validTo);
            }
        }
        expiringGrantsByCustomerId.value = grantsMap;
    } finally {
        loading.value = false;
    }
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
                label="Credit balance used"
                :value="new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalCreditBalance / 100)"
                :caption="`${highUsageCustomers.length} clients above ${HIGH_USAGE_PERCENT}%`"
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

                <CustomersTable
                    v-if="!loading"
                    :customers="filtered"
                    :credit="credit"
                    :discount-counts="discountCounts"
                    :last-order-dates="lastOrderDates"
                    :branches="branches"
                />
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
