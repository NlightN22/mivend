<script setup lang="ts">
import { useRouter } from 'vue-router';
import { MvStatusBadge } from '@mivend/ui-kit';
import type { SubmittedApproval } from '../../api/dashboard';

const REQUEST_TYPE_LABEL: Record<string, string> = {
    priceAdjustmentApproval: 'Price adjustment request',
    discountGrantApproval: 'Discount request',
    creditTermApproval: 'Payment term request',
};

defineProps<{ approvals: SubmittedApproval[] }>();
const router = useRouter();

function typeLabel(requestType: string): string {
    return REQUEST_TYPE_LABEL[requestType] ?? requestType;
}

function statusText(approval: SubmittedApproval): string {
    if (approval.status === 'pending') {
        return approval.currentStepRole ? `Waiting on ${approval.currentStepRole}` : 'Pending';
    }
    return approval.status === 'approved' ? 'Approved' : 'Rejected';
}
</script>

<template>
    <ul class="approval-list">
        <li v-if="!approvals.length" class="approval-list__empty">No submitted requests yet</li>
        <li
            v-for="approval in approvals"
            :key="approval.id"
            class="approval-list__item"
            @click="router.push(`/approvals/${approval.id}`)"
        >
            <span class="approval-list__title">{{ typeLabel(approval.requestType) }} #{{ approval.id }}</span>
            <MvStatusBadge :variant="approval.status === 'approved' ? 'success' : approval.status === 'rejected' ? 'danger' : 'info'">
                {{ statusText(approval) }}
            </MvStatusBadge>
        </li>
    </ul>
</template>

<style scoped>
.approval-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.approval-list__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
}

.approval-list__item:hover {
    background: #fafaff;
    border-color: #c7d2fe;
}

.approval-list__title {
    color: #111827;
}

.approval-list__empty {
    color: #6b7280;
    font-size: 13px;
    padding: 10px 12px;
}
</style>
