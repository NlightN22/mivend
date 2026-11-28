<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvNotice, MvStatusBadge, type AdvancedDataTableColumn } from '@mivend/ui-kit';
import { fetchReconciliationStates, type ReconciliationStateRow } from '../../api/exchangeHealth';
import ExchangeStaticTable from './ExchangeStaticTable.vue';

type Variant = 'success' | 'warning' | 'danger' | 'neutral';

const { t } = useI18n();
const rows = ref<ReconciliationStateRow[]>([]);
const failed = ref(false);

onMounted(async () => {
    try {
        rows.value = await fetchReconciliationStates();
    } catch (e) {
        console.warn('[exchange health] could not load the reconciliation states:', e);
        failed.value = true;
    }
});

const col = (
    field: string,
    width: number,
    extra: Partial<AdvancedDataTableColumn> = {},
): AdvancedDataTableColumn => ({
    field,
    header: t(`exchangeHealth.reconciliationStates.columns.${field}`),
    width,
    minWidth: Math.min(width, 90),
    filterConfig: { type: 'none' },
    ...extra,
});
const columns = [
    col('aggregateType', 150, { required: true, priority: 10, mobile: { primary: true } }),
    col('state', 120, { priority: 9, mobile: { badge: true } }),
    col('filter', 260, { priority: 5 }),
    col('ourCount', 90, { align: 'end', priority: 8 }),
    col('theirCount', 110, { align: 'end', priority: 8 }),
    col('gap', 80, { align: 'end', priority: 9 }),
    col('explainedGap', 100, { align: 'end', priority: 6 }),
    col('heal', 280, { priority: 7 }),
];

const variantOf: Record<string, Variant> = {
    'in-sync': 'success',
    seeding: 'neutral',
    converging: 'warning',
    stalled: 'danger',
};
const tableRows = computed(() =>
    rows.value.map(r => ({
        ...r,
        id: r.aggregateType,
        heal: r.healOutcome
            ? `${t(`exchangeHealth.reconciliationStates.outcomes.${r.healOutcome}`)}${
                  r.healRealRun === false
                      ? ` (${t('exchangeHealth.reconciliationStates.dryRun')})`
                      : ''
              }`
            : '—',
    })),
);
type Row = (typeof tableRows.value)[number];
</script>

<template>
    <section class="exchange-states">
        <h2>{{ t('exchangeHealth.reconciliationStates.title') }}</h2>
        <MvNotice v-if="failed" variant="error">{{
            t('exchangeHealth.reconciliationStates.loadFailed')
        }}</MvNotice>
        <ExchangeStaticTable
            v-else
            :columns="columns"
            :rows="tableRows"
            data-key="id"
            storage-key="exchange-reconciliation-states"
            :empty-message="t('exchangeHealth.reconciliationStates.empty')"
        >
            <template #cell-state="{ data }">
                <MvStatusBadge :variant="variantOf[(data as Row).state] ?? 'neutral'">{{
                    t(`exchangeHealth.reconciliationStates.states.${(data as Row).state}`)
                }}</MvStatusBadge>
                <MvStatusBadge v-if="(data as Row).seedingAlarm" variant="danger">{{
                    t('exchangeHealth.reconciliationStates.seedingAlarm')
                }}</MvStatusBadge>
            </template>
        </ExchangeStaticTable>
    </section>
</template>
