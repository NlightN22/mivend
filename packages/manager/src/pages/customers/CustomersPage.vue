<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { MvPanel, MvFilterBar, MvFilterField, MvInput, MvSelect } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import {
    fetchCustomersList,
    fetchCreditByCounterpartyId,
    fetchActiveDiscountCountsByPriceType,
    fetchLastOrderDatesByCounterpartyId,
    type CustomerListItem,
    type CustomerCredit,
} from '../../api/customers';
import CustomersTable from '../../components/customers/CustomersTable.vue';

const authStore = useAuthStore();
// "My Clients" only makes sense for Manager, whose list is their own assigned book — every
// other role sees a department/company-wide list, so the generic title fits better there (see
// docs/ai/manager-portal-pages/04-customers-list.md).
const title = computed(() => (authStore.roleCode === 'manager' ? 'My Clients' : 'Customers'));

const customers = ref<CustomerListItem[]>([]);
const credit = ref<Map<string, CustomerCredit>>(new Map());
const discountCounts = ref<Map<string, number>>(new Map());
const lastOrderDates = ref<Map<string, string>>(new Map());
const loading = ref(true);

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

function resetFilters(): void {
    search.value = '';
    statusFilter.value = '';
}

onMounted(async () => {
    try {
        const list = await fetchCustomersList();
        customers.value = list;
        [credit.value, discountCounts.value, lastOrderDates.value] = await Promise.all([
            fetchCreditByCounterpartyId(),
            fetchActiveDiscountCountsByPriceType(list.map(c => c.priceType)),
            fetchLastOrderDatesByCounterpartyId(),
        ]);
    } finally {
        loading.value = false;
    }
});
</script>

<template>
    <div class="customers-page">
        <div class="customers-page__header">
            <div class="customers-page__breadcrumb">Workspace / Customers</div>
            <h1 class="customers-page__title">{{ title }}</h1>
        </div>

        <MvPanel>
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
            />
        </MvPanel>
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
</style>
