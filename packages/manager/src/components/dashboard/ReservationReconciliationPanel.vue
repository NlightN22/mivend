<script setup lang="ts">
import { MvStatusBadge } from '@mivend/ui-kit';
import type { ReservationReconciliationIssue } from '../../api/integration-health';

defineProps<{ issues: ReservationReconciliationIssue[] }>();
</script>

<template>
    <ul class="reservation-reconciliation">
        <li v-if="!issues.length" class="reservation-reconciliation__empty">No open reservation issues</li>
        <li v-for="issue in issues.slice(0, 5)" :key="issue.id" class="reservation-reconciliation__item">
            <div class="reservation-reconciliation__main">
                <span class="reservation-reconciliation__title">Order #{{ issue.orderId }}</span>
                <span class="reservation-reconciliation__detail">
                    local {{ issue.localQuantity ?? '—' }} / ERP {{ issue.erpQuantity ?? '—' }}
                </span>
            </div>
            <MvStatusBadge variant="warning">{{ issue.issueType }}</MvStatusBadge>
        </li>
    </ul>
</template>

<style scoped>
.reservation-reconciliation {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.reservation-reconciliation__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    font-size: 13px;
}

.reservation-reconciliation__main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.reservation-reconciliation__title {
    color: #111827;
    font-weight: 600;
}

.reservation-reconciliation__detail {
    color: #6b7280;
    font-size: 12px;
}

.reservation-reconciliation__empty {
    color: #6b7280;
    font-size: 13px;
    padding: 10px 12px;
}
</style>
