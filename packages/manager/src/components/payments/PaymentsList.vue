<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvFilterChips, MvWarningBanner, type FilterChip } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { usePaymentsList } from '../../composables/usePaymentsList';
import {
    BLANK_PAYMENTS_FILTERS,
    PAYMENTS_VIEWS,
    PAYMENTS_VIEW_VARIANT,
    type PaymentsView,
} from '../../api/paymentsList';
import PaymentsListTable from './PaymentsListTable.vue';
import { toPaymentRows } from './paymentsRows';

const { t } = useI18n();
const authStore = useAuthStore();
const list = usePaymentsList();
const rows = computed(() => toPaymentRows(list.items.value));

const chips = computed<FilterChip[]>(() =>
    PAYMENTS_VIEWS.map(v => ({
        key: v.key,
        label: v.label,
        variant: PAYMENTS_VIEW_VARIANT[v.key],
        count: list.counts.value?.[v.key],
        countLoading: list.countsLoading.value,
    })),
);

function selectView(view: string): void {
    list.filters.value = { ...list.filters.value, view: view as PaymentsView };
}
function clearFilters(): void {
    list.filters.value = { ...BLANK_PAYMENTS_FILTERS };
}
</script>

<template>
    <MvWarningBanner
        v-if="list.counterpartyId.value"
        :action-text="t('payments.list.showAllCustomers')"
        @action="list.counterpartyId.value = ''"
    >
        {{
            rows[0]
                ? t('payments.list.filteredToCustomerNamed', { customer: rows[0].customer })
                : t('payments.list.filteredToCustomer')
        }}
    </MvWarningBanner>
    <PaymentsListTable
        :rows="rows"
        :loading="list.loading.value"
        :failed="list.failed.value"
        :total-items="list.totalItems.value"
        :page="list.page.value"
        :page-size="list.pageSize.value"
        :filters="list.filters.value"
        :sort="list.sort.value"
        :administrator-id="authStore.administrator?.id ?? 'anonymous'"
        @update:filters="list.filters.value = $event"
        @update:sort="list.sort.value = $event"
        @update:page="list.page.value = $event"
        @update:page-size="list.pageSize.value = $event"
        @clear-filters="clearFilters"
        @retry="list.reload"
    >
        <template #view-chips>
            <MvFilterChips :chips="chips" :active="list.filters.value.view" @select="selectView" />
        </template>
    </PaymentsListTable>
</template>
