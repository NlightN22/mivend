<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvBatchResultTable, MvNotice } from '@mivend/ui-kit';
import { ITEMS_PAGE_SIZE, fetchBulkBatchItems, type BulkBatch } from '../../api/bulkOperations';
import { reasonLabel } from '../../api/bulkOperationsReport';
import { useBulkBatchItems } from '../../composables/useBulkBatchItems';
import { toReviewRows } from './bulkRows';

// Review step: the dry run of a draft batch. It is advisory; the run re-checks every record.
const props = defineProps<{ batch: BulkBatch }>();
const emit = defineEmits<{ counted: [willChange: number] }>();

const { t } = useI18n();
const uuid = computed(() => props.batch.uuid);
const list = useBulkBatchItems(uuid, uuid);
const counts = ref({ apply: 0, skip: 0 });

watch(
    uuid,
    async value => {
        const [apply, skip] = await Promise.all(
            ['apply', 'skip'].map(o => fetchBulkBatchItems(value, 1, o, 1)),
        );
        counts.value = { apply: apply.totalItems, skip: skip.totalItems };
        emit('counted', apply.totalItems);
    },
    { immediate: true },
);

const counters = computed(() => ({
    total: props.batch.totalCount,
    applied: counts.value.apply,
    skipped: counts.value.skip,
    failed: 0,
}));
</script>

<template>
    <div class="bulk-review-step">
        <MvNotice :variant="counts.apply ? 'info' : 'warning'">
            <template v-if="counts.apply">
                {{
                    t('bulkOperations.review.summary', {
                        apply: counts.apply,
                        total: batch.totalCount,
                        skip: counts.skip,
                    })
                }}
            </template>
            <template v-else>{{ t('bulkOperations.review.nothing') }}</template>
        </MvNotice>
        <MvNotice v-if="list.error.value" variant="error">{{ list.error.value }}</MvNotice>
        <MvBatchResultTable
            mode="review"
            :record-label="t('bulkOperations.review.recordLabel')"
            :rows="toReviewRows(list.items.value)"
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
.bulk-review-step {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
}
</style>
