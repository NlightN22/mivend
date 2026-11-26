<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvNotice, MvStatusBadge, type AdvancedDataTableColumn } from '@mivend/ui-kit';
import { fetchStreamHealth, type StreamHealthReport } from '../../api/exchangeHealth';
import { formatAge, isLagOverThreshold } from '../../api/exchangeHealthView';
import { inboxIssuesLink } from '../../api/exchangeLinks';
import { ageUnits } from '../../api/exchangeHealthLabels';
import ExchangeStaticTable from './ExchangeStaticTable.vue';

const { t } = useI18n();
const report = ref<StreamHealthReport | null>(null);
const failed = ref(false);

onMounted(async () => {
    try {
        report.value = await fetchStreamHealth();
    } catch (e) {
        console.warn('[exchange health] could not load the stream health:', e);
        failed.value = true;
    }
});

const col = (
    field: string,
    width: number,
    extra: Partial<AdvancedDataTableColumn> = {},
): AdvancedDataTableColumn => ({
    field,
    header: t(`exchangeHealth.columns.streams.${field}`),
    width,
    minWidth: Math.min(width, 90),
    filterConfig: { type: 'none' },
    ...extra,
});
const columns: AdvancedDataTableColumn[] = [
    col('stream', 150, { required: true, priority: 10, mobile: { primary: true } }),
    col('contract', 110, { priority: 5 }),
    col('consumed', 110, { priority: 5 }),
    col('lag', 120, { align: 'end', priority: 8 }),
    col('pending', 90, { align: 'end', priority: 7 }),
    col('processing', 110, { align: 'end', priority: 4 }),
    col('failed', 70, { align: 'end', priority: 9 }),
    col('noop24h', 110, { align: 'end', priority: 3 }),
    col('oldest', 90, { align: 'end', priority: 6 }),
];

const now = Date.now();
const rows = computed(() =>
    (report.value?.integrationStreamHealth.streams ?? []).map(s => ({
        id: s.stream,
        ...s,
        contract: s.inContract,
        consumed: s.consumed,
        lagValue: s.lag?.totalLag ?? null,
        oldest: formatAge(s.oldestPendingAt, now, ageUnits()),
    })),
);
type Row = (typeof rows.value)[number];

const failingStreams = computed(() => rows.value.filter(r => r.failed > 0));
const health = computed(() => report.value?.integrationStreamHealth);
const unit = computed(() => report.value?.variantUnitHealth);
const organization = computed(() => report.value?.variantOrganizationHealth);
const driftStatus = computed(() => health.value?.versionDrift.status ?? '');
const driftShown = computed(() => ['BEHIND', 'AHEAD', 'UNKNOWN'].includes(driftStatus.value));
</script>

<template>
    <MvNotice v-if="failed" variant="error">{{
        t('exchangeHealth.common.loadFailedMessage')
    }}</MvNotice>
    <template v-else-if="health">
        <p class="inbound__intro">
            {{ t('exchangeHealth.integration.inboundIntro', { version: health.contractVersion }) }}
        </p>
        <MvNotice
            v-if="organization"
            :variant="organization.withoutOrganization > 0 ? 'error' : 'info'"
        >
            {{ t('exchangeHealth.integration.variantOrganization', organization) }}
        </MvNotice>
        <MvNotice v-if="unit" :variant="unit.unitMissing > 0 ? 'error' : 'info'">
            {{ t('exchangeHealth.integration.variantUnit', unit) }}
        </MvNotice>
        <MvNotice v-if="driftShown" :variant="driftStatus === 'BEHIND' ? 'error' : 'info'">
            <strong>{{ t(`exchangeHealth.integration.versionDrift.${driftStatus}.title`) }}</strong>
            {{
                t(`exchangeHealth.integration.versionDrift.${driftStatus}.text`, {
                    installed: health.versionDrift.installed,
                    latest: health.versionDrift.latest ?? '?',
                })
            }}
        </MvNotice>
        <MvNotice v-if="failingStreams.length" variant="error">
            <strong>{{ t('exchangeHealth.integration.failedRows') }}</strong>
            {{ failingStreams.map(s => `${s.stream}: ${s.failed}`).join(', ') }}
        </MvNotice>
        <ExchangeStaticTable
            :columns="columns"
            :rows="rows"
            data-key="id"
            storage-key="exchange-streams"
            :hidden="['contract', 'processing', 'noop24h']"
            :empty-message="t('exchangeHealth.integration.noStreams')"
            :row-height-px="64"
        >
            <template #cell-stream="{ data }">
                <span class="inbound__stream">
                    <strong>{{ (data as Row).stream }}</strong>
                    <span class="inbound__muted">{{
                        (data as Row).topic ?? t('exchangeHealth.integration.noTopic')
                    }}</span>
                    <span v-if="(data as Row).drift" class="inbound__drift">{{
                        t(`exchangeHealth.integration.drift.${(data as Row).drift}`)
                    }}</span>
                </span>
            </template>
            <template #cell-contract="{ data }">
                <MvStatusBadge :variant="(data as Row).inContract ? 'success' : 'neutral'">{{
                    t(
                        (data as Row).inContract
                            ? 'exchangeHealth.common.yes'
                            : 'exchangeHealth.common.no',
                    )
                }}</MvStatusBadge>
            </template>
            <template #cell-consumed="{ data }">
                <MvStatusBadge
                    :variant="(data as Row).consumed ? 'success' : 'neutral'"
                    :title="(data as Row).ignoredReason ?? undefined"
                    >{{
                        (data as Row).consumed
                            ? t('exchangeHealth.common.yes')
                            : (data as Row).ignoredReason
                              ? t('exchangeHealth.integration.ignored')
                              : t('exchangeHealth.common.no')
                    }}</MvStatusBadge
                >
            </template>
            <template #cell-lag="{ data }">
                <span :class="{ inbound__over: isLagOverThreshold((data as Row).lagValue) }">{{
                    (data as Row).lag
                        ? ((data as Row).lagValue ?? t('exchangeHealth.common.unknown'))
                        : '—'
                }}</span>
            </template>
            <template #cell-failed="{ data }">
                <RouterLink
                    v-if="(data as Row).failed > 0"
                    :to="inboxIssuesLink((data as Row).stream, 'failed')"
                    class="inbound__failed"
                    >{{ (data as Row).failed }}</RouterLink
                >
                <span v-else>0</span>
            </template>
        </ExchangeStaticTable>
    </template>
</template>

<style scoped>
.inbound__intro,
.inbound__muted {
    color: var(--el-text-color-secondary);
    font-size: 13px;
    margin: 0;
}

.inbound__stream {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    max-width: 100%;
    overflow-wrap: anywhere;
    word-break: break-word;
}

.inbound__stream > * {
    max-width: 100%;
    white-space: normal;
    word-break: break-all;
}

.inbound__drift,
.inbound__failed,
.inbound__over {
    color: var(--app-danger-fg);
    font-size: 12px;
    font-weight: 600;
}
</style>
