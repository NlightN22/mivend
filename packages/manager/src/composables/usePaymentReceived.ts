import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { adminApi } from '../api/client';
import { ConfirmPaymentReceivedDocument } from '../api/generated/graphql';
import { useAuthStore } from '../stores/auth';

export interface UsePaymentReceived {
    allowed: ComputedRef<boolean>;
    confirming: Ref<boolean>;
    error: Ref<string | null>;
    confirm: () => Promise<boolean>;
}

export function usePaymentReceived(
    orderId: () => string,
    onConfirmed: () => Promise<void> | void,
): UsePaymentReceived {
    const authStore = useAuthStore();
    const allowed = computed(() => authStore.hasPermission('ConfirmPaymentReceived'));
    const confirming = ref(false);
    const error = ref<string | null>(null);

    async function confirm(): Promise<boolean> {
        confirming.value = true;
        error.value = null;
        try {
            await adminApi(ConfirmPaymentReceivedDocument, { orderId: orderId() });
            await onConfirmed();
            return true;
        } catch (e) {
            console.error('[usePaymentReceived]', e);
            error.value = 'Failed to confirm the payment. Try again later.';
            return false;
        } finally {
            confirming.value = false;
        }
    }

    return { allowed, confirming, error, confirm };
}
