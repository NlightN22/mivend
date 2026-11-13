<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDocumentTypeCodes } from '../../composables/useDocumentTypeCodes';
import { documentTypeVariant } from '../../utils/documentTypeVariant';
import { MvFilterChips, MvWarningBanner, type FilterChip } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { useSettlementsList } from '../../composables/useSettlementsList';
import { ALL_SETTLEMENT_TYPES, BLANK_SETTLEMENTS_FILTERS } from '../../api/settlementsList';
import SettlementsListTable from './SettlementsListTable.vue';
import { toSettlementRows } from './settlementsRows';

// A set counterpartyId fixes the list to one customer, e.g. when embedded in the customer card.
const props = withDefaults(defineProps<{ counterpartyId?: string; urlPrefix?: string }>(), {
    counterpartyId: '',
    urlPrefix: '',
});

const { t } = useI18n();
const authStore = useAuthStore();
const list = useSettlementsList(props.counterpartyId, props.urlPrefix);
const { codes: typeCodes, ensureLoaded } = useDocumentTypeCodes();
ensureLoaded();
const rows = computed(() => toSettlementRows(list.items.value, typeCodes.value));

// One chip per document type present for the current search and filter, after the total.
const chips = computed<FilterChip[]>(() => {
    const counts = list.counts.value;
    const loading = list.countsLoading.value;
    const total = counts?.reduce((sum, c) => sum + c.count, 0);
    const active = list.filters.value.view;
    const known = new Set(counts?.map(c => c.documentType));
    const chosen =
        active !== ALL_SETTLEMENT_TYPES && counts && !known.has(active)
            ? [{ key: active, label: active, count: 0, countLoading: loading }]
            : [];
    return [
        {
            key: ALL_SETTLEMENT_TYPES,
            label: t('settlements.list.all'),
            count: total,
            countLoading: loading,
        },
        ...(counts ?? []).map(c => ({
            key: c.documentType,
            label: c.label,
            variant: documentTypeVariant(c.documentType, typeCodes.value),
            count: c.count,
            countLoading: loading,
        })),
        ...chosen,
    ];
});

function selectView(view: string): void {
    list.filters.value = { ...list.filters.value, view };
}
function clearFilters(): void {
    list.filters.value = { ...BLANK_SETTLEMENTS_FILTERS };
}
</script>

<template>
    <MvWarningBanner
        v-if="!props.counterpartyId && list.counterpartyId.value"
        :action-text="t('settlements.list.showAllCustomers')"
        @action="list.counterpartyId.value = ''"
    >
        {{
            rows[0]
                ? t('settlements.list.filteredToCustomerNamed', { customer: rows[0].customer })
                : t('settlements.list.filteredToCustomer')
        }}
    </MvWarningBanner>
    <SettlementsListTable
        :rows="rows"
        :loading="list.loading.value"
        :failed="list.failed.value"
        :total-items="list.totalItems.value"
        :page="list.page.value"
        :page-size="list.pageSize.value"
        :filters="list.filters.value"
        :sort="list.sort.value"
        :type-options="list.typeOptions.value"
        :organization-options="list.organizationOptions.value"
        :nested="Boolean(props.counterpartyId)"
        :url-prefix="props.urlPrefix"
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
    </SettlementsListTable>
</template>
