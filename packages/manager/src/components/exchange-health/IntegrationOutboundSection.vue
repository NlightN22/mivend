<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvNotice, MvStatusBadge, type AdvancedDataTableColumn } from '@mivend/ui-kit';
import { fetchOutboxHealth, type OutboxHealthReport } from '../../api/exchangeHealth';
import { formatAge } from '../../api/exchangeHealthView';
import { REJECTED_ORDERS_LINK, outboundProblemsLink } from '../../api/exchangeLinks';
import ExchangeStaticTable from './ExchangeStaticTable.vue';

const { t } = useI18n();
const report = ref<OutboxHealthReport | null>(null);
const failed = ref(false);

onMounted(async () => {
    try {
        report.value = await fetchOutboxHealth();
    } catch (e) {
        console.warn('[exchange health] could not load the outbox health:', e);
        failed.value = true;
    }
});

const col = (
    field: string,
    width: number,
    extra: Partial<AdvancedDataTableColumn> = {},
): AdvancedDataTableColumn => ({
    field,
    header: t(`exchangeHealth.columns.outboxHealth.${field}`),
    width,
    minWidth: Math.min(width, 90),
    filterConfig: { type: 'none' },
    ...extra,
});
const columns: AdvancedDataTableColumn[] = [
    col('eventType', 170, { required: true, priority: 10, mobile: { primary: true } }),
    col('schemaSource', 100, { priority: 3 }),
    col('pending', 70, { align: 'end', priority: 7 }),
    col('failed', 70, { align: 'end', priority: 9 }),
    col('skipped', 80, { align: 'end', priority: 9 }),
    col('held', 70, { align: 'end', priority: 4 }),
    col('oldest', 70, { align: 'end', priority: 6 }),
    col('lastPublished', 90, { priority: 5 }),
    col('lastProblem', 150, { priority: 4 }),
];

const now = Date.now();
const rows = computed(() =>
    (report.value?.integrationOutboxHealth ?? []).map(r => ({
        ...r,
        id: r.eventType,
        oldest: formatAge(r.oldestPendingAt, now),
        lastPublished: r.lastPublishedAt
            ? `${formatAge(r.lastPublishedAt, now)} ${t('exchangeHealth.common.ago')}`
            : '—',
        lastProblem: r.lastError ?? r.lastSkipReason ?? '—',
    })),
);
type Row = (typeof rows.value)[number];
const heldTotal = computed(() => rows.value.reduce((sum, r) => sum + r.held, 0));
</script>

<template>
    <MvNotice v-if="failed" variant="error">{{
        t('exchangeHealth.common.loadFailedMessage')
    }}</MvNotice>
    <template v-else-if="report">
        <p class="outbound__intro">{{ t('exchangeHealth.integration.outboundIntro') }}</p>
        <ExchangeStaticTable
            :columns="columns"
            :rows="rows"
            data-key="id"
            storage-key="exchange-outbox-health"
            :hidden="['schemaSource', 'held']"
            :empty-message="t('exchangeHealth.integration.noOutbound')"
            :row-height-px="64"
        >
            <template #cell-schemaSource="{ data }">
                <MvStatusBadge
                    v-if="(data as Row).schemaSource"
                    :variant="(data as Row).schemaSource === 'contract' ? 'success' : 'neutral'"
                    >{{
                        t(`exchangeHealth.integration.schema.${(data as Row).schemaSource}`)
                    }}</MvStatusBadge
                >
                <span v-else>—</span>
            </template>
            <template
                v-for="kind in ['failed', 'skipped'] as const"
                #[`cell-${kind}`]="{ data }"
                :key="kind"
            >
                <RouterLink
                    v-if="(data as Row)[kind] > 0"
                    :to="outboundProblemsLink((data as Row).eventType, kind)"
                    class="outbound__problem"
                    >{{ (data as Row)[kind] }}</RouterLink
                >
                <span v-else>0</span>
            </template>
            <template #cell-lastProblem="{ data }">
                <span class="outbound__error">{{ (data as Row).lastProblem }}</span>
            </template>
        </ExchangeStaticTable>
        <p class="outbound__line">
            <span class="outbound__intro">{{ t('exchangeHealth.integration.heldTotal') }}</span>
            {{ heldTotal }}
        </p>
        <p class="outbound__line">
            <span class="outbound__intro">{{
                t('exchangeHealth.integration.rejectedOrders')
            }}</span>
            <RouterLink
                v-if="report.rejectedOrderCount > 0"
                :to="REJECTED_ORDERS_LINK"
                class="outbound__problem"
                >{{ report.rejectedOrderCount }}</RouterLink
            >
            <template v-else>0</template>
        </p>
    </template>
</template>

<style scoped>
.outbound__intro {
    color: var(--el-text-color-secondary);
    font-size: 13px;
    margin: 0;
}

.outbound__line {
    margin: 0;
    font-size: 14px;
}

.outbound__problem {
    color: var(--app-danger-fg);
    font-weight: 600;
}

.outbound__error {
    display: block;
    white-space: normal;
    overflow-wrap: anywhere;
    color: var(--app-danger-fg);
    font-size: 12px;
}
</style>
