import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { shopApi } from '../../api/client';
import { CancelOrderDocument } from '../../api/generated/graphql';

const NOT_CANCELLABLE = ['CANCELLED', 'PICKING', 'SHIPPING', 'DELIVERING', 'DELIVERED'];

export function canCancelOrder(erpStatus: string | null | undefined): boolean {
    return !NOT_CANCELLABLE.includes(erpStatus ?? 'PENDING');
}

export interface UseCancelOrder {
    cancelling: Ref<boolean>;
    refusalReason: Ref<string | null>;
    failed: Ref<boolean>;
    canCancel: ComputedRef<boolean>;
    cancel: () => Promise<boolean>;
}

export function useCancelOrder(
    code: () => string | undefined,
    erpStatus: () => string | null | undefined,
    onCancelled: () => Promise<void> | void,
): UseCancelOrder {
    const cancelling = ref(false);
    const refusalReason = ref<string | null>(null);
    const failed = ref(false);
    const canCancel = computed(() => canCancelOrder(erpStatus()));

    async function cancel(): Promise<boolean> {
        const orderCode = code();
        if (!orderCode) return false;
        cancelling.value = true;
        refusalReason.value = null;
        failed.value = false;
        try {
            const { cancelOrder } = await shopApi(CancelOrderDocument, { code: orderCode });
            if ('reason' in cancelOrder) {
                refusalReason.value = cancelOrder.reason;
                return false;
            }
            await onCancelled();
            return true;
        } catch (e) {
            console.error('[useCancelOrder]', e);
            failed.value = true;
            return false;
        } finally {
            cancelling.value = false;
        }
    }

    return { cancelling, refusalReason, failed, canCancel, cancel };
}
