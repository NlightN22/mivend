<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { MvPanel, MvFilterBar, MvFilterField, MvInput, MvSelect, MvButton, MvPagination } from '@mivend/ui-kit';
import {
    fetchDiscountRulesPage,
    fetchDiscountGrantsForRuleIds,
    fetchDiscountRequestsPage,
    fetchPriceTypeCodes,
    buildMaterializedRows,
    buildRequestRows,
    type DiscountRow,
    type DiscountRuleFilterStatus,
} from '../../api/discounts';
import { fetchAllCustomersCapped } from '../../api/customers';
import DiscountsTable from '../../components/discounts/DiscountsTable.vue';
import DiscountGrantForm from '../../components/discounts/DiscountGrantForm.vue';

const PAGE_SIZE = 10;

// --- Materialized grants (real server-side pagination + filters, issue #39) ---
const rules = ref<DiscountRow[]>([]);
const rulesTotal = ref(0);
const rulesLoading = ref(true);
const rulesPage = ref(1);
const rulesSearch = ref('');
const rulesStatus = ref<'' | DiscountRuleFilterStatus>('');
const priceTypeFilter = ref('');
const priceTypeOptions = ref<{ value: string; label: string }[]>([]);

async function loadRules(): Promise<void> {
    rulesLoading.value = true;
    try {
        const page = await fetchDiscountRulesPage({
            take: PAGE_SIZE,
            skip: (rulesPage.value - 1) * PAGE_SIZE,
            search: rulesSearch.value.trim() || undefined,
            priceTypeCode: priceTypeFilter.value || undefined,
            status: rulesStatus.value || undefined,
        });
        rulesTotal.value = page.totalItems;
        const grants = await fetchDiscountGrantsForRuleIds(page.items.map(r => r.id));
        rules.value = buildMaterializedRows(page.items, grants);
    } finally {
        rulesLoading.value = false;
    }
}

watch([rulesSearch, rulesStatus, priceTypeFilter], () => {
    rulesPage.value = 1;
    loadRules();
});
watch(rulesPage, loadRules);

function resetRuleFilters(): void {
    rulesSearch.value = '';
    rulesStatus.value = '';
    priceTypeFilter.value = '';
}

// --- Pending / rejected requests (also real server-side pagination) ---
const requests = ref<DiscountRow[]>([]);
const requestsTotal = ref(0);
const requestsLoading = ref(true);
const requestsPage = ref(1);
const requestsSearch = ref('');
const requestsStatus = ref<'' | 'pending' | 'rejected'>('');
const namesById = ref(new Map<string, string>());

async function loadRequests(): Promise<void> {
    requestsLoading.value = true;
    try {
        const page = await fetchDiscountRequestsPage({
            take: PAGE_SIZE,
            skip: (requestsPage.value - 1) * PAGE_SIZE,
            search: requestsSearch.value.trim() || undefined,
            statuses: requestsStatus.value ? [requestsStatus.value] : ['pending', 'rejected'],
        });
        requestsTotal.value = page.totalItems;
        requests.value = buildRequestRows(page.items, namesById.value);
    } finally {
        requestsLoading.value = false;
    }
}

watch([requestsSearch, requestsStatus], () => {
    requestsPage.value = 1;
    loadRequests();
});
watch(requestsPage, loadRequests);

function resetRequestFilters(): void {
    requestsSearch.value = '';
    requestsStatus.value = '';
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
    { value: '', label: 'All statuses' },
    { value: 'active', label: 'Active' },
    { value: 'expiring-soon', label: 'Expiring soon' },
    { value: 'expired', label: 'Expired' },
];
const REQUEST_STATUS_OPTIONS: { value: string; label: string }[] = [
    { value: '', label: 'Pending & rejected' },
    { value: 'pending', label: 'Pending approval' },
    { value: 'rejected', label: 'Rejected' },
];

// --- KPI counters — each a cheap take:0 count query, not a full-list scan (issue #39) ---
const kpis = reactive({ active: 0, expiringSoon: 0, pending: 0, rejected: 0 });

