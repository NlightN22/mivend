<script setup lang="ts">
import { ref } from 'vue';
import { MvButton, MvStatusBadge } from '@mivend/ui-kit';
import {
    runErpReconciliation,
    type ErpReconciliationIssue,
} from '../../api/integration-health';

defineProps<{ issues: ErpReconciliationIssue[] }>();
const emit = defineEmits<{ refresh: [] }>();

const running = ref(false);
const runError = ref<string | null>(null);
const lastRunSummary = ref<string | null>(null);

async function handleRunNow(): Promise<void> {
    running.value = true;
    runError.value = null;
    try {
        const result = await runErpReconciliation();
        lastRunSummary.value = `Checked ${result.checked}, found ${result.issuesFound}${
            result.skipped.length ? ` (skipped: ${result.skipped.join(', ')})` : ''
        }`;
        emit('refresh');
    } catch (e) {
        runError.value = e instanceof Error ? e.message : 'Reconciliation run failed';
    } finally {
        running.value = false;
    }
}

</script>

<template>
    <div class="erp-reconciliation">
        <div class="erp-reconciliation__actions">
            <MvButton size="sm" variant="secondary" :loading="running" @click="handleRunNow">
                Run reconciliation now
            </MvButton>
            <span v-if="lastRunSummary" class="erp-reconciliation__summary">{{ lastRunSummary }}</span>
            <span v-if="runError" class="erp-reconciliation__error">{{ runError }}</span>
        </div>

        <ul class="erp-reconciliation__list">
            <li v-if="!issues.length" class="erp-reconciliation__empty">No open ERP discrepancies</li>
            <li v-for="issue in issues.slice(0, 5)" :key="issue.id" class="erp-reconciliation__item">
                <div class="erp-reconciliation__main">
                    <span class="erp-reconciliation__title">{{ issue.aggregateType }}</span>
                    <span class="erp-reconciliation__detail">
                        ours {{ issue.ourCount }} / theirs {{ issue.theirActiveCount }} · detected
                        {{ new Date(issue.detectedAt).toLocaleString() }} · via {{ issue.triggeredBy }}
                    </span>
                </div>
                <MvStatusBadge variant="warning">{{ issue.issueType }}</MvStatusBadge>
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
    color: #6b7280;
    font-size: 12px;
}

.erp-reconciliation__error {
    color: #b91c1c;
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
    border: 1px solid #e5e7eb;
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
    color: #111827;
    font-weight: 600;
    text-transform: capitalize;
}

.erp-reconciliation__detail {
    color: #6b7280;
    font-size: 12px;
}

.erp-reconciliation__empty {
    color: #6b7280;
    font-size: 13px;
    padding: 10px 12px;
}
</style>
