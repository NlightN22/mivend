<script setup lang="ts">
import { computed } from 'vue';
import { MvFilterChips, type FilterChip } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { useDiscountsList } from '../../composables/useDiscountsList';
import {
    BLANK_DISCOUNTS_FILTERS,
    DISCOUNTS_VIEWS,
    DISCOUNTS_VIEW_VARIANT,
    type DiscountsView,
} from '../../api/discountsList';
import DiscountsListTable from './DiscountsListTable.vue';
import { toDiscountRows, type DiscountRow } from './discountsRows';

// A set counterpartyId fixes the list to one customer, e.g. when embedded in the customer card.
const props = withDefaults(defineProps<{ counterpartyId?: string; urlPrefix?: string }>(), {
    counterpartyId: '',
    urlPrefix: '',
});
defineEmits<{ new: []; renew: [row: DiscountRow] }>();
defineExpose({ reload: () => list.reload() });

const authStore = useAuthStore();
const list = useDiscountsList(props.counterpartyId, props.urlPrefix);
const rows = computed(() => toDiscountRows(list.items.value, list.names.value));

const chips = computed<FilterChip[]>(() =>
    DISCOUNTS_VIEWS.map(v => ({
        key: v.key,
        label: v.label,
        variant: DISCOUNTS_VIEW_VARIANT[v.key],
        count: list.counts.value?.[v.key],
        countLoading: list.countsLoading.value,
    })),
);

function selectView(view: string): void {
    list.filters.value = { ...list.filters.value, view: view as DiscountsView };
}
function clearFilters(): void {
    list.filters.value = { ...BLANK_DISCOUNTS_FILTERS };
}
</script>

<template>
    <DiscountsListTable
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
        @new="$emit('new')"
        @renew="$emit('renew', $event)"
    >
        <template #view-chips>
            <MvFilterChips :chips="chips" :active="list.filters.value.view" @select="selectView" />
        </template>
    </DiscountsListTable>
</template>
