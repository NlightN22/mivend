<script setup lang="ts">
import { computed } from 'vue';
import { MvFilterChips, type FilterChip } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { useErpDiscountsList } from '../../composables/useErpDiscountsList';
import {
    BLANK_ERP_DISCOUNTS_FILTERS,
    ERP_DISCOUNTS_VIEWS,
    ERP_DISCOUNT_STATUS_VARIANT,
    type ErpDiscountsView,
} from '../../api/erpDiscountsList';
import { ERP_URL_PREFIX } from '../../composables/erpDiscountsListUrl';
import ErpDiscountsListTable from './ErpDiscountsListTable.vue';
import { toErpDiscountRows } from './erpDiscountsRows';

// A set counterpartyId fixes the list to one customer (plus the setups for everyone), e.g. in the customer card.
const props = withDefaults(defineProps<{ counterpartyId?: string; urlPrefix?: string }>(), {
    counterpartyId: '',
    urlPrefix: '',
});

const authStore = useAuthStore();
const prefix = props.urlPrefix + ERP_URL_PREFIX;
const list = useErpDiscountsList(props.counterpartyId, prefix);
const rows = computed(() => toErpDiscountRows(list.items.value));

const chips = computed<FilterChip[]>(() =>
    ERP_DISCOUNTS_VIEWS.map(v => ({
        key: v.key,
        label: v.label,
        variant: v.key === 'all' ? undefined : ERP_DISCOUNT_STATUS_VARIANT[v.key],
        emphasis: v.key === 'running',
        count: list.counts.value?.[v.key],
        countLoading: list.countsLoading.value,
    })),
);

function selectView(view: string): void {
    list.filters.value = { ...list.filters.value, view: view as ErpDiscountsView };
}
function clearFilters(): void {
    list.filters.value = { ...BLANK_ERP_DISCOUNTS_FILTERS };
}
</script>

<template>
    <ErpDiscountsListTable
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
        :url-prefix="prefix"
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
    </ErpDiscountsListTable>
</template>
