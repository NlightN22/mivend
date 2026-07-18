<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { MvPanel, MvPagination, MvWarningBanner } from '@mivend/ui-kit';
import { useUrlSyncedState } from '../../composables/useUrlSyncedState';
import { fetchCounterpartyNames } from '../../api/customers';
import {
    DEFAULT_PAYMENT_FILTERS,
    fetchPaymentsPage,
    type PaymentFilters,
    type PaymentListItem,
} from '../../api/payments';
import PaymentsFilterBar from '../../components/payments/PaymentsFilterBar.vue';
import PaymentsTable from '../../components/payments/PaymentsTable.vue';

const filters = reactive<PaymentFilters>({ ...DEFAULT_PAYMENT_FILTERS });
const page = ref(1);
const pageSize = 10;

const payments = ref<PaymentListItem[]>([]);
const totalItems = ref(0);
const counterpartyNames = ref<Map<string, string>>(new Map());
const loading = ref(true);

// Manager portal rule (AGENTS.md): every filtered/sorted/paginated view must be a shareable
// URL — including counterpartyId, which arrives here from CustomerPaymentsTab's "View all"
// link (see api/payments.ts's PaymentFilters shape).
const { fromQuery, toQuery } = useUrlSyncedState(DEFAULT_PAYMENT_FILTERS);
fromQuery(filters, page);

async function load(): Promise<void> {
    loading.value = true;
    try {
        const result = await fetchPaymentsPage(filters, page.value, pageSize);
        payments.value = result.items;
        totalItems.value = result.totalItems;
        counterpartyNames.value = await fetchCounterpartyNames(
            result.items.flatMap(p => (p.counterpartyId ? [p.counterpartyId] : [])),
        );
    } finally {
        loading.value = false;
    }
}

function resetFilters(): void {
    Object.assign(filters, DEFAULT_PAYMENT_FILTERS);
    page.value = 1;
}

function clearCounterpartyFilter(): void {
    filters.counterpartyId = '';
    page.value = 1;
}

watch(page, () => {
    load();
    toQuery(filters, page);
});
watch(filters, () => {
    page.value = 1;
    load();
    toQuery(filters, page);
});

onMounted(load);
</script>

<template>
    <div class="payments-page">
        <div class="payments-page__header">
            <div class="payments-page__breadcrumb">Workspace / Payments</div>
            <h1 class="payments-page__title">Payments</h1>
            <p class="payments-page__subtitle">{{ totalItems }} payments across your accessible scope.</p>
        </div>

        <MvWarningBanner
            v-if="filters.counterpartyId"
            action-text="Show all customers"
            @action="clearCounterpartyFilter"
        >
            Filtered to one customer ({{ counterpartyNames.get(filters.counterpartyId) ?? filters.counterpartyId }}).
        </MvWarningBanner>

        <MvPanel title="Payments list">
            <PaymentsFilterBar :filters="filters" @update:filters="Object.assign(filters, $event)" @reset="resetFilters" />
            <MvPagination :page="page" :page-size="pageSize" :total="totalItems" @update:page="page = $event" />
            <PaymentsTable
                :payments="payments"
                :counterparty-names="counterpartyNames"
                :page-size="pageSize"
                :loading="loading"
            />
            <MvPagination :page="page" :page-size="pageSize" :total="totalItems" @update:page="page = $event" />
        </MvPanel>
    </div>
</template>

<style scoped>
.payments-page__header {
    margin-bottom: 18px;
}

.payments-page__breadcrumb {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
    margin-bottom: 6px;
}

.payments-page__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

.payments-page__subtitle {
    margin: 8px 0 0;
    color: var(--el-text-color-secondary, #6b7280);
}
</style>
