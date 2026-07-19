<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { MvPagination } from '@mivend/ui-kit';
import PaymentsFilterBar from '../payments/PaymentsFilterBar.vue';
import PaymentsTable from '../payments/PaymentsTable.vue';
import { DEFAULT_PAYMENT_FILTERS, fetchPaymentsPage, type PaymentFilters, type PaymentListItem } from '../../api/payments';

// Server-side paginated + filtered (AGENTS.md "Pagination" rule) — owns its own fetching, same
// shape as CustomerInvoicesTab.vue, rather than receiving a pre-loaded array from
// CustomerDetailPage. Uses PaymentsFilterBar's status/source dropdowns (not chips, unlike
// Orders/Invoices) — PaymentAttempt has 9 statuses, too many to read as a chip row.
const props = defineProps<{ counterpartyId: string }>();

const PAGE_SIZE = 20;
const page = ref(1);
const totalItems = ref(0);
const payments = ref<PaymentListItem[]>([]);
const loading = ref(true);
const filters = reactive<PaymentFilters>({ ...DEFAULT_PAYMENT_FILTERS, counterpartyId: props.counterpartyId });

async function load(): Promise<void> {
    loading.value = true;
    try {
        const result = await fetchPaymentsPage(filters, page.value, PAGE_SIZE);
        payments.value = result.items;
        totalItems.value = result.totalItems;
    } finally {
        loading.value = false;
    }
}

function resetFilters(): void {
    Object.assign(filters, DEFAULT_PAYMENT_FILTERS, { counterpartyId: props.counterpartyId });
    page.value = 1;
}

watch(filters, () => {
    page.value = 1;
});
watch([page, filters], () => void load());

onMounted(load);
</script>

<template>
    <PaymentsFilterBar :filters="filters" @update:filters="Object.assign(filters, $event)" @reset="resetFilters" />

    <!-- Same top+bottom MvPagination pattern as CustomerInvoicesTab.vue/OrdersPage.vue. -->
    <MvPagination :page="page" :page-size="PAGE_SIZE" :total="totalItems" @update:page="page = $event" />

    <PaymentsTable
        :payments="payments"
        :counterparty-names="new Map()"
        compact
        :page-size="PAGE_SIZE"
        :loading="loading"
    />
    <MvPagination :page="page" :page-size="PAGE_SIZE" :total="totalItems" @update:page="page = $event" />
</template>
