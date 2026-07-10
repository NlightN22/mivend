<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { MvPanel, MvFilterBar, MvFilterField, MvInput, MvSelect, MvButton } from '@mivend/ui-kit';
import {
    fetchAllDiscountRules,
    fetchDiscountGrantRequests,
    buildDiscountRows,
    type DiscountRow,
    type DiscountRowStatus,
} from '../../api/discounts';
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

async function load(): Promise<void> {
    loading.value = true;
    try {
        const [rules, requests] = await Promise.all([fetchAllDiscountRules(), fetchDiscountGrantRequests()]);
        rows.value = buildDiscountRows(rules, requests);
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
        return row.priceType.toLowerCase().includes(term) || row.facet.toLowerCase().includes(term);
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

        <MvPanel>
            <MvFilterBar @reset="resetFilters">
                <MvFilterField label="Search">
                    <MvInput size="sm" :model-value="search" placeholder="Price type or product group..." @update:model-value="search = $event" />
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
</style>
