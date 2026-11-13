<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvModal } from '@mivend/ui-kit';
import { formatDateTime } from '../../i18n/format';
import type { EntityVersionRow } from '../../api/history';
import { actionLabel, diffLines } from './historyFormat';

const props = defineProps<{
    row: EntityVersionRow;
    objectLabel: string;
    changedBy: string;
}>();
defineEmits<{ close: [] }>();

const { t } = useI18n();
const lines = computed(() => diffLines(props.row));
</script>

<template>
    <MvModal :title="t('changeJournal.history.modal.title')" @close="$emit('close')">
        <div class="history-detail">
            <dl class="history-detail__meta">
                <dt>{{ t('changeJournal.history.modal.when') }}</dt>
                <dd>{{ formatDateTime(row.createdAt) }}</dd>
                <dt>{{ t('changeJournal.history.modal.action') }}</dt>
                <dd>{{ actionLabel(row.action) }}</dd>
                <dt>{{ t('changeJournal.history.modal.object') }}</dt>
                <dd>{{ objectLabel }}</dd>
                <dt>{{ t('changeJournal.history.modal.changedBy') }}</dt>
                <dd>{{ changedBy }}</dd>
            </dl>

            <table v-if="lines.length" class="history-detail__diff">
                <thead>
                    <tr>
                        <th>{{ t('changeJournal.history.modal.field') }}</th>
                        <th>{{ t('changeJournal.history.modal.from') }}</th>
                        <th>{{ t('changeJournal.history.modal.to') }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="line in lines" :key="line.field">
                        <td>{{ line.field }}</td>
                        <td>{{ line.from }}</td>
                        <td>{{ line.to }}</td>
                    </tr>
                </tbody>
            </table>
            <p v-else class="history-detail__note">
                {{ t('changeJournal.history.modal.noDiff') }}
            </p>

            <p v-if="row.comment" class="history-detail__note">
                {{ t('changeJournal.history.modal.comment', { text: row.comment }) }}
            </p>
        </div>
    </MvModal>
</template>

<style scoped>
.history-detail {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.history-detail__meta {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 12px;
    margin: 0;
    font-size: 13px;
}

.history-detail__meta dt {
    color: var(--el-text-color-secondary);
    font-weight: 700;
}

.history-detail__meta dd {
    margin: 0;
}

.history-detail__diff {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}

.history-detail__diff th {
    text-align: left;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--el-text-color-secondary);
    padding: 6px 8px;
    border-bottom: 1px solid var(--el-border-color);
}

.history-detail__diff td {
    padding: 8px;
    border-bottom: 1px solid var(--el-border-color);
    vertical-align: top;
}

.history-detail__note {
    margin: 0;
    font-size: 13px;
    color: var(--el-text-color-secondary);
}
</style>
