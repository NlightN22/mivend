<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { MvStatusBadge } from '@mivend/ui-kit';
import type { SubmittedApproval } from '../../api/dashboard';

defineProps<{ approvals: SubmittedApproval[] }>();
const router = useRouter();
const { t, te } = useI18n();

function typeLabel(requestType: string): string {
    const key = `dashboardParts.approvalStatus.requestType.${requestType}`;
    return te(key) ? t(key) : requestType;
}

function statusText(approval: SubmittedApproval): string {
    if (approval.status === 'pending') {
        return approval.currentStepRole
            ? t('dashboardParts.approvalStatus.waitingOn', { role: approval.currentStepRole })
            : t('dashboardParts.approvalStatus.pending');
    }
    return t(
        `dashboardParts.approvalStatus.${approval.status === 'approved' ? 'approved' : 'rejected'}`,
    );
}
</script>

<template>
    <ul class="approval-list">
        <li v-if="!approvals.length" class="approval-list__empty">
            {{ t('dashboardParts.approvalStatus.empty') }}
        </li>
        <li
            v-for="approval in approvals"
            :key="approval.id"
            class="approval-list__item"
            @click="router.push(`/approvals/${approval.id}`)"
        >
            <span class="approval-list__title"
                >{{ typeLabel(approval.requestType) }} #{{ approval.id }}</span
            >
            <MvStatusBadge
                :variant="
                    approval.status === 'approved'
                        ? 'success'
                        : approval.status === 'rejected'
                          ? 'danger'
                          : 'info'
                "
            >
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
    border: 1px solid var(--el-border-color-light);
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
}

.approval-list__item:hover {
    background: var(--el-fill-color-light);
    border-color: var(--el-border-color);
}

.approval-list__title {
    color: var(--el-text-color-primary);
}

.approval-list__empty {
    color: var(--el-text-color-secondary);
    font-size: 13px;
    padding: 10px 12px;
}
</style>
