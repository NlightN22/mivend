<script setup lang="ts">
import { computed } from 'vue';
import { MvFilterChips, MvWarningBanner, type FilterChip } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { useProformaInvoicesList } from '../../composables/useProformaInvoicesList';
import {
    BLANK_PROFORMA_INVOICES_FILTERS,
    PROFORMA_INVOICES_VIEWS,
    PROFORMA_INVOICES_VIEW_VARIANT,
    type ProformaInvoicesView,
} from '../../api/proformaInvoicesList';
import ProformaInvoicesListTable from './ProformaInvoicesListTable.vue';
import { toProformaInvoiceRows } from './proformaInvoicesRows';

// A set counterpartyId fixes the list to one customer, e.g. when embedded in the customer card.
const props = withDefaults(defineProps<{ counterpartyId?: string; urlPrefix?: string }>(), {
    counterpartyId: '',
    urlPrefix: '',
});

const authStore = useAuthStore();
const list = useProformaInvoicesList(props.counterpartyId, props.urlPrefix);
const rows = computed(() => toProformaInvoiceRows(list.items.value));

const chips = computed<FilterChip[]>(() =>
    PROFORMA_INVOICES_VIEWS.map(v => ({
        key: v.key,
        label: v.label,
        variant: PROFORMA_INVOICES_VIEW_VARIANT[v.key],
        count: list.counts.value?.[v.key],
        countLoading: list.countsLoading.value,
    })),
);

function selectView(view: string): void {
    list.filters.value = { ...list.filters.value, view: view as ProformaInvoicesView };
}
function clearFilters(): void {
    list.filters.value = { ...BLANK_PROFORMA_INVOICES_FILTERS };
}
</script>

<template>
    <MvWarningBanner
        v-if="!props.counterpartyId && list.counterpartyId.value"
        action-text="Show all customers"
        @action="list.counterpartyId.value = ''"
    >
        Filtered to one customer{{ rows[0] ? ` (${rows[0].customer})` : '' }}.
    </MvWarningBanner>
    <ProformaInvoicesListTable
        :rows="rows"
        :loading="list.loading.value"
        :failed="list.failed.value"
        :total-items="list.totalItems.value"
        :page="list.page.value"
        :page-size="list.pageSize.value"
        :filters="list.filters.value"
        :sort="list.sort.value"
        :administrator-id="authStore.administrator?.id ?? 'anonymous'"
        :nested="Boolean(props.counterpartyId)"
        :url-prefix="props.urlPrefix"
        @update:filters="list.filters.value = $event"
        @update:sort="list.sort.value = $event"
        @update:page="list.page.value = $event"
        @update:page-size="list.pageSize.value = $event"
        @clear-filters="clearFilters"
        @retry="list.reload"
    >
        <template #view-chips>
            <MvFilterChips
                :chips="chips"
                :active="list.filters.value.view"
                @select="selectView"
            />
        </template>
    </ProformaInvoicesListTable>
</template>