async function loadKpis(): Promise<void> {
    const [active, expiringSoon, pending, rejected] = await Promise.all([
        fetchDiscountRulesPage({ take: 0, status: 'active' }),
        fetchDiscountRulesPage({ take: 0, status: 'expiring-soon' }),
        fetchDiscountRequestsPage({ take: 0, statuses: ['pending'] }),
        fetchDiscountRequestsPage({ take: 0, statuses: ['rejected'] }),
    ]);
    kpis.active = active.totalItems;
    kpis.expiringSoon = expiringSoon.totalItems;
    kpis.pending = pending.totalItems;
    kpis.rejected = rejected.totalItems;
}

function filterByKpi(kpi: 'active' | 'expiringSoon' | 'pending' | 'rejected'): void {
    if (kpi === 'active' || kpi === 'expiringSoon') {
        rulesStatus.value = kpi === 'active' ? 'active' : 'expiring-soon';
    } else {
        requestsStatus.value = kpi;
    }
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
    await Promise.all([loadRules(), loadRequests(), loadKpis()]);
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
    await Promise.all([loadRules(), loadRequests(), loadKpis()]);
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
            <button type="button" class="discounts-page__kpi" @click="filterByKpi('active')">
                <span class="discounts-page__kpi-label">Active grants</span>
                <span class="discounts-page__kpi-value">{{ kpis.active }}</span>
            </button>
            <button type="button" class="discounts-page__kpi" @click="filterByKpi('expiringSoon')">
                <span class="discounts-page__kpi-label">Expiring soon</span>
                <span class="discounts-page__kpi-value">{{ kpis.expiringSoon }}</span>
            </button>
            <button type="button" class="discounts-page__kpi" @click="filterByKpi('pending')">
                <span class="discounts-page__kpi-label">Pending approval</span>
                <span class="discounts-page__kpi-value">{{ kpis.pending }}</span>
            </button>
            <button type="button" class="discounts-page__kpi" @click="filterByKpi('rejected')">
                <span class="discounts-page__kpi-label">Rejected</span>
                <span class="discounts-page__kpi-value">{{ kpis.rejected }}</span>
            </button>
        </div>

        <MvPanel title="Materialized grants">
            <MvFilterBar @reset="resetRuleFilters">
                <MvFilterField label="Search">
                    <MvInput size="sm" :model-value="rulesSearch" placeholder="Price type, product group or customer..." @update:model-value="rulesSearch = $event" />
                </MvFilterField>
                <MvFilterField label="Price type">
                    <MvSelect :model-value="priceTypeFilter" :options="priceTypeOptions" @update:model-value="priceTypeFilter = ($event as string)" />
                </MvFilterField>
                <MvFilterField label="Status">
                    <MvSelect :model-value="rulesStatus" :options="STATUS_OPTIONS" @update:model-value="rulesStatus = ($event as typeof rulesStatus)" />
                </MvFilterField>
            </MvFilterBar>

            <MvPagination :page="rulesPage" :page-size="PAGE_SIZE" :total="rulesTotal" @update:page="rulesPage = $event" />
            <DiscountsTable v-if="!rulesLoading" :rows="rules" :page-size="PAGE_SIZE" @renew="openRenewForm" />
            <MvPagination :page="rulesPage" :page-size="PAGE_SIZE" :total="rulesTotal" @update:page="rulesPage = $event" />
        </MvPanel>

        <MvPanel title="Pending / rejected requests">
            <MvFilterBar @reset="resetRequestFilters">
                <MvFilterField label="Search">
                    <MvInput size="sm" :model-value="requestsSearch" placeholder="Request #..." @update:model-value="requestsSearch = $event" />
                </MvFilterField>
                <MvFilterField label="Status">
                    <MvSelect :model-value="requestsStatus" :options="REQUEST_STATUS_OPTIONS" @update:model-value="requestsStatus = ($event as typeof requestsStatus)" />
                </MvFilterField>
            </MvFilterBar>

            <MvPagination :page="requestsPage" :page-size="PAGE_SIZE" :total="requestsTotal" @update:page="requestsPage = $event" />
            <DiscountsTable v-if="!requestsLoading" :rows="requests" :page-size="PAGE_SIZE" @renew="openRenewForm" />
            <MvPagination :page="requestsPage" :page-size="PAGE_SIZE" :total="requestsTotal" @update:page="requestsPage = $event" />
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

</style>
