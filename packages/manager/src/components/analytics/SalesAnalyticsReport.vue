<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
    MvAdvancedDataTable,
    MvCheckbox,
    MvDateRangeField,
    MvErrorState,
    MvNotice,
    MvSelect,
    useDataTableState,
} from '@mivend/ui-kit';
import { GRANULARITIES } from '../../api/orderAnalytics';
import { SALES_GROUP_KEYS, buildEntityFilterColumns } from '../../api/orderAnalyticsFilter';
import { useAnalyticsGroupKinds } from '../../composables/useAnalyticsGroupKinds';
import { SALES_DIMENSIONS, SALES_FILTER_KEYS } from '../../api/salesAnalytics';
import { useSalesAnalytics } from '../../composables/useSalesAnalytics';
import { activeTag, formatDate } from '../../i18n/format';
import AnalyticsExportButton from './AnalyticsExportButton.vue';
import { exportCsv, exportFileName } from './analyticsExport';
import { pageOf, searchRows, sortRows } from './orderAnalyticsTable';
import { buildSalesAnalyticsColumns, SALES_HIDDEN_BY_DEFAULT } from './salesAnalyticsColumns';
import {
    formatSalesRow,
    SALES_AMOUNT_FIELDS,
    toSalesTableRows,
    type SalesAnalyticsTableRow,
} from './salesAnalyticsTable';

const props = defineProps<{ urlPrefix?: string; storageKey: string }>();
const { t } = useI18n();

const report = useSalesAnalytics(props.urlPrefix);
const { filters } = report;

