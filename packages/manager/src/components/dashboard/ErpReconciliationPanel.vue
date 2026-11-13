<script setup lang="ts">
import { formatDateTime } from '../../i18n/format';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvButton, MvStatusBadge } from '@mivend/ui-kit';
import type { NotificationItem } from '@mivend/ui-kit';
import { runErpReconciliation } from '../../api/integration-health';

const { t } = useI18n();

defineProps<{ notifications: NotificationItem[] }>();
const emit = defineEmits<{ refresh: [] }>();

const running = ref(false);
const runError = ref<string | null>(null);
const lastRunSummary = ref<string | null>(null);

async function handleRunNow(): Promise<void> {
    running.value = true;
    runError.value = null;
    try {
        const result = await runErpReconciliation();
        const counts = { checked: result.checked, found: result.issuesFound };
        lastRunSummary.value = result.skipped.length
            ? t('settingsPanels.erpReconciliation.summarySkipped', {
                  ...counts,
                  skipped: result.skipped.join(', '),
              })
            : t('settingsPanels.erpReconciliation.summary', counts);
        emit('refresh');
    } catch (e) {
        runError.value =
            e instanceof Error ? e.message : t('settingsPanels.erpReconciliation.runFailed');
    } finally {
        running.value = false;
    }
}
</script>

<template>
    <div class="erp-reconciliation">
        <div class="erp-reconciliation__actions">
            <MvButton size="sm" variant="secondary" :loading="running" @click="handleRunNow">
                {{ t('settingsPanels.erpReconciliation.run') }}
            </MvButton>
            <span v-if="lastRunSummary" class="erp-reconciliation__summary">{{
                lastRunSummary
            }}</span>
            <span v-if="runError" class="erp-reconciliation__error">{{ runError }}</span>
        </div>

        <ul class="erp-reconciliation__list">
            <li v-if="!notifications.length" class="erp-reconciliation__empty">
                {{ t('settingsPanels.erpReconciliation.empty') }}
            </li>
            <li
                v-for="notification in notifications.slice(0, 5)"
                :key="notification.id"
                class="erp-reconciliation__item"
            >
                <div class="erp-reconciliation__main">
                    <span class="erp-reconciliation__title">{{ notification.title }}</span>
                    <span class="erp-reconciliation__detail">
                        {{
                            t('settingsPanels.erpReconciliation.detected', {
                                message: notification.message,
                                date: formatDateTime(notification.createdAt),
                            })
                        }}
                    </span>
                </div>
                <MvStatusBadge variant="warning">{{ notification.status }}</MvStatusBadge>
            </li>
        </ul>
    </div>
</template>

<style scoped>
.erp-reconciliation {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.erp-reconciliation__actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}

.erp-reconciliation__summary {
    color: var(--el-text-color-secondary);
    font-size: 12px;
}

.erp-reconciliation__error {
    color: var(--app-danger-fg);
    font-size: 12px;
}

.erp-reconciliation__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.erp-reconciliation__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid var(--el-border-color-light);
    border-radius: 6px;
    font-size: 13px;
}

.erp-reconciliation__main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.erp-reconciliation__title {
    color: var(--el-text-color-primary);
    font-weight: 600;
    text-transform: capitalize;
}

.erp-reconciliation__detail {
    color: var(--el-text-color-secondary);
    font-size: 12px;
}

.erp-reconciliation__empty {
    color: var(--el-text-color-secondary);
    font-size: 13px;
    padding: 10px 12px;
}
</style>
