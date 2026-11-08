import { computed, onMounted, ref, watch, type ComputedRef, type Ref } from 'vue';
import { useRoute } from 'vue-router';
import {
    decideApprovalRequest,
    escalateApprovalRequest,
    fetchApprovalDetail,
    fetchCounterpartyReferencesByErpId,
    fetchOrderReferences,
    type ApprovalRequestDetail,
    type CounterpartyReference,
    type OrderReference,
} from '../api/approvals';
import { fetchManagerOptions, type ManagerOption } from '../api/orders';
import { decisionDisabledReason } from '../components/approvals/approvalDecision';
import { parsePayload } from '../components/approvals/approvalsListRows';
import type { SubjectLink } from '../components/approvals/ApprovalHeader.vue';
import { useAuthStore } from '../stores/auth';

export interface ApprovalDetailState {
    request: Ref<ApprovalRequestDetail | null>;
    managers: Ref<ManagerOption[]>;
    orderReference: Ref<OrderReference | null>;
    counterpartyReference: Ref<CounterpartyReference | null>;
    notFound: Ref<boolean>;
    error: Ref<string>;
    submitting: Ref<boolean>;
    isRequester: ComputedRef<boolean>;
    subject: ComputedRef<SubjectLink | null>;
    disabledReason: ComputedRef<string>;
    decide: (decision: 'approved' | 'rejected', comment: string) => Promise<void>;
    escalate: (administratorId: string) => Promise<void>;
}

export function useApprovalDetail(): ApprovalDetailState {
    const route = useRoute();
    const auth = useAuthStore();
    const request = ref<ApprovalRequestDetail | null>(null);
    const managers = ref<ManagerOption[]>([]);
    const orderReference = ref<OrderReference | null>(null);
    const counterpartyReference = ref<CounterpartyReference | null>(null);
    const notFound = ref(false);
    const error = ref('');
    const submitting = ref(false);

    async function loadReferences(detail: ApprovalRequestDetail): Promise<void> {
        orderReference.value = null;
        counterpartyReference.value = null;
        const p = parsePayload(detail.payload);
        if (detail.requestType === 'priceAdjustmentApproval' && p.orderId) {
            const refs = await fetchOrderReferences([String(p.orderId)]);
            orderReference.value = refs.get(String(p.orderId)) ?? null;
        } else if (detail.requestType.startsWith('creditTermApproval') && p.counterpartyErpId) {
            const refs = await fetchCounterpartyReferencesByErpId([String(p.counterpartyErpId)]);
            counterpartyReference.value = refs.get(String(p.counterpartyErpId)) ?? null;
        }
    }

    async function load(): Promise<void> {
        notFound.value = false;
        const [detail, people] = await Promise.all([
            fetchApprovalDetail(String(route.params.id)),
            managers.value.length ? Promise.resolve(managers.value) : fetchManagerOptions(),
        ]);
        managers.value = people;
        if (!detail) {
            request.value = null;
            notFound.value = true;
            return;
        }
        request.value = detail;
        await loadReferences(detail).catch(() => undefined);
    }

    async function act(run: () => Promise<void>, fallback: string): Promise<void> {
        submitting.value = true;
        error.value = '';
        try {
            await run();
            await load();
        } catch (e) {
            error.value = e instanceof Error ? e.message : fallback;
        } finally {
            submitting.value = false;
        }
    }

    const isRequester = computed(
        () =>
            !!auth.administrator?.id &&
            auth.administrator.id === request.value?.requestedByAdministratorId,
    );

    const subject = computed<SubjectLink | null>(() => {
        const order = orderReference.value;
        if (order)
            return {
                label: `Order ${order.code} · ${order.customerName}`,
                to: `/orders/${order.code}`,
            };
        const cp = counterpartyReference.value;
        if (cp) return { label: cp.shortName, to: `/customers/${cp.id}` };
        return null;
    });

    const disabledReason = computed(() =>
        request.value ? decisionDisabledReason(request.value) : '',
    );

    watch(
        () => route.params.id,
        () => void load(),
    );
    onMounted(load);

    return {
        request,
        managers,
        orderReference,
        counterpartyReference,
        notFound,
        error,
        submitting,
        isRequester,
        subject,
        disabledReason,
        decide: (decision, comment) =>
            act(async () => {
                const r = request.value;
                if (r)
                    await decideApprovalRequest(
                        r.requestType,
                        r.id,
                        decision,
                        comment || undefined,
                    );
            }, 'Could not record the decision'),
        escalate: administratorId =>
            act(async () => {
                if (request.value) await escalateApprovalRequest(request.value.id, administratorId);
            }, 'Could not escalate the request'),
    };
}
