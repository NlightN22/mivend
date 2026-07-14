<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { MvPanel, MvFilterBar, MvFilterField, MvInput, MvSelect, MvButton, MvPagination } from '@mivend/ui-kit';
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

const rows = ref<DiscountRow[]>([]);
const totalItems = ref(0);
const loading = ref(true);
const page = ref(1);
const search = ref('');
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
const CHIPS: { key: '' | DiscountRegistryFilterStatus; label: string }[] = [
    { key: '', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'expiring-soon', label: 'Expiring soon' },
    { key: 'pending', label: 'Pending approval' },
    { key: 'rejected', label: 'Rejected' },
];

const kpis = reactive({ active: 0, expiringSoon: 0, pending: 0, rejected: 0 });

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

async function loadKpis(): Promise<void> {
    const [active, expiringSoon, pending, rejected] = await Promise.all([
        fetchDiscountRegistryPage({ take: 0, status: 'active' }),
        fetchDiscountRegistryPage({ take: 0, status: 'expiring-soon' }),
        fetchDiscountRegistryPage({ take: 0, status: 'pending' }),
        fetchDiscountRegistryPage({ take: 0, status: 'rejected' }),
    ]);
    kpis.active = active.totalItems;
    kpis.expiringSoon = expiringSoon.totalItems;
    kpis.pending = pending.totalItems;
    kpis.rejected = rejected.totalItems;
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

function selectChip(key: '' | DiscountRegistryFilterStatus): void {
    statusFilter.value = key;
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
    await Promise.all([loadRows(), loadKpis()]);
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
    await Promise.all([loadRows(), loadKpis()]);
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

        <div class="discounts-page__kpis">
            <button type="button" class="discounts-page__kpi" @click="selectChip('active')">
                <span class="discounts-page__kpi-label">Active grants</span>
                <span class="discounts-page__kpi-value">{{ kpis.active }}</span>
            </button>
            <button type="button" class="discounts-page__kpi" @click="selectChip('expiring-soon')">
                <span class="discounts-page__kpi-label">Expiring soon</span>
                <span class="discounts-page__kpi-value">{{ kpis.expiringSoon }}</span>
            </button>
            <button type="button" class="discounts-page__kpi" @click="selectChip('pending')">
                <span class="discounts-page__kpi-label">Pending approval</span>
                <span class="discounts-page__kpi-value">{{ kpis.pending }}</span>
            </button>
            <button type="button" class="discounts-page__kpi" @click="selectChip('rejected')">
                <span class="discounts-page__kpi-label">Rejected</span>
                <span class="discounts-page__kpi-value">{{ kpis.rejected }}</span>
            </button>
        </div>

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

            <div class="discounts-page__chips">
                <button
                    v-for="chip in CHIPS"
                    :key="chip.key"
                    type="button"
                    class="discounts-page__chip"
                    :class="{ 'discounts-page__chip--active': statusFilter === chip.key }"
                    @click="selectChip(chip.key)"
                >
                    {{ chip.label }}
                </button>
            </div>

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

.discounts-page__kpis {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
}

.discounts-page__kpi {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 16px;
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: 14px;
    background: var(--el-bg-color, #fff);
    text-align: left;
    cursor: pointer;
}

.discounts-page__kpi:hover {
    border-color: var(--el-color-primary, #00b894);
}

.discounts-page__kpi-label {
    font-size: 12px;
    font-weight: 700;
    color: var(--el-text-color-secondary, #6b7280);
}

.discounts-page__kpi-value {
    font-size: 26px;
    font-weight: 850;
    letter-spacing: -0.03em;
}

.discounts-page__chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 14px 0;
}

.discounts-page__chip {
    min-height: 32px;
    padding: 0 13px;
    border-radius: 999px;
    border: 1px solid var(--el-border-color, #e4e7ec);
    background: #fff;
    color: var(--el-text-color-primary, #17212b);
    font-weight: 700;
    font-size: 13px;
    cursor: pointer;
}

.discounts-page__chip:hover {
    background: var(--el-fill-color-light, #f8fafc);
}

.discounts-page__chip--active {
    background: var(--el-color-primary, #00b894);
    border-color: var(--el-color-primary, #00b894);
    color: #fff;
}
</style>
