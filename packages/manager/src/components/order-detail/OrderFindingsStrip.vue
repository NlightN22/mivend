<script setup lang="ts">
import { IconAlertTriangle, IconCircleCheck, IconSend } from '@tabler/icons-vue';
import type { FindingsSummary } from '../../utils/orderFindingsSummary';

defineProps<{ summary: FindingsSummary }>();
</script>

<template>
    <div class="findings-strip" role="status">
        <span class="findings-strip__item">
            <IconAlertTriangle :size="18" class="findings-strip__icon--warn" />
            Findings: <strong>{{ summary.findings }}</strong>
            <span v-if="summary.holding" class="findings-strip__sub">
                ({{ summary.holding }} hold confirmation)
            </span>
        </span>
        <span class="findings-strip__item">
            <IconSend :size="18" class="findings-strip__icon--info" />
            Awaiting approval: <strong>{{ summary.awaitingApproval }}</strong>
        </span>
        <span class="findings-strip__item">
            <IconCircleCheck :size="18" class="findings-strip__icon--ok" />
            Handled: <strong>{{ summary.handled }}</strong>
        </span>
    </div>
</template>

<style scoped>
.findings-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 24px;
    padding: 12px 16px;
    border: 1px solid var(--el-border-color);
    border-radius: var(--app-radius-md, 12px);
    background: var(--app-row-head);
    font-size: 13px;
}

.findings-strip__item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.findings-strip__sub {
    color: var(--app-text-grey);
}

.findings-strip__icon--warn {
    color: var(--app-warn-fg);
}

.findings-strip__icon--info {
    color: var(--app-info-fg);
}

.findings-strip__icon--ok {
    color: var(--app-ok-fg);
}
</style>