const baseColumns = buildSalesAnalyticsColumns(true);
// Without a dimension the period is the row's title, so a separate period column would repeat it.
const columns = computed(() =>
    buildSalesAnalyticsColumns(
        filters.value.granularity !== 'NONE' && filters.value.dimension !== 'NONE',
    ),
);
const groupKinds = useAnalyticsGroupKinds();
const entityFilterColumns = computed(() =>
    buildEntityFilterColumns(SALES_FILTER_KEYS, 'sales', groupKinds.value, SALES_GROUP_KEYS),
);
const showMainManager = computed(
    () =>
        filters.value.dimension === 'COUNTERPARTY_MANAGER' ||
        report.conditions.value.some(c => c.columnKey === 'counterpartyManager'),
);
const { state: tableState } = useDataTableState<{ [key: string]: unknown; title: string }>(
    props.storageKey,
    {
        columnOrder: baseColumns.map(c => c.field),
        columnWidths: Object.fromEntries(baseColumns.map(c => [c.field, c.width])),
        hiddenColumns: SALES_HIDDEN_BY_DEFAULT,
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
    toSalesTableRows(
        report.rows.value,
        t('analytics.sales.total'),
        formatPeriod,
        filters.value.dimension === 'NONE' ? undefined : t('analytics.sales.notSpecified'),
    ),
);
const matching = computed(() =>
    sortRows<SalesAnalyticsTableRow>(
        searchRows(allRows.value as never, String(tableState.value.filters.title ?? '')) as never,
        tableState.value.sort[0],
        SALES_AMOUNT_FIELDS,
    ),
);
const rows = computed(() =>
    pageOf(matching.value, page.value, tableState.value.pageSize).map(row =>
        formatSalesRow(row, activeTag()),
    ),
);

const buildExport = (): string =>
    exportCsv(
        columns.value.map(c => ({ field: c.field, header: c.header })),
        matching.value.map(row => ({ ...row, period: row.periodIso })),
        SALES_AMOUNT_FIELDS,
        [
            t('analytics.sales.preliminary'),
            ...(report.limited.value ? [t('analytics.sales.limited')] : []),
        ],
    );

watch([() => tableState.value.filters.title, () => tableState.value.pageSize, report.rows], () => {
    page.value = 1;
});

const granularityOptions = GRANULARITIES.map(value => ({
    value,
    label: t(`analytics.sales.granularities.${value}`),
}));
const dimensionOptions = SALES_DIMENSIONS.map(value => ({
    value,
    label: t(`analytics.sales.dimensions.${value}`),
}));
</script>

<template>
    <div class="sales-analytics">
        <div class="sales-analytics__controls">
            <MvDateRangeField
                v-model:from="filters.from"
                v-model:to="filters.to"
                :presets="['last30', 'thisMonth', 'prevMonth', 'last90']"
            />
            <label class="sales-analytics__control">
                <span>{{ t('analytics.sales.granularity') }}</span>
                <MvSelect v-model="filters.granularity" :options="granularityOptions" />
            </label>
            <label class="sales-analytics__control">
                <span>{{ t('analytics.sales.dimension') }}</span>
                <MvSelect v-model="filters.dimension" :options="dimensionOptions" />
            </label>
            <MvCheckbox
                v-if="showMainManager"
                v-model="report.mainManagerOnly.value"
                :label="t('analytics.sales.mainManagerOnly')"
            />
            <AnalyticsExportButton
                :disabled="matching.length === 0"
                :filename="exportFileName('sales-analytics', filters.from, filters.to)"
                :build="buildExport"
            />
        </div>

        <MvNotice variant="warning" data-testid="sales-preliminary">
            {{ t('analytics.sales.preliminary') }}
        </MvNotice>
        <MvNotice v-if="!report.periodValid.value" variant="warning">
            {{ t('analytics.sales.invalidPeriod') }}
        </MvNotice>
        <MvNotice v-else-if="report.state.value !== 'OK'" variant="warning">
            {{ t(`analytics.sales.states.${report.state.value}`) }}
        </MvNotice>
        <MvNotice v-else-if="report.limited.value" variant="info">
            {{ t('analytics.sales.limited') }}
        </MvNotice>
        <MvNotice
            v-if="report.state.value === 'OK' && report.correctionsWithoutEffect.value > 0"
            variant="warning"
            data-testid="sales-corrections-without-effect"
        >
            {{
                t('analytics.sales.correctionsWithoutEffect', {
                    count: report.correctionsWithoutEffect.value,
                })
            }}
        </MvNotice>
        <MvNotice
            v-if="report.state.value === 'OK' && report.unresolvedCurrencies.value.length"
            variant="warning"
            data-testid="sales-unresolved-currencies"
        >
            {{
                t('analytics.sales.unresolvedCurrencies', {
                    values: report.unresolvedCurrencies.value.join(', '),
                })
            }}
        </MvNotice>
        <p class="sales-analytics__basis">{{ t('analytics.sales.basis') }}</p>
        <p class="sales-analytics__basis">{{ t('analytics.sales.excludingVatBasis') }}</p>
        <p v-if="showMainManager" class="sales-analytics__basis">
            {{ t('analytics.sales.counterpartyManagerBasis') }}
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
                placeholder: t('analytics.sales.searchPlaceholder'),
            }"
            :default-filters="{ title: '' }"
            :empty-message="t('analytics.sales.empty')"
            @update:page="page = $event"
            @reset-page="page = 1"
        >
            <template #empty>
                <MvErrorState
                    v-if="report.failed.value"
                    :title="t('analytics.sales.loadFailedTitle')"
                    :message="t('analytics.sales.loadFailedMessage')"
                    @retry="report.reload"
                />
                <template v-else>{{
                    report.loading.value ? '' : t('analytics.sales.empty')
                }}</template>
            </template>
        </MvAdvancedDataTable>
    </div>
</template>

<style scoped>
.sales-analytics {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.sales-analytics__controls {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 12px 16px;
}

.sales-analytics__control {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    font-size: 13px;
    color: var(--el-text-color-secondary);
}

.sales-analytics__basis {
    margin: 0;
    color: var(--el-text-color-secondary);
    font-size: 13px;
}
</style>
