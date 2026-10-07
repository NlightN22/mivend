import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { effectScope, nextTick } from 'vue';

vi.mock('@mivend/ui-kit', async () => ({
    toast: vi.fn(),
    useDebouncedCallback: (await import('../../../../ui-kit/src/composables/useDebouncedCallback'))
        .useDebouncedCallback,
    useLatestRequest: (await import('../../../../ui-kit/src/composables/useLatestRequest'))
        .useLatestRequest,
}));
vi.mock('../../api/client', () => ({ shopApi: vi.fn() }));
vi.mock('../../api/generated/graphql', () => ({ DeferredCreditPreviewDocument: {} }));

import { shopApi } from '../../api/client';
import { useCartStore } from '../../stores/cart';
import { useCheckoutStore } from '../../stores/checkout';
import { useDeferredCreditPreview } from '../../composables/useDeferredCreditPreview';

const preview = (exceeded: boolean, orderAmount = 500) => ({
    deferredCreditPreview: { exceeded, availableCredit: 100, orderAmount },
});

describe('checkout credit gating', () => {
    beforeEach(() => setActivePinia(createPinia()));

    it('blocks placing until acknowledged, only while deferred is selected', () => {
        const store = useCheckoutStore();
        store.setPayment('deferred');
        store.setCreditPreview({ exceeded: true, availableCredit: 100, orderAmount: 500 });
        expect(store.canPlaceOrder).toBe(false);
        store.creditAcknowledged = true;
        expect(store.canPlaceOrder).toBe(true);
    });

    it('drops the requirement when switching to another payment method', () => {
        const store = useCheckoutStore();
        store.setPayment('deferred');
        store.setCreditPreview({ exceeded: true, availableCredit: 100, orderAmount: 500 });
        store.setPayment('invoice');
        expect(store.creditWarningVisible).toBe(false);
        expect(store.canPlaceOrder).toBe(true);
    });

    it('does not gate a within-limit order', () => {
        const store = useCheckoutStore();
        store.setPayment('deferred');
        store.setCreditPreview({ exceeded: false, availableCredit: 900, orderAmount: 500 });
        expect(store.canPlaceOrder).toBe(true);
    });

    it('keeps deferred disabled until the preview answered and re-disables while it reloads', () => {
        const store = useCheckoutStore();
        store.setPayment('deferred');
        expect(store.canPlaceOrder).toBe(false);
        store.setCreditPreview({ exceeded: false, availableCredit: 900, orderAmount: 500 });
        expect(store.canPlaceOrder).toBe(true);
        store.markCreditPreviewPending();
        expect(store.canPlaceOrder).toBe(false);
        store.setCreditPreview(null);
        expect(store.canPlaceOrder).toBe(true);
    });

    it('does not wait for the preview when another method is selected', () => {
        const store = useCheckoutStore();
        store.setPayment('invoice');
        expect(store.canPlaceOrder).toBe(true);
    });

    it('resets the acknowledgement when the numbers change', () => {
        const store = useCheckoutStore();
        store.setPayment('deferred');
        store.setCreditPreview({ exceeded: true, availableCredit: 100, orderAmount: 500 });
        store.creditAcknowledged = true;
        store.setCreditPreview({ exceeded: true, availableCredit: 100, orderAmount: 500 });
        expect(store.creditAcknowledged).toBe(true);
        store.setCreditPreview({ exceeded: true, availableCredit: 100, orderAmount: 700 });
        expect(store.creditAcknowledged).toBe(false);
    });
});

describe('useDeferredCreditPreview', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        setActivePinia(createPinia());
        vi.mocked(shopApi).mockReset();
    });
    afterEach(() => vi.useRealTimers());

    it('debounces refetches on cart changes and ignores other payment methods', async () => {
        vi.mocked(shopApi).mockResolvedValue(preview(true) as never);
        const store = useCheckoutStore();
        const cart = useCartStore();
        store.setPayment('invoice');
        effectScope().run(() => useDeferredCreditPreview());
        await vi.advanceTimersByTimeAsync(1000);
        expect(shopApi).not.toHaveBeenCalled();

        store.setPayment('deferred');
        await nextTick();
        cart.order = { totalWithTax: 100 } as never;
        await nextTick();
        await vi.advanceTimersByTimeAsync(1000);
        expect(shopApi).toHaveBeenCalledTimes(1);
        expect(store.creditPreview?.exceeded).toBe(true);
    });

    it('keeps only the latest response when responses arrive out of order', async () => {
        const resolvers: Array<(v: unknown) => void> = [];
        vi.mocked(shopApi).mockImplementation(
            () => new Promise(resolve => resolvers.push(resolve)) as never,
        );
        const store = useCheckoutStore();
        const cart = useCartStore();
        store.setPayment('deferred');
        effectScope().run(() => useDeferredCreditPreview());
        await vi.advanceTimersByTimeAsync(400);
        cart.order = { totalWithTax: 100 } as never;
        await nextTick();
        await vi.advanceTimersByTimeAsync(400);
        expect(resolvers).toHaveLength(2);

        resolvers[1](preview(false, 700));
        await vi.advanceTimersByTimeAsync(0);
        resolvers[0](preview(true, 500));
        await vi.advanceTimersByTimeAsync(0);
        expect(store.creditPreview).toEqual({
            exceeded: false,
            availableCredit: 100,
            orderAmount: 700,
        });
    });
});
