<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { MvPanel, MvFilterBar, MvFilterField, MvInput, MvSelect, MvButton } from '@mivend/ui-kit';
import {
    fetchAllDiscountRules,
    fetchDiscountGrantRequests,
    fetchAllDiscountGrants,
    buildDiscountRows,
    type DiscountRow,
    type DiscountRowStatus,
} from '../../api/discounts';
import { fetchAllCustomersCapped } from '../../api/customers';
import DiscountsTable from '../../components/discounts/DiscountsTable.vue';
import DiscountGrantForm from '../../components/discounts/DiscountGrantForm.vue';

const rows = ref<DiscountRow[]>([]);
const loading = ref(true);

const search = ref('');
const statusFilter = ref<'' | DiscountRowStatus>('');
const STATUS_OPTIONS: { value: string; label: string }[] = [
    { value: '', label: 'All statuses' },
    { value: 'active', label: 'Active' },
    { value: 'expiring-soon', label: 'Expiring soon' },
    { value: 'expired', label: 'Expired' },
    { value: 'pending', label: 'Pending approval' },
    { value: 'rejected', label: 'Rejected' },
];
const showForm = ref(false);
const renewFrom = ref<DiscountRow | null>(null);

const kpis = computed(() => ({
    active: rows.value.filter(r => r.status === 'active').length,
    expiringSoon: rows.value.filter(r => r.status === 'expiring-soon').length,
    pending: rows.value.filter(r => r.status === 'pending').length,
    rejected: rows.value.filter(r => r.status === 'rejected').length,
}));

function filterByStatus(status: '' | DiscountRowStatus): void {
    statusFilter.value = statusFilter.value === status ? '' : status;
}

async function load(): Promise<void> {
    loading.value = true;
    try {
        const [rules, requests, grants, customers] = await Promise.all([
            fetchAllDiscountRules(),
            fetchDiscountGrantRequests(),
            fetchAllDiscountGrants(),
            fetchAllCustomersCapped(),
        ]);
        const namesById = new Map(customers.map(c => [c.id, c.legalName]));
        rows.value = buildDiscountRows(rules, requests, grants, namesById);
    } finally {
        loading.value = false;
    }
}

onMounted(load);

const filtered = computed(() => {
    const term = search.value.trim().toLowerCase();
    return rows.value.filter(row => {
        if (statusFilter.value && row.status !== statusFilter.value) return false;
        if (!term) return true;
        return (
            row.priceType.toLowerCase().includes(term) ||
            row.facet.toLowerCase().includes(term) ||
            row.customer.toLowerCase().includes(term)
        );
    });
});

function resetFilters(): void {
    search.value = '';
    statusFilter.value = '';
}

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
    await load();
}
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

        <div v-if="!loading" class="discounts-page__kpis">
            <button
                type="button"
                class="discounts-page__kpi"
                :class="{ 'discounts-page__kpi--active': statusFilter === 'active' }"
                @click="filterByStatus('active')"
            >
                <span class="discounts-page__kpi-label">Active grants</span>
                <span class="discounts-page__kpi-value">{{ kpis.active }}</span>
            </button>
            <button
                type="button"
                class="discounts-page__kpi"
                :class="{ 'discounts-page__kpi--active': statusFilter === 'expiring-soon' }"
                @click="filterByStatus('expiring-soon')"
            >
                <span class="discounts-page__kpi-label">Expiring soon</span>
                <span class="discounts-page__kpi-value">{{ kpis.expiringSoon }}</span>
            </button>
            <button
                type="button"
                class="discounts-page__kpi"
                :class="{ 'discounts-page__kpi--active': statusFilter === 'pending' }"
                @click="filterByStatus('pending')"
            >
                <span class="discounts-page__kpi-label">Pending approval</span>
                <span class="discounts-page__kpi-value">{{ kpis.pending }}</span>
            </button>
            <button
                type="button"
                class="discounts-page__kpi"
                :class="{ 'discounts-page__kpi--active': statusFilter === 'rejected' }"
                @click="filterByStatus('rejected')"
            >
                <span class="discounts-page__kpi-label">Rejected</span>
                <span class="discounts-page__kpi-value">{{ kpis.rejected }}</span>
            </button>
        </div>

        <MvPanel>
            <MvFilterBar @reset="resetFilters">
                <MvFilterField label="Search">
                    <MvInput size="sm" :model-value="search" placeholder="Customer, price type or product group..." @update:model-value="search = $event" />
                </MvFilterField>
                <MvFilterField label="Status">
                    <MvSelect :model-value="statusFilter" :options="STATUS_OPTIONS" @update:model-value="statusFilter = ($event as typeof statusFilter)" />
                </MvFilterField>
            </MvFilterBar>

            <DiscountsTable v-if="!loading" :rows="filtered" @renew="openRenewForm" />
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

.discounts-page__kpi--active {
    background: var(--el-color-primary-light-9, #d1fae5);
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

</style>
