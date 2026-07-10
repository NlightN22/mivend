<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { MvPanel, MvStatusBadge, MvApprovalStepper, MvNotice } from '@mivend/ui-kit';
import type { ApprovalStepperItem } from '@mivend/ui-kit';
import {
    fetchApprovalDetail,
    decideApprovalRequest,
    escalateApprovalRequest,
    fetchOrderReferences,
    fetchCounterpartyReferencesByErpId,
    REQUEST_TYPE_LABEL,
    type ApprovalRequestDetail,
    type OrderReference,
    type CounterpartyReference,
} from '../../api/approvals';
import { fetchManagerOptions, type ManagerOption } from '../../api/orders';
import RequestDetailsCard from '../../components/approvals/RequestDetailsCard.vue';
import DecisionActions from '../../components/approvals/DecisionActions.vue';

const route = useRoute();

const request = ref<ApprovalRequestDetail | null>(null);
const managers = ref<ManagerOption[]>([]);
const orderReference = ref<OrderReference | null>(null);
const counterpartyReference = ref<CounterpartyReference | null>(null);
const loading = ref(true);
const notFound = ref(false);
const error = ref('');
const submitting = ref(false);

function managerName(id: string | null): string {
    if (!id) return '—';
    return managers.value.find(m => m.id === id)?.name ?? '—';
}

async function load(): Promise<void> {
    loading.value = true;
    notFound.value = false;
    try {
        const id = route.params.id as string;
        const [detail, managerOptions] = await Promise.all([
            fetchApprovalDetail(id),
            managers.value.length ? Promise.resolve(managers.value) : fetchManagerOptions(),
        ]);
        managers.value = managerOptions;
        if (!detail) {
            notFound.value = true;
            return;
        }
        request.value = detail;

        if (detail.requestType === 'priceAdjustmentApproval') {
            try {
                const payload = JSON.parse(detail.payload) as { orderId?: string };
                if (payload.orderId) {
                    const refs = await fetchOrderReferences([payload.orderId]);
                    orderReference.value = refs.get(payload.orderId) ?? null;
                }
            } catch {
                orderReference.value = null;
            }
        } else if (detail.requestType.startsWith('creditTermApproval')) {
            try {
                const payload = JSON.parse(detail.payload) as { counterpartyErpId?: string };
                const refs = await fetchCounterpartyReferencesByErpId();
                counterpartyReference.value = payload.counterpartyErpId
                    ? refs.get(payload.counterpartyErpId) ?? null
                    : null;
            } catch {
                counterpartyReference.value = null;
            }
        }
    } finally {
        loading.value = false;
    }
}

onMounted(load);

const stepperItems = computed<ApprovalStepperItem[]>(() => {
    if (!request.value) return [];
    const req = request.value;
    return req.stepRoles.map((role, index) => {
        const auditRow = req.steps.find(s => s.stepIndex === index);
        if (auditRow?.decision === 'approved') {
            return {
                label: role,
                state: 'done',
                meta: `Approved by ${managerName(auditRow.approverAdministratorId)}${
                    auditRow.decidedAt ? `, ${new Date(auditRow.decidedAt).toLocaleDateString('en-US')}` : ''
                }${auditRow.comment ? ` — ${auditRow.comment}` : ''}`,
            };
        }
        if (auditRow?.decision === 'rejected') {
            return {
                label: role,
                state: 'rejected',
                meta: `Rejected by ${managerName(auditRow.approverAdministratorId)}${
                    auditRow.decidedAt ? `, ${new Date(auditRow.decidedAt).toLocaleDateString('en-US')}` : ''
                }${auditRow.comment ? ` — ${auditRow.comment}` : ''}`,
            };
        }
        if (index === req.currentStepIndex && req.status === 'pending') {
            if (auditRow?.wasEscalated) {
                return {
                    label: role,
                    state: 'escalated',
                    meta: `Escalated to ${managerName(auditRow.escalatedToAdministratorId)} by ${managerName(
                        auditRow.escalatedByAdministratorId,
                    )}`,
                };
            }
            return { label: role, state: 'current', meta: 'Awaiting decision' };
        }
        return { label: role, state: 'pending' };
    });
});

const canAct = computed(() => request.value?.status === 'pending');

async function handleDecision(decision: 'approved' | 'rejected', comment: string): Promise<void> {
    if (!request.value) return;
    submitting.value = true;
    error.value = '';
    try {
        await decideApprovalRequest(request.value.requestType, request.value.id, decision, comment || undefined);
        await load();
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not record the decision';
    } finally {
        submitting.value = false;
    }
}

async function handleEscalate(administratorId: string): Promise<void> {
    if (!request.value) return;
    submitting.value = true;
    error.value = '';
    try {
        await escalateApprovalRequest(request.value.id, administratorId);
        await load();
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not escalate the request';
    } finally {
        submitting.value = false;
    }
}

function statusVariant(status: string): 'success' | 'danger' | 'warning' {
    if (status === 'approved') return 'success';
    if (status === 'rejected') return 'danger';
    return 'warning';
}
</script>

<template>
    <div v-if="notFound" class="approval-detail__not-found">
        <h1>Request not found</h1>
        <RouterLink to="/approvals">Back to approvals</RouterLink>
    </div>

    <div v-else-if="request" class="approval-detail">
        <div class="approval-detail__breadcrumb">
            <RouterLink to="/approvals">Approvals</RouterLink> / Request #{{ request.id }}
        </div>
        <h1 class="approval-detail__title">
            {{ REQUEST_TYPE_LABEL[request.requestType] ?? request.requestType }}
            <MvStatusBadge :variant="statusVariant(request.status)">{{ request.status }}</MvStatusBadge>
        </h1>

        <MvPanel>
            <MvApprovalStepper :steps="stepperItems" />
        </MvPanel>

        <MvPanel title="Request details">
            <RequestDetailsCard
                :request="request"
                :order-reference="orderReference"
                :counterparty-reference="counterpartyReference"
            />
        </MvPanel>

        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>

        <MvPanel v-if="canAct" title="Decision">
            <DecisionActions
                :escalates-to="request.escalatesTo"
                :managers="managers"
                @approve="comment => handleDecision('approved', comment)"
                @reject="comment => handleDecision('rejected', comment)"
                @escalate="handleEscalate"
            />
        </MvPanel>
        <MvPanel v-else title="Outcome">
            <p class="approval-detail__outcome">
                {{ request.status === 'approved' ? 'Approved' : 'Rejected' }}
                {{ request.decidedAt ? `on ${new Date(request.decidedAt).toLocaleDateString('en-US')}` : '' }}
            </p>
        </MvPanel>
    </div>
</template>

<style scoped>
.approval-detail {
    display: flex;
    flex-direction: column;
    gap: 18px;
    max-width: 900px;
}

.approval-detail__breadcrumb {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
}

.approval-detail__breadcrumb a {
    color: inherit;
    text-decoration: none;
}

.approval-detail__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
    display: flex;
    align-items: center;
    gap: 12px;
}

.approval-detail__outcome {
    margin: 0;
    font-size: 14px;
    color: var(--el-text-color-secondary, #6b7280);
}

.approval-detail__not-found {
    padding: 60px 0;
    text-align: center;
    color: var(--el-text-color-secondary, #6b7280);
}
</style>
