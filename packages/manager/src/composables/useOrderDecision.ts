import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import { adminApi } from '../api/client';
import { OrderDecisionFactsDocument } from '../api/generated/graphql';
import { confirmOrder } from '../api/reservation';
import { useAuthStore } from '../stores/auth';
import type { OrderCheckFinding } from '../utils/orderCheckMessages';
import {
    FALLBACK_RESERVATION_DAYS,
    mayConfirm,
    mayReject,
    openFindings,
    parseReservationDays,
    type OrderDecisionFacts,
} from './orderDecisionRules';
import { useCancelOrderAsStaff } from './useCancelOrderAsStaff';
import { useOrderChecks } from './useOrderChecks';

export interface UseOrderDecision {
    loading: Ref<boolean>;
    loadError: Ref<string | null>;
    canConfirm: ComputedRef<boolean>;
    canReject: ComputedRef<boolean>;
    days: Ref<string>;
    confirming: Ref<boolean>;
    confirmError: Ref<string | null>;
    rejecting: Ref<boolean>;
    rejectError: Ref<string | null>;
    findings: ComputedRef<OrderCheckFinding[]>;
    confirm: () => Promise<boolean>;
    reject: () => Promise<boolean>;
}

// Confirm and reject for one order, shared by every list that opens an order quick panel.
export function useOrderDecision(
    orderId: () => string,
    onDecided: () => Promise<void> | void,
): UseOrderDecision {
    const authStore = useAuthStore();
    const facts = ref<OrderDecisionFacts | null>(null);
    const loading = ref(false);
    const loadError = ref<string | null>(null);
    const days = ref(String(FALLBACK_RESERVATION_DAYS));
    const confirming = ref(false);
    const confirmError = ref<string | null>(null);
    const idRef = computed(orderId);
    const checks = useOrderChecks(idRef);
    const canSeeChecks = computed(() => authStore.hasPermission('ReadCheckResults'));
    const cancel = useCancelOrderAsStaff(orderId, onDecided);

    async function load(): Promise<void> {
        loading.value = true;
        loadError.value = null;
        facts.value = null;
        try {
            const { visibleOrders } = await adminApi(OrderDecisionFactsDocument, {
                orderId: orderId(),
            });
            const order = visibleOrders.items[0];
            if (!order) throw new Error('Order not found');
            facts.value = {
                state: order.state,
                cancellable: order.cancellable,
                reservationState: order.customFields?.reservationState ?? null,
            };
            days.value = String(order.customFields?.reservationDays ?? FALLBACK_RESERVATION_DAYS);
            if (canSeeChecks.value) await checks.load();
        } catch (e) {
            console.error('[useOrderDecision]', e);
            loadError.value = 'Could not load the order actions.';
        } finally {
            loading.value = false;
        }
    }
    watch(idRef, load, { immediate: true });

    const canConfirm = computed(
        () => !!facts.value && mayConfirm(facts.value, authStore.hasPermission('ConfirmOrder')),
    );
    const canReject = computed(() => !!facts.value && mayReject(facts.value, cancel.allowed.value));

    async function confirm(): Promise<boolean> {
        const parsed = parseReservationDays(days.value);
        if (parsed === null) {
            confirmError.value = 'Reservation period must be a positive number of days';
            return false;
        }
        confirming.value = true;
        confirmError.value = null;
        try {
            await confirmOrder(orderId(), parsed);
            await onDecided();
            return true;
        } catch (e) {
            confirmError.value = e instanceof Error ? e.message : 'Could not confirm the order';
            return false;
        } finally {
            confirming.value = false;
        }
    }

    return {
        loading,
        loadError,
        canConfirm,
        canReject,
        days,
        confirming,
        confirmError,
        rejecting: cancel.cancelling,
        rejectError: cancel.error,
        findings: computed(() => openFindings(checks.findings.value)),
        confirm,
        reject: cancel.cancel,
    };
}
