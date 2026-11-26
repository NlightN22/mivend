<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvDateTimeCell, MvStatusBadge, type AdvancedDataTableColumn } from '@mivend/ui-kit';
import type { ConsistencySourceRow } from '../../api/exchangeHealth';
import {
    countComparisonView,
    countEntries,
    differenceText,
    formatLag,
    sourceHealthVariant,
    stockDefectsView,
    streamLags,
    totalOpen,
} from '../../api/exchangeHealthView';
import { ageUnits } from '../../api/exchangeHealthLabels';
import ExchangeStaticTable from './ExchangeStaticTable.vue';

const props = defineProps<{ source: ConsistencySourceRow }>();
const { t } = useI18n();

const col = (
    group: string,
    field: string,
    width: number,
    extra: Partial<AdvancedDataTableColumn> = {},
): AdvancedDataTableColumn => ({
    field,
    header: t(`exchangeHealth.columns.${group}.${field}`),
    width,
    minWidth: Math.min(width, 90),
    filterConfig: { type: 'none' },
    ...extra,
});
const countColumns = [
    col('counts', 'stream', 220, { required: true, priority: 10, mobile: { primary: true } }),
    col('counts', 'mirror', 110, { align: 'end', priority: 8 }),
    col('counts', 'expected', 170, { align: 'end', priority: 8 }),
    col('counts', 'difference', 110, { align: 'end', priority: 9 }),
    col('counts', 'lag', 100, { priority: 5 }),
    col('counts', 'status', 100, { priority: 7, mobile: { badge: true } }),
];
const defectColumns = [
    col('defects', 'kind', 240, { required: true, priority: 10, mobile: { primary: true } }),
    col('defects', 'mirror', 130, { align: 'end', priority: 8 }),
    col('defects', 'expected', 170, { align: 'end', priority: 8 }),
    col('defects', 'difference', 110, { align: 'end', priority: 9 }),
];
const ignoredColumns = [
    col('ignored', 'entityType', 220, { required: true, priority: 10, mobile: { primary: true } }),
    col('ignored', 'reason', 520, { priority: 5 }),
];

const open = computed(() => totalOpen(props.source.localOpenBySeverity));
const byType = computed(() => countEntries(props.source.localOpenByType));
const bySeverity = computed(() => countEntries(props.source.localOpenBySeverity));
const counts = computed(() => {
    const lags = streamLags(props.source.summary);
    return countComparisonView(props.source.summary).map(r => ({
        id: r.stream,
        stream: r.stream,
        mirror: r.mirror ?? '—',
        expected: r.expected ?? '—',
        difference: differenceText(r.mirror, r.expected),
        lag: lags.has(r.stream) ? formatLag(lags.get(r.stream) as number, ageUnits()) : '—',
        status: r.status,
        differs: r.differs,
    }));
});
const defects = computed(() => stockDefectsView(props.source.summary));
const defectRows = computed(() =>
    (defects.value?.rows ?? []).map(r => ({
        id: r.kind,
        kind: t(`exchangeHealth.defects.${r.kind}`),
        mirror: r.mirror,
        expected: r.integrationService ?? '—',
        difference:
            r.differs && r.integrationService !== null ? r.mirror - r.integrationService : '—',
        differs: r.differs,
    })),
);
const ignoredRows = computed(() =>
    props.source.ignoredEntityTypes.map(i => ({ id: i.entityType, ...i })),
);
type Row = { [key: string]: unknown; differs?: boolean };
</script>

