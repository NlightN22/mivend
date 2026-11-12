<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
    MvBatchResultTable,
    MvButton,
    MvNotice,
    MvProgressBar,
    MvStatusBadge,
} from '@mivend/ui-kit';
import {
    ACTIVE_STATUSES,
    BATCH_STATUS_VARIANT,
    ITEMS_PAGE_SIZE,
    batchStatusLabel,
    fetchAllBulkBatchItems,
    type BulkBatch,
} from '../../api/bulkOperations';
import { batchReportCsv, downloadCsv, reasonLabel } from '../../api/bulkOperationsReport';
import { useBulkBatchItems } from '../../composables/useBulkBatchItems';
import { progressOf, refreshKeyOf, toResultRows } from './bulkRows';

// Run step: progress while the batch runs, then the per-record result, its report and undo.
const props = defineProps<{ batch: BulkBatch; busy: boolean; error: string }>();
const emit = defineEmits<{ undo: [] }>();

const { t } = useI18n();
const uuid = computed(() => props.batch.uuid);
const list = useBulkBatchItems(
    uuid,
    computed(() => refreshKeyOf(props.batch)),
);
const active = computed(() => ACTIVE_STATUSES.includes(props.batch.status));
const exporting = ref(false);
const exportError = ref('');

const counters = computed(() => ({
    total: props.batch.totalCount,
    applied: props.batch.appliedCount,
    skipped: props.batch.skippedCount,
    failed: props.batch.failedCount,
}));

async function downloadReport(): Promise<void> {
    exporting.value = true;
    exportError.value = '';
    try {
        const items = await fetchAllBulkBatchItems(props.batch.uuid);
        downloadCsv(`bulk-batch-${props.batch.number}.csv`, batchReportCsv(props.batch, items));
    } catch (e) {
        exportError.value = e instanceof Error ? e.message : t('bulkOperations.run.reportFailed');
    } finally {
        exporting.value = false;
    }
}
</script>

<template>
    <div class="bulk-run-step">
        <div class="bulk-run-step__head">
            <span class="bulk-run-step__title">{{ t('bulkOperations.run.batch', { number: batch.number }) }}</span>
            <MvStatusBadge :variant="BATCH_STATUS_VARIANT[batch.status] ?? 'neutral'">
                {{ batchStatusLabel(batch.status) }}
            </MvStatusBadge>
            <span class="bulk-run-step__actions">
                <MvButton
                    size="sm"
                    variant="secondary"
                    :loading="exporting"
                    :disabled="active"
                    @click="downloadReport"
                >
                    {{ t('bulkOperations.run.downloadReport') }}
                </MvButton>
                <MvButton
                    v-if="batch.undoable && ['done', 'partial', 'stopped'].includes(batch.status)"
                    size="sm"
                    variant="danger"
                    :loading="busy"
                    @click="emit('undo')"
                >
                    {{ t('bulkOperations.run.undo') }}
                </MvButton>
            </span>
        </div>

        <MvProgressBar
            v-if="active"
            :value="progressOf(batch)"
            :max="batch.totalCount"
            :label="
                t('bulkOperations.run.progress', {
                    done: progressOf(batch),
                    total: batch.totalCount,
                })
            "
        />
        <MvNotice
            v-if="batch.errorMessage"
            :variant="batch.status === 'stopped' ? 'warning' : 'error'"
            >{{ batch.errorMessage }}</MvNotice
        >
        <MvNotice v-if="batch.undoOfUuid" variant="info">
            {{ t('bulkOperations.run.undoOf') }}
            <RouterLink :to="{ query: { batch: batch.undoOfUuid } }">{{
                t('bulkOperations.run.earlierBatch')
            }}</RouterLink
            >.
        </MvNotice>
        <MvNotice v-if="error || exportError || list.error.value" variant="error">
            {{ error || exportError || list.error.value }}
        </MvNotice>

        <MvBatchResultTable
            mode="result"
            :record-label="t('bulkOperations.review.recordLabel')"
            :rows="toResultRows(list.items.value)"
            :counters="counters"
            :page="list.page.value"
            :page-size="ITEMS_PAGE_SIZE"
            :total-rows="list.totalItems.value"
            :active-outcome="list.outcome.value"
            :loading="list.loading.value"
            :reason-label="reasonLabel"
            @update:page="list.page.value = $event"
            @update:active-outcome="list.outcome.value = $event"
        />
    </div>
</template>

<style scoped>
.bulk-run-step {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
}

.bulk-run-step__head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
}

.bulk-run-step__title {
    font-size: 18px;
    font-weight: 700;
}

.bulk-run-step__actions {
    display: flex;
    gap: 8px;
    margin-left: auto;
}
</style>
