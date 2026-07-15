<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
    MvPanel,
    MvFilterBar,
    MvFilterField,
    MvInput,
    MvSelect,
    MvButton,
    MvPagination,
    MvFilterChips,
    type FilterChip,
} from '@mivend/ui-kit';
import {
    fetchDiscountRegistryPage,
    fetchPriceTypeCodes,
    buildDiscountRegistryRows,
    type DiscountRow,
    type DiscountRegistryFilterStatus,
} from '../../api/discounts';
import { fetchAllCustomersCapped } from '../../api/customers';
import DiscountsTable from '../../components/discounts/DiscountsTable.vue';
import DiscountGrantForm from '../../components/discounts/DiscountGrantForm.vue';

const PAGE_SIZE = 10;

// Prefills the search box when arriving via the Customers page's "Active discounts" badge
// click-through (see CustomersTable.vue) — `?search=<customer short name>` matches this
// registry's existing customerNamesForSearch ILIKE, no dedicated customerId filter needed.
const route = useRoute();

const rows = ref<DiscountRow[]>([]);
const totalItems = ref(0);
const loading = ref(true);
const page = ref(1);
const search = ref(typeof route.query.search === 'string' ? route.query.search : '');
const statusFilter = ref<'' | DiscountRegistryFilterStatus>('');
const priceTypeFilter = ref('');
const priceTypeOptions = ref<{ value: string; label: string }[]>([]);
const namesById = ref(new Map<string, string>());

const STATUS_OPTIONS: { value: string; label: string }[] = [
    { value: '', label: 'All statuses' },
    { value: 'active', label: 'Active' },
    { value: 'expiring-soon', label: 'Expiring soon' },
    { value: 'expired', label: 'Expired' },
    { value: 'pending', label: 'Pending approval' },
    { value: 'rejected', label: 'Rejected' },
];

// Quick-filter chips, mirroring the design concept's "saved filters" row above the table.
const CHIPS: FilterChip[] = [
    { key: '', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'expiring-soon', label: 'Expiring soon' },
    { key: 'pending', label: 'Pending approval' },
    { key: 'rejected', label: 'Rejected' },
];

async function loadRows(): Promise<void> {
    loading.value = true;
    try {
        const result = await fetchDiscountRegistryPage({
            take: PAGE_SIZE,
            skip: (page.value - 1) * PAGE_SIZE,
            search: search.value.trim() || undefined,
            priceTypeCode: priceTypeFilter.value || undefined,
            status: statusFilter.value || undefined,
        });
        totalItems.value = result.totalItems;
        rows.value = buildDiscountRegistryRows(result.items, namesById.value);
    } finally {
        loading.value = false;
    }
}

watch([search, statusFilter, priceTypeFilter], () => {
    page.value = 1;
    loadRows();
});
watch(page, loadRows);

function resetFilters(): void {
    search.value = '';
    statusFilter.value = '';
    priceTypeFilter.value = '';
}

function selectChip(key: string): void {
    statusFilter.value = key as '' | DiscountRegistryFilterStatus;
}

const showForm = ref(false);
const renewFrom = ref<DiscountRow | null>(null);

function openNewForm(): void {
    renewFrom.value = null;
    showForm.value = true;
}

function openRenewForm(row: DiscountRow): void {
    renewFrom.value = row;
    showForm.value = true;
}

async function handleSubmitted(): Promise<void> {
    showForm.value = false;
    await loadRows();
}

onMounted(async () => {
    const [customers, priceTypeCodes] = await Promise.all([
        fetchAllCustomersCapped(),
        fetchPriceTypeCodes(),
    ]);
    namesById.value = new Map(customers.map(c => [c.id, c.legalName]));
    priceTypeOptions.value = [
        { value: '', label: 'All price types' },
        ...priceTypeCodes.map(p => ({ value: p, label: p })),
    ];
    await loadRows();
});
</script>

<template>
    <div class="discounts-page">
        <div class="discounts-page__header">
            <div>
                <div class="discounts-page__breadcrumb">Workspace / Discounts</div>
                <h1 class="discounts-page__title">Discount Grants</h1>
            </div>
            <MvButton @click="openNewForm">New discount grant</MvButton>
        </div>

        <MvPanel v-if="showForm" :title="renewFrom ? 'Renew discount grant' : 'New discount grant'">
            <DiscountGrantForm :renew-from="renewFrom" @submitted="handleSubmitted" @cancel="showForm = false" />
        </MvPanel>

        <MvPanel title="Grant registry">
            <MvFilterBar @reset="resetFilters">
                <MvFilterField label="Search">
                    <MvInput size="sm" :model-value="search" placeholder="Price type, product group or customer..." @update:model-value="search = $event" />
                </MvFilterField>
                <MvFilterField label="Price type">
                    <MvSelect :model-value="priceTypeFilter" :options="priceTypeOptions" @update:model-value="priceTypeFilter = ($event as string)" />
                </MvFilterField>
                <MvFilterField label="Status">
                    <MvSelect :model-value="statusFilter" :options="STATUS_OPTIONS" @update:model-value="statusFilter = ($event as typeof statusFilter)" />
                </MvFilterField>
            </MvFilterBar>

            <MvFilterChips :chips="CHIPS" :active="statusFilter" @select="selectChip" />

            <MvPagination :page="page" :page-size="PAGE_SIZE" :total="totalItems" @update:page="page = $event" />
            <DiscountsTable v-if="!loading" :rows="rows" :page-size="PAGE_SIZE" @renew="openRenewForm" />
            <MvPagination :page="page" :page-size="PAGE_SIZE" :total="totalItems" @update:page="page = $event" />
        </MvPanel>
    </div>
</template>

<style scoped>
.discounts-page {
    display: flex;
    flex-direction: column;
    gap: 18px;
}

.discounts-page__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.discounts-page__breadcrumb {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
    margin-bottom: 6px;
}

.discounts-page__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

</style>
