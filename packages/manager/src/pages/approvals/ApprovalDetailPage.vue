<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvPanel, MvNotice } from '@mivend/ui-kit';
import { useApprovalDetail } from '../../composables/useApprovalDetail';
import ApprovalHeader from '../../components/approvals/ApprovalHeader.vue';
import ApprovalTimeline from '../../components/approvals/ApprovalTimeline.vue';
import RequestDetailsCard from '../../components/approvals/RequestDetailsCard.vue';
import DecisionActions from '../../components/approvals/DecisionActions.vue';
import { buildTimeline } from '../../components/approvals/approvalTimeline';
import { managerName } from '../../components/approvals/approvalsListRows';

const { t } = useI18n();
const d = useApprovalDetail();
const timeline = computed(() =>
    d.request.value ? buildTimeline(d.request.value, d.managers.value) : [],
);
</script>

<template>
    <div v-if="d.notFound.value" class="approval-detail__not-found">
        <h1>{{ t('approvals.notFound.title') }}</h1>
        <RouterLink to="/approvals">{{ t('approvals.notFound.back') }}</RouterLink>
    </div>

    <div v-else-if="d.request.value" class="approval-detail">
        <ApprovalHeader
            :request="d.request.value"
            :requested-by="
                managerName(d.managers.value, d.request.value.requestedByAdministratorId)
            "
            :subject="d.subject.value"
        />

        <MvNotice v-if="d.error.value" variant="error">{{ d.error.value }}</MvNotice>

        <div class="approval-detail__grid">
            <div class="approval-detail__main">
                <MvPanel :title="t('approvals.panels.details')">
                    <RequestDetailsCard
                        :request="d.request.value"
                        :order-reference="d.orderReference.value"
                        :counterparty-reference="d.counterpartyReference.value"
                    />
                </MvPanel>

                <MvPanel
                    v-if="d.request.value.status === 'pending'"
                    :title="t('approvals.panels.decision')"
                >
                    <DecisionActions
                        :escalates-to="d.request.value.escalatesTo"
                        :managers="d.managers.value"
                        :can-approve="d.request.value.viewerCanApprove"
                        :can-reject="d.request.value.viewerCanReject"
                        :can-escalate="d.isRequester.value"
                        :disabled-reason="d.disabledReason.value"
                        :busy="d.submitting.value"
                        @approve="comment => d.decide('approved', comment)"
                        @reject="comment => d.decide('rejected', comment)"
                        @escalate="d.escalate"
                    />
                </MvPanel>
            </div>

            <MvPanel :title="t('approvals.panels.timeline')" class="approval-detail__timeline">
                <ApprovalTimeline :items="timeline" />
            </MvPanel>
        </div>
    </div>
</template>

<style scoped>
.approval-detail {
    display: flex;
    flex-direction: column;
    gap: 18px;
}

.approval-detail__grid {
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) minmax(280px, 1fr);
    gap: 18px;
    align-items: start;
}

.approval-detail__main {
    display: flex;
    flex-direction: column;
    gap: 18px;
}

.approval-detail__not-found {
    padding: 60px 0;
    text-align: center;
    color: var(--app-text-grey);
}

@media (max-width: 900px) {
    .approval-detail__grid {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
