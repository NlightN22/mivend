import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const push = vi.fn();
vi.mock('vue-router', () => ({
    useRouter: () => ({ push, resolve: (l: { path: string }) => ({ href: l.path }) }),
}));
vi.mock('@mivend/ui-kit', () => ({ toast: vi.fn() }));
vi.mock('../../api/client', () => ({ shopApi: vi.fn() }));
vi.mock('../../api/generated/graphql', () => ({
    CompleteOrderPaymentDocument: 'pay',
    OrderProformaInvoicesDocument: 'invoices',
}));

import { shopApi } from '../../api/client';
import { useCartStore } from '../../stores/cart';
import { useCheckoutStore } from '../../stores/checkout';
import { useOrderPlacement } from '../../composables/useOrderPlacement';

const placed = { addPaymentToOrder: { __typename: 'Order', code: 'ORD-1' } };

describe('useOrderPlacement', () => {
    const open = vi.fn();
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.mocked(shopApi).mockReset();
        push.mockReset();
        open.mockReset();
        vi.stubGlobal('window', { open });
        const cart = useCartStore();
        vi.spyOn(cart, 'beginCheckout').mockResolvedValue(true);
        vi.spyOn(cart, 'fetchCart').mockResolvedValue(undefined);
    });

    it('bank transfer opens the PDF when ready and lands on the order-created page', async () => {
        vi.mocked(shopApi)
            .mockResolvedValueOnce(placed as never)
            .mockResolvedValueOnce({
                myProformaInvoices: {
                    items: [
                        {
                            id: '7',
                            status: 'issued',
                            document: { status: 'ready', asset: { source: '/assets/a.pdf' } },
                        },
                    ],
                },
            } as never);
        useCheckoutStore().setPayment('bank-transfer');
        await useOrderPlacement().place();
        expect(open).toHaveBeenCalledWith('/assets/a.pdf', '_blank');
        expect(push).toHaveBeenCalledWith({ path: '/order-created', query: { code: 'ORD-1' } });
    });

    it('bank transfer falls back to a printable page per proforma invoice when no PDF is ready', async () => {
        vi.mocked(shopApi)
            .mockResolvedValueOnce(placed as never)
            .mockResolvedValue({
                myProformaInvoices: {
                    items: [
                        { id: '7', status: 'issued' },
                        { id: '8', status: 'issued' },
                    ],
                },
            } as never);
        useCheckoutStore().setPayment('bank-transfer');
        await useOrderPlacement().place();
        expect(shopApi).toHaveBeenNthCalledWith(1, 'pay', {
            method: 'offline-terms',
            metadata: {},
        });
        expect(open).toHaveBeenCalledTimes(2);
        expect(push).toHaveBeenCalledWith({ path: '/order-created', query: { code: 'ORD-1' } });
    });

    it('cash sends the acknowledgement and opens no tabs', async () => {
        vi.mocked(shopApi).mockResolvedValueOnce(placed as never);
        const checkout = useCheckoutStore();
        checkout.setCreditPreview({
            exceeded: true,
            availableCredit: 0,
            orderAmount: 10,
            limitControlled: true,
            allowExceedingCreditLimit: true,
            acknowledgementRequired: true,
            payableCardAmount: 10,
            availableForms: ['cash'],
        });
        checkout.creditAcknowledged = true;
        await useOrderPlacement().place();
        expect(shopApi).toHaveBeenCalledTimes(1);
        expect(shopApi).toHaveBeenCalledWith('pay', {
            method: 'cash',
            metadata: { creditLimitAcknowledged: true },
        });
        expect(open).not.toHaveBeenCalled();
    });

    it('card goes to the payment page without placing a payment', async () => {
        useCheckoutStore().setPayment('card');
        await useOrderPlacement().place();
        expect(push).toHaveBeenCalledWith('/payment-stub');
        expect(shopApi).not.toHaveBeenCalled();
    });

    it('keeps the customer on checkout when the payment is rejected', async () => {
        vi.mocked(shopApi).mockResolvedValueOnce({
            addPaymentToOrder: { __typename: 'PaymentFailedError', message: 'no' },
        } as never);
        useCheckoutStore().setPayment('cash');
        await useOrderPlacement().place();
        expect(push).not.toHaveBeenCalled();
    });
});
