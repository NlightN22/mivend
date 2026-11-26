<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvNotice, MvStatusBadge, type AdvancedDataTableColumn } from '@mivend/ui-kit';
import { fetchExchangeSnapshot, type ExchangeSnapshot } from '../../api/exchangeHealth';
import {
    dash,
    exchangeStateVariant,
    formatAge,
    formatAgeSeconds,
    unknownReasonKey,
} from '../../api/exchangeHealthView';
import { ageUnits, stateLabel } from '../../api/exchangeHealthLabels';
import ExchangeStaticTable from './ExchangeStaticTable.vue';

const { t } = useI18n();
const report = ref<ExchangeSnapshot | null>(null);
const failed = ref(false);

onMounted(async () => {
    try {
        report.value = await fetchExchangeSnapshot();
    } catch (e) {
        console.warn('[exchange health] could not load the exchange health:', e);
        failed.value = true;
    }
});

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
const channelColumns = [
    col('channels', 'name', 180, { required: true, priority: 10, mobile: { primary: true } }),
    col('channels', 'status', 120, { priority: 9, mobile: { badge: true } }),
    col('channels', 'lastActivity', 110, { priority: 6 }),
    col('channels', 'pending', 100, { align: 'end', priority: 7 }),
    col('channels', 'oldest', 100, { align: 'end', priority: 6 }),
    col('channels', 'failed24h', 110, { align: 'end', priority: 8 }),
];
const publishColumns = [
    col('publish', 'aggregateType', 140, {
        required: true,
        priority: 10,
        mobile: { primary: true },
    }),
    col('publish', 'status', 120, { priority: 9, mobile: { badge: true } }),
    col('publish', 'pending', 100, { align: 'end', priority: 7 }),
    col('publish', 'oldest', 100, { align: 'end', priority: 6 }),
    col('publish', 'deadLettered24h', 120, { align: 'end', priority: 8 }),
    col('publish', 'mappingErrors24h', 150, { priority: 5 }),
    col('publish', 'lastPublished', 130, { priority: 4 }),
];

const now = Date.now();
const ago = (iso: string | null | undefined): string =>
    iso ? `${formatAge(iso, now, ageUnits())} ${t('exchangeHealth.common.ago')}` : '—';

const health = computed(() => report.value?.health ?? null);
const channelRows = computed(() =>
    (health.value?.channels ?? []).flatMap(ch => [
        {
            id: ch.channel,
            name: ch.channel,
            status: ch.status,
            lastActivity: ago(ch.lastActivityAt),
            pending: '',
            oldest: '',
            failed24h: '',
            isChannel: true,
        },
        ...ch.streams.map(s => ({
            id: `${ch.channel}/${s.stream}`,
            name: s.stream,
            status: s.status,
            lastActivity: ago(s.lastActivityAt),
            pending: dash(s.pending),
            oldest: formatAgeSeconds(s.oldestAgeSeconds, ageUnits()),
            failed24h: dash(s.failedLast24h),
            isChannel: false,
        })),
    ]),
);
const publishRows = computed(() =>
    (health.value?.publish?.aggregates ?? []).map(a => ({
        id: a.aggregateType,
        aggregateType: a.aggregateType,
        status: a.status,
        pending: dash(a.pending),
        oldest: formatAgeSeconds(a.oldestPendingAgeSeconds, ageUnits()),
        deadLettered24h: dash(a.deadLetteredLast24h),
        mappingErrors24h:
            dash(a.mappingErrorsLast24h) +
            (a.mappingErrorCodes.length ? ` · ${a.mappingErrorCodes.join(', ')}` : ''),
        lastPublished: ago(a.lastPublishedAt),
    })),
);
type Row = { [key: string]: unknown; status: string; isChannel?: boolean };
</script>

