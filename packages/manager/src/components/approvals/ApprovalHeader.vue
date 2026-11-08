<script setup lang="ts">
import { computed } from 'vue';
import { MvStatusBadge, MvDateTimeCell } from '@mivend/ui-kit';
import { REQUEST_TYPE_LABEL, type ApprovalRequestDetail } from '../../api/approvals';
import { APPROVAL_STATUS_LABEL } from './approvalsColumns';
import { STATUS_VARIANT } from './approvalsListRows';

export interface SubjectLink {
    label: string;
    to: string | null;
}

const props = defineProps<{
    request: ApprovalRequestDetail;
    requestedBy: string;
    subject: SubjectLink | null;
}>();

const escalated = computed(
    () =>
        props.request.status === 'pending' &&
        props.request.steps.some(
            s => s.stepIndex === props.request.currentStepIndex && s.wasEscalated,
        ),
);
</script>

<template>
    <div class="approval-header">
        <div class="approval-header__breadcrumb">
            <RouterLink to="/approvals">Approvals</RouterLink> / {{ request.id }}
        </div>
        <h1 class="approval-header__title">
            Request {{ request.id }}
            <MvStatusBadge variant="neutral">{{
                REQUEST_TYPE_LABEL[request.requestType] ?? request.requestType
            }}</MvStatusBadge>
            <MvStatusBadge :variant="STATUS_VARIANT[request.status] ?? 'neutral'">{{
                APPROVAL_STATUS_LABEL[request.status] ?? request.status
            }}</MvStatusBadge>
            <MvStatusBadge v-if="escalated" variant="warning">Escalated</MvStatusBadge>
        </h1>
        <p class="approval-header__meta">
            <span>Requested by {{ requestedBy }}</span>
            <MvDateTimeCell :value="request.createdAt" />
            <template v-if="subject">
                <span aria-hidden="true">·</span>
                <RouterLink v-if="subject.to" :to="subject.to">{{ subject.label }}</RouterLink>
                <span v-else>{{ subject.label }}</span>
            </template>
        </p>
    </div>
</template>

<style scoped>
.approval-header__breadcrumb {
    color: var(--app-text-grey);
    font-size: 13px;
    margin-bottom: 6px;
}

.approval-header__breadcrumb a,
.approval-header__meta a {
    color: inherit;
}

.approval-header__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
}

.approval-header__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 6px 0 0;
    color: var(--app-text-grey);
    font-size: 14px;
}

@media (max-width: 800px) {
    .approval-header__title {
        font-size: 22px;
    }
}
</style>
