<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvFilterChips, type FilterChip } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { useCurrency } from '../../composables/useCurrency';
import { useCustomersList } from '../../composables/useCustomersList';
import {
    BLANK_CUSTOMERS_FILTERS,
    CUSTOMERS_VIEWS,
    type CustomersView,
} from '../../api/customersList';
import type { CounterpartyFilterParameter } from '../../api/generated/graphql';
import { downloadCsv } from '../../utils/csv';
import CustomersListTable from './CustomersListTable.vue';
import { toCustomerRows } from './customersRows';

// A set fixedFilter narrows the list beside the user's own filters, e.g. a nested list in the customer card.
// A nested list (fixedFilter) keeps its state under its own URL keys unless the caller names a prefix.
const props = defineProps<{ fixedFilter?: CounterpartyFilterParameter; urlPrefix?: string }>();
const urlPrefix = props.urlPrefix ?? (props.fixedFilter ? 'nested.' : '');

const { t } = useI18n();
const authStore = useAuthStore();
const { formatWhole } = useCurrency();
const withManagerFilter = authStore.roleCode !== 'manager';
const list = useCustomersList(() => props.fixedFilter, withManagerFilter, urlPrefix);

// The ERP manager id is the field the manager filter and sort use, so the column shows its name first.
function managerName(id: string | null, erpId: string | null): string {
    const byErpId = erpId ? list.managerLabels.value.get(erpId) : undefined;
    if (byErpId) return byErpId;
    const admin = id ? list.managers.value.find(m => m.id === id)?.name : undefined;
    return admin ?? erpId ?? '—';
}
function branchName(id: string | null): string {
    if (!id) return '';
    return list.branches.value.find(b => b.id === id)?.name ?? '';
}

const rows = computed(() =>
    toCustomerRows(list.result.value?.items ?? [], {
        credit: list.result.value?.credit ?? new Map(),
        discountCounts: list.result.value?.discountCounts ?? new Map(),
        managerName,
        branchName,
        formatMoney: formatWhole,
    }),
);

const chips = computed<FilterChip[]>(() =>
    CUSTOMERS_VIEWS.map(v => ({
        key: v.key,
        label: t(`customers.list.views.${v.key}`),
        count: list.counts.value?.[v.key],
        countLoading: list.countsLoading.value,
    })),
);

function selectView(view: string): void {
    list.filters.value = { ...list.filters.value, view: view as CustomersView };
}
function clearFilters(): void {
    list.filters.value = { ...BLANK_CUSTOMERS_FILTERS };
}

function exportCsv(): void {
    downloadCsv(
        'customers.csv',
        [
            'shortName',
            'inn',
            'creditLimit',
            'creditBalance',
            'discounts',
            'lastOrder',
            'isActive',
        ].map(field => t(`customers.list.columns.${field}`)),
        rows.value.map(r => [
            r.shortName,
            r.inn,
            r.creditLimit,
            r.creditBalance,
            r.discounts,
            r.lastOrder,
            t(r.isActive ? 'customers.list.status.active' : 'customers.list.status.inactive'),
        ]),
    );
}
</script>

<template>
    <CustomersListTable
        :rows="rows"
        :loading="list.loading.value"
        :failed="list.failed.value"
        :total-items="list.totalItems.value"
        :page="list.page.value"
        :page-size="list.pageSize.value"
        :filters="list.filters.value"
        :sort="list.sort.value"
        :administrator-id="authStore.administrator?.id ?? 'anonymous'"
        :manager-options="withManagerFilter ? list.managerOptions.value : undefined"
        :branch-options="list.branchOptions.value"
        :url-prefix="urlPrefix"
        @update:filters="list.filters.value = $event"
        @update:sort="list.sort.value = $event"
        @update:page="list.page.value = $event"
        @update:page-size="list.pageSize.value = $event"
        @clear-filters="clearFilters"
        @retry="list.reload"
        @export="exportCsv"
    >
        <template #view-chips>
            <MvFilterChips :chips="chips" :active="list.filters.value.view" @select="selectView" />
        </template>
    </CustomersListTable>
</template>
