import { lazyLabels, tr } from '../utils/lazyLabels';
import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { adminApi } from '../api/client';
import { CancelOrderAsStaffDocument } from '../api/generated/graphql';
import { useAuthStore } from '../stores/auth';

export const REFUSAL_TEXT = lazyLabels('orderDetail.refusal', [
    'SHIPPED',
    'IN_PROGRESS',
    'PAID',
    'REGISTRATION_REJECTED',
]);

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
            error.value = tr('orderDetail.cancelFailed');
            return false;
        } finally {
            cancelling.value = false;
        }
    }

    return { allowed, cancelling, error, cancel };
}
