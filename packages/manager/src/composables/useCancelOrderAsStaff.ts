import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { adminApi } from '../api/client';
import { CancelOrderAsStaffDocument } from '../api/generated/graphql';
import { useAuthStore } from '../stores/auth';

const NOT_CANCELLABLE_ERP = ['CANCELLED', 'PICKING', 'SHIPPING', 'DELIVERING', 'DELIVERED'];

export function isCancellable(state: string, erpStatus: string | null): boolean {
    return state !== 'Cancelled' && !NOT_CANCELLABLE_ERP.includes(erpStatus ?? '');
}

export const REFUSAL_TEXT: Record<string, string> = {
    SHIPPED: 'The order has already shipped and cannot be cancelled.',
    IN_PROGRESS: 'The order is already in progress and cannot be cancelled.',
    PAID: 'The order is paid; cancellation is not possible.',
    REFUSED_BY_ERP: 'The cancellation was refused by the ERP.',
    REGISTRATION_REJECTED: 'The order registration was rejected; cancellation is unavailable.',
};

export interface UseCancelOrderAsStaff {
    allowed: ComputedRef<boolean>;
    cancelling: Ref<boolean>;
    error: Ref<string | null>;
    cancel: () => Promise<boolean>;
}

export function useCancelOrderAsStaff(
    orderId: () => string,
    onCancelled: () => Promise<void> | void,
): UseCancelOrderAsStaff {
    const authStore = useAuthStore();
    const allowed = computed(() => authStore.hasPermission('CancelOrder'));
    const cancelling = ref(false);
    const error = ref<string | null>(null);

    async function cancel(): Promise<boolean> {
        cancelling.value = true;
        error.value = null;
        try {
            const { cancelOrderAsStaff } = await adminApi(CancelOrderAsStaffDocument, {
                orderId: orderId(),
            });
            if ('reason' in cancelOrderAsStaff) {
                error.value = REFUSAL_TEXT[cancelOrderAsStaff.reason] ?? cancelOrderAsStaff.message;
                return false;
            }
            await onCancelled();
            return true;
        } catch (e) {
            console.error('[useCancelOrderAsStaff]', e);
            error.value = 'Failed to cancel the order. Try again later.';
            return false;
        } finally {
            cancelling.value = false;
        }
    }

    return { allowed, cancelling, error, cancel };
}
