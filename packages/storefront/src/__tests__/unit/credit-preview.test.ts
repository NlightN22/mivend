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
vi.mock('../../api/generated/graphql', () => ({ CreditPreviewDocument: {} }));

import { shopApi } from '../../api/client';
import { useCartStore } from '../../stores/cart';
import { useCheckoutStore, type CreditPreview } from '../../stores/checkout';
import { useCreditPreview } from '../../composables/useCreditPreview';

const make = (over: Partial<CreditPreview> = {}): CreditPreview => ({
    exceeded: false,
    availableCredit: 100,
    orderAmount: 500,
    limitControlled: true,
    allowExceedingCreditLimit: false,
    acknowledgementRequired: false,
    payableCardAmount: 500,
    availableForms: ['cash', 'bank-transfer', 'card'],
    ...over,
});
const over = (extra: Partial<CreditPreview> = {}): CreditPreview =>
    make({ exceeded: true, acknowledgementRequired: true, payableCardAmount: 900, ...extra });
const preview = (value: CreditPreview) => ({ deferredCreditPreview: value });

describe('checkout credit gating', () => {
    beforeEach(() => setActivePinia(createPinia()));

    it('lists the forms the server reports, in display order, and picks the first', () => {
        const store = useCheckoutStore();
        store.setCreditPreview(make({ availableForms: ['card', 'cash'] }));
        expect(store.availableMethods).toEqual(['card', 'cash']);
        expect(store.selectedPayment).toBe('card');
        store.setCreditPreview(make({ availableForms: ['cash', 'bank-transfer'] }));
        expect(store.selectedPayment).toBe('bank-transfer');
    });

    it.each(['cash', 'bank-transfer'] as const)(
        'blocks placing a %s order until the limit excess is acknowledged',
        form => {
            const store = useCheckoutStore();
            store.setCreditPreview(over());
            store.setPayment(form);
            expect(store.creditWarningVisible).toBe(true);
            expect(store.canPlaceOrder).toBe(false);
            store.creditAcknowledged = true;
            expect(store.canPlaceOrder).toBe(true);
        },
    );

    it('does not require the acknowledgement for a card, which pays the excess', () => {
        const store = useCheckoutStore();
        store.setCreditPreview(over());
        store.setPayment('card');
        expect(store.creditWarningVisible).toBe(false);
        expect(store.canPlaceOrder).toBe(true);
    });

    it('announces the manager wait only when exceeding is not allowed', () => {
        const store = useCheckoutStore();
        store.setCreditPreview(over());
        store.setPayment('cash');
        expect(store.waitsForManagerConfirmation).toBe(true);
        store.setCreditPreview(over({ allowExceedingCreditLimit: true }));
        expect(store.waitsForManagerConfirmation).toBe(false);
        expect(store.creditWarningVisible).toBe(true);
    });

    it('does not gate a within-limit order', () => {
        const store = useCheckoutStore();
        store.setCreditPreview(make());
        store.setPayment('bank-transfer');
        expect(store.canPlaceOrder).toBe(true);
    });

    it('stays disabled until the preview answered and while it reloads', () => {
        const store = useCheckoutStore();
        expect(store.canPlaceOrder).toBe(false);
        store.setCreditPreview(make());
        expect(store.canPlaceOrder).toBe(true);
        store.markCreditPreviewPending();
        expect(store.canPlaceOrder).toBe(false);
    });

    it('resets the acknowledgement when the numbers change', () => {
        const store = useCheckoutStore();
        store.setCreditPreview(over());
        store.setPayment('cash');
        store.creditAcknowledged = true;
        store.setCreditPreview(over());
        expect(store.creditAcknowledged).toBe(true);
        store.setCreditPreview(over({ orderAmount: 700 }));
        expect(store.creditAcknowledged).toBe(false);
    });
});

describe('useCreditPreview', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        setActivePinia(createPinia());
        vi.mocked(shopApi).mockReset();
    });
    afterEach(() => vi.useRealTimers());

    it('loads the preview on mount and debounces refetches on cart changes', async () => {
        vi.mocked(shopApi).mockResolvedValue(preview(over()) as never);
        const store = useCheckoutStore();
        const cart = useCartStore();
        effectScope().run(() => useCreditPreview());
        await vi.advanceTimersByTimeAsync(1000);
        expect(shopApi).toHaveBeenCalledTimes(1);
        expect(store.creditPreview?.exceeded).toBe(true);

        cart.order = { totalWithTax: 100 } as never;
        await nextTick();
        cart.order = { totalWithTax: 200 } as never;
        await nextTick();
        await vi.advanceTimersByTimeAsync(1000);
        expect(shopApi).toHaveBeenCalledTimes(2);
    });

    it('keeps only the latest response when responses arrive out of order', async () => {
        const resolvers: Array<(v: unknown) => void> = [];
        vi.mocked(shopApi).mockImplementation(
            () => new Promise(resolve => resolvers.push(resolve)) as never,
        );
        const store = useCheckoutStore();
        const cart = useCartStore();
        effectScope().run(() => useCreditPreview());
        await vi.advanceTimersByTimeAsync(400);
        cart.order = { totalWithTax: 100 } as never;
        await nextTick();
        await vi.advanceTimersByTimeAsync(400);
        expect(resolvers).toHaveLength(2);

        resolvers[1](preview(make({ orderAmount: 700 })));
        await vi.advanceTimersByTimeAsync(0);
        resolvers[0](preview(over({ orderAmount: 500 })));
        await vi.advanceTimersByTimeAsync(0);
        expect(store.creditPreview?.orderAmount).toBe(700);
        expect(store.creditPreview?.exceeded).toBe(false);
    });
});