<template>
    <section class="source">
        <header class="source__head">
            <h2 class="source__name">{{ source.source }}</h2>
            <MvStatusBadge :variant="sourceHealthVariant(source.health)">{{
                source.health
            }}</MvStatusBadge>
            <span class="source__muted">{{
                t('exchangeHealth.reports.openCount', { count: open })
            }}</span>
            <span class="source__muted source__times">
                {{ t('exchangeHealth.reports.lastCheck') }}
                <MvDateTimeCell v-if="source.lastFinishedAt" :value="source.lastFinishedAt" />
                <template v-else>{{ t('exchangeHealth.common.never') }}</template>
                · {{ t('exchangeHealth.reports.lastSuccess') }}
                <MvDateTimeCell v-if="source.lastSuccessAt" :value="source.lastSuccessAt" />
                <template v-else>{{ t('exchangeHealth.common.never') }}</template>
            </span>
        </header>
        <p v-if="source.health !== 'ok'" class="source__problem">{{ source.healthDetail }}</p>
        <p v-if="byType.length" class="source__counts">
            <span class="source__muted">{{ t('exchangeHealth.reports.byType') }}</span>
            {{ byType.map(([k, n]) => `${k} ${n}`).join(', ') }}
        </p>
        <p v-if="bySeverity.length" class="source__counts">
            <span class="source__muted">{{ t('exchangeHealth.reports.bySeverity') }}</span>
            {{ bySeverity.map(([k, n]) => `${k} ${n}`).join(', ') }}
        </p>
        <template v-if="counts.length">
            <h3 class="source__title">{{ t('exchangeHealth.reports.entityCounts') }}</h3>
            <ExchangeStaticTable
                :columns="countColumns"
                :rows="counts"
                data-key="id"
                :storage-key="`exchange-counts-${source.source}`"
                :empty-message="t('exchangeHealth.reports.entityCounts')"
            >
                <template #cell-difference="{ data }">
                    <span :class="{ source__differs: (data as Row).differs }">{{
                        (data as Row).difference
                    }}</span>
                </template>
                <template #cell-status="{ data }">
                    <MvStatusBadge
                        :variant="(data as Row).status === 'ok' ? 'success' : 'neutral'"
                        >{{ (data as Row).status }}</MvStatusBadge
                    >
                </template>
            </ExchangeStaticTable>
        </template>
        <template v-if="defects">
            <h3 class="source__title">
                {{ t('exchangeHealth.reports.stockDefects') }}
                <MvStatusBadge :variant="defects.status === 'ok' ? 'success' : 'neutral'">{{
                    t('exchangeHealth.reports.integrationService', { status: defects.status })
                }}</MvStatusBadge>
            </h3>
            <p class="source__muted">{{ t('exchangeHealth.reports.stockDefectsHint') }}</p>
            <ExchangeStaticTable
                :columns="defectColumns"
                :rows="defectRows"
                data-key="id"
                :storage-key="`exchange-defects-${source.source}`"
                :empty-message="t('exchangeHealth.reports.stockDefects')"
            >
                <template #cell-difference="{ data }">
                    <span :class="{ source__differs: (data as Row).differs }">{{
                        (data as Row).difference
                    }}</span>
                </template>
            </ExchangeStaticTable>
        </template>
        <template v-if="ignoredRows.length">
            <h3 class="source__title">{{ t('exchangeHealth.reports.notChecked') }}</h3>
            <ExchangeStaticTable
                :columns="ignoredColumns"
                :rows="ignoredRows"
                data-key="id"
                :storage-key="`exchange-ignored-${source.source}`"
                :empty-message="t('exchangeHealth.reports.notChecked')"
            >
                <template #cell-reason="{ data }">
                    <span class="source__wrap">{{ (data as Row).reason }}</span>
                </template>
            </ExchangeStaticTable>
        </template>
    </section>
</template>

<style scoped>
.source {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
}

.source__head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
}

.source__name,
.source__title {
    margin: 0;
    font-size: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
}

.source__title {
    font-size: 14px;
}

.source__muted {
    color: var(--el-text-color-secondary);
    font-size: 13px;
    margin: 0;
}

.source__times {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
}

.source__counts {
    margin: 0;
    font-size: 13px;
}

.source__problem,
.source__differs {
    color: var(--app-danger-fg);
    font-weight: 600;
    margin: 0;
}

.source__wrap {
    white-space: normal;
    overflow-wrap: anywhere;
}
</style>
