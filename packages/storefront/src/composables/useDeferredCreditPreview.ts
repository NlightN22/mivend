import { watch } from 'vue';
import { useDebouncedCallback, useLatestRequest } from '@mivend/ui-kit';
import { shopApi } from '../api/client';
import { DeferredCreditPreviewDocument } from '../api/generated/graphql';
import { useCartStore } from '../stores/cart';
import { useCheckoutStore } from '../stores/checkout';

const DEBOUNCE_MS = 300;

export function useDeferredCreditPreview(): void {
    const cartStore = useCartStore();
    const checkoutStore = useCheckoutStore();

    const { run } = useLatestRequest(
        () => shopApi(DeferredCreditPreviewDocument),
        result => checkoutStore.setCreditPreview(result.deferredCreditPreview),
    );

    const debouncedRun = useDebouncedCallback(() => {
        run().catch(() => checkoutStore.setCreditPreview(null));
    }, DEBOUNCE_MS);

    watch(
        () => [checkoutStore.selectedPayment, cartStore.totalPrice] as const,
        ([method]) => {
            if (method !== 'deferred') return;
            checkoutStore.markCreditPreviewPending();
            debouncedRun();
        },
        { immediate: true },
    );
}
