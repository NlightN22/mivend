<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
    MvAdvancedDataTable,
    MvDateRangeField,
    MvCheckbox,
    MvErrorState,
    MvNotice,
    MvSelect,
    useDataTableState,
} from '@mivend/ui-kit';
import {
    DIMENSIONS,
    GRANULARITIES,
    type OrderAnalyticsFixedFilter,
    type OrderDimension,
} from '../../api/orderAnalytics';
import {
    buildEntityFilterColumns,
    usesCounterpartyManager,
    usesProductFilter,
} from '../../api/orderAnalyticsFilter';
import { useOrderAnalytics } from '../../composables/useOrderAnalytics';
import { activeTag, formatDate } from '../../i18n/format';
import { buildOrderAnalyticsColumns, HIDDEN_BY_DEFAULT } from './orderAnalyticsColumns';
import {
    formatAmount,
    formatQuantity,
    pageOf,
    searchRows,
    sortRows,
    toTableRows,
    type OrderAnalyticsTableRow,
} from './orderAnalyticsTable';

// One report everywhere: the page shows it whole, a customer or manager card pins that entity via `fixed`.
const props = defineProps<{
    fixed?: OrderAnalyticsFixedFilter;
    dimension?: OrderDimension;
    // Hides the dimension control when the pinned entity leaves nothing to break down by.
    hideDimension?: boolean;
    urlPrefix?: string;
    storageKey: string;
}>();
const { t } = useI18n();

const report = useOrderAnalytics({
    fixed: props.fixed,
    dimension: props.dimension,
    urlPrefix: props.urlPrefix,
});
const { filters } = report;

const baseColumns = [
    ...buildOrderAnalyticsColumns(true),
    ...buildOrderAnalyticsColumns(true, true).filter(c => c.field.startsWith('product')),
];
const productMode = computed(() => usesProductFilter(report.conditions.value));
// Without a dimension the period is the row's title, so a separate period column would repeat it.
const columns = computed(() =>
    buildOrderAnalyticsColumns(
        filters.value.granularity !== 'NONE' && filters.value.dimension !== 'NONE',
        productMode.value,
    ),
);
const entityFilterColumns = computed(() => buildEntityFilterColumns());
const showMainManager = computed(
    () =>
        filters.value.dimension === 'COUNTERPARTY_MANAGER' ||
        usesCounterpartyManager(report.conditions.value),
);
const { state: tableState } = useDataTableState<{ [key: string]: unknown; title: string }>(
    props.storageKey,
    {
        columnOrder: baseColumns.map(c => c.field),
        columnWidths: Object.fromEntries(baseColumns.map(c => [c.field, c.width])),
        hiddenColumns: HIDDEN_BY_DEFAULT,
        sort: [],
        filters: { title: '' },
        pageSize: 20,
    },
    { columns: baseColumns, allowedFilterKeys: ['title'] },
);
const page = ref(1);

const formatPeriod = (iso: string): string =>
    filters.value.granularity === 'MONTH'
        ? new Intl.DateTimeFormat(activeTag(), { month: 'long', year: 'numeric' }).format(
              new Date(iso),
          )
        : formatDate(iso);

const allRows = computed(() =>
    toTableRows(report.rows.value, t('analytics.orders.total'), formatPeriod),
);
const matching = computed(() =>
    sortRows(
        searchRows(allRows.value, String(tableState.value.filters.title ?? '')),
        tableState.value.sort[0],
    ),
);
const visible = computed(() => pageOf(matching.value, page.value, tableState.value.pageSize));
const rows = computed(
    () =>
        visible.value.map(row => ({
            ...row,
            period: row.period ? formatPeriod(row.period) : '',
            turnover: formatAmount(row.turnover, row.currency, activeTag()),
            turnoverExcludingVat: formatAmount(row.turnoverExcludingVat, row.currency, activeTag()),
            vatTotal: formatAmount(row.vatTotal, row.currency, activeTag()),
            productQuantity: formatQuantity(row.productQuantity, activeTag()),
            productAmount: formatAmount(row.productAmount, row.currency, activeTag()),
        })) as Array<OrderAnalyticsTableRow>,
);

watch([() => tableState.value.filters.title, () => tableState.value.pageSize, report.rows], () => {
    page.value = 1;
});

const granularityOptions = GRANULARITIES.map(value => ({
    value,
    label: t(`analytics.orders.granularities.${value}`),
}));
const dimensionOptions = DIMENSIONS.map(value => ({
    value,
    label: t(`analytics.orders.dimensions.${value}`),
}));
</script>

<template>
    <div class="order-analytics">
        <div class="order-analytics__controls">
            <MvDateRangeField
                v-model:from="filters.from"
                v-model:to="filters.to"
                :presets="['last30', 'thisMonth', 'prevMonth', 'last90']"
            />
            <label class="order-analytics__control">
                <span>{{ t('analytics.orders.granularity') }}</span>
                <MvSelect v-model="filters.granularity" :options="granularityOptions" />
            </label>
            <label v-if="!hideDimension" class="order-analytics__control">
                <span>{{ t('analytics.orders.dimension') }}</span>
                <MvSelect v-model="filters.dimension" :options="dimensionOptions" />
            </label>
            <MvCheckbox
                v-if="showMainManager"
                v-model="report.mainManagerOnly.value"
                :label="t('analytics.orders.mainManagerOnly')"
            />
        </div>

        <MvNotice v-if="!report.periodValid.value" variant="warning">
            {{ t('analytics.orders.invalidPeriod') }}
        </MvNotice>
        <MvNotice v-else-if="report.state.value !== 'OK'" variant="warning">
            {{ t(`analytics.orders.states.${report.state.value}`) }}
        </MvNotice>
        <MvNotice v-else-if="report.limited.value" variant="info">
            {{ t('analytics.orders.limited') }}
        </MvNotice>
        <p class="order-analytics__basis">{{ t('analytics.orders.basis') }}</p>
        <p v-if="productMode" class="order-analytics__basis">
            {{ t('analytics.orders.productBasis') }}
        </p>
        <p v-if="filters.dimension === 'COUNTERPARTY_MANAGER'" class="order-analytics__basis">
            {{ t('analytics.orders.counterpartyManagerBasis') }}
        </p>

        <MvAdvancedDataTable
            v-model:table-state="tableState"
            v-model:conditions="report.conditions.value"
            :extra-filter-columns="entityFilterColumns"
            :columns="columns"
            :rows="rows"
            :loading="report.loading.value"
            :total-items="matching.length"
            :page="page"
            data-key="key"
            :row-height-px="56"
            :header-height-px="65"
            :search="{
                filterKey: 'title',
                placeholder: t('analytics.orders.searchPlaceholder'),
            }"
            :default-filters="{ title: '' }"
            :empty-message="t('analytics.orders.empty')"
            @update:page="page = $event"
            @reset-page="page = 1"
        >
            <template #empty>
                <MvErrorState
                    v-if="report.failed.value"
                    :title="t('analytics.orders.loadFailedTitle')"
                    :message="t('analytics.orders.loadFailedMessage')"
                    @retry="report.reload"
                />
                <template v-else>{{
                    report.loading.value ? '' : t('analytics.orders.empty')
                }}</template>
            </template>
        </MvAdvancedDataTable>
    </div>
</template>

<style scoped>
.order-analytics {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.order-analytics__controls {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 12px 16px;
}

.order-analytics__control {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    font-size: 13px;
    color: var(--el-text-color-secondary);
}

.order-analytics__basis {
    margin: 0;
    color: var(--el-text-color-secondary);
    font-size: 13px;
}
</style>