<template>
    <MvNotice v-if="failed" variant="error">{{
        t('exchangeHealth.common.loadFailedMessage')
    }}</MvNotice>
    <template v-else-if="report">
        <p class="exchange__line">
            <span class="exchange__muted">{{ t('exchangeHealth.integration.exchangeIntro') }}</span>
        </p>
        <p class="exchange__line">
            <MvStatusBadge :variant="exchangeStateVariant(report.state)">{{
                stateLabel(report.state)
            }}</MvStatusBadge>
            <span v-if="report.polledAt" class="exchange__muted">{{
                t('exchangeHealth.integration.readAgo', {
                    age: formatAge(report.polledAt, now, ageUnits()),
                })
            }}</span>
        </p>
        <MvNotice v-if="report.state === 'UNKNOWN'" variant="error">
            <strong>{{
                t('exchangeHealth.integration.unknownTitle', { reason: report.reason ?? '—' })
            }}</strong>
            {{ t(`exchangeHealth.integration.unknownReasons.${unknownReasonKey(report.reason)}`) }}
        </MvNotice>
        <template v-if="health">
            <ExchangeStaticTable
                :columns="channelColumns"
                :rows="channelRows"
                data-key="id"
                storage-key="exchange-channels"
                :empty-message="t('exchangeHealth.integration.noChannels')"
            >
                <template #cell-name="{ data }">
                    <strong v-if="(data as Row).isChannel">{{ (data as Row).name }}</strong>
                    <span v-else class="exchange__indent">{{ (data as Row).name }}</span>
                </template>
                <template #cell-status="{ data }">
                    <MvStatusBadge :variant="exchangeStateVariant(String((data as Row).status))">{{
                        stateLabel(String((data as Row).status))
                    }}</MvStatusBadge>
                </template>
            </ExchangeStaticTable>
            <template v-if="health.publish">
                <p class="exchange__line">
                    <span class="exchange__muted">{{
                        t('exchangeHealth.integration.publishTitle')
                    }}</span>
                    <MvStatusBadge :variant="exchangeStateVariant(health.publish.status)">{{
                        stateLabel(health.publish.status)
                    }}</MvStatusBadge>
                </p>
                <ExchangeStaticTable
                    v-if="publishRows.length"
                    :columns="publishColumns"
                    :rows="publishRows"
                    data-key="id"
                    storage-key="exchange-publish"
                    :hidden="['lastPublished']"
                    :empty-message="t('exchangeHealth.integration.noChannels')"
                >
                    <template #cell-status="{ data }">
                        <MvStatusBadge
                            :variant="exchangeStateVariant(String((data as Row).status))"
                            >{{ stateLabel(String((data as Row).status)) }}</MvStatusBadge
                        >
                    </template>
                </ExchangeStaticTable>
            </template>
            <div v-if="health.mappingErrors.length" class="exchange__errors">
                <span class="exchange__muted">{{
                    t('exchangeHealth.integration.mappingErrors')
                }}</span>
                <p
                    v-for="e in health.mappingErrors"
                    :key="`${e.kind}-${e.code}-${e.message}`"
                    class="exchange__line"
                >
                    {{ e.kind }} · {{ e.code }} · {{ e.message
                    }}{{ e.occurrences !== null ? ` (×${e.occurrences})` : '' }}
                </p>
            </div>
            <p class="exchange__line">
                <span class="exchange__muted">{{
                    t('exchangeHealth.integration.failures24h')
                }}</span>
                {{
                    t('exchangeHealth.integration.failuresLine', {
                        inbox: dash(health.failures.inboxFailedLast24h),
                        outbox: dash(health.failures.outboxFailedLast24h),
                        rejected: dash(health.failures.outboundRejectedLast24h),
                    })
                }}
            </p>
            <p class="exchange__line">
                <span class="exchange__muted">{{ t('exchangeHealth.integration.resync') }}</span>
                {{
                    t('exchangeHealth.integration.resyncLine', {
                        pending: dash(health.resync.pending),
                        delivered: dash(health.resync.delivered),
                        acknowledged: dash(health.resync.acknowledgedLast24h),
                        rejected: dash(health.resync.rejectedLast24h),
                    })
                }}
            </p>
        </template>
    </template>
</template>

<style scoped>
.exchange__line {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-size: 14px;
}

.exchange__muted {
    color: var(--el-text-color-secondary);
    font-size: 13px;
}

.exchange__indent {
    padding-left: 16px;
}

.exchange__errors {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
</style>
