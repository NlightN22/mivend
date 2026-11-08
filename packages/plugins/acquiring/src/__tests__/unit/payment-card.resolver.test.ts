import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { AdminPaymentCardResolver, PaymentCardFieldResolver } from '../../payment-card.resolver';
import type { PaymentCardLoader } from '../../payment-card.loader';
import type {
    PaymentVisibilityService,
    VisiblePaymentCard,
} from '../../payment-visibility.service';

const ctx = {} as RequestContext;
const card = (over: Partial<VisiblePaymentCard['payment']> = {}): VisiblePaymentCard =>
    ({
        payment: { id: 7, number: '100-1', proformaInvoiceId: 3, ...over },
        counterpartyId: '5',
        counterpartyShortName: 'Alpha Co',
        counterpartyInn: '1111',
        orderId: '9',
    }) as unknown as VisiblePaymentCard;

describe('PaymentCardFieldResolver', () => {
    const loader = {
        proforma: vi.fn(async () => ({ id: '3' })),
        order: vi.fn(async () => ({ code: 'c' })),
        refundsOf: vi.fn(async () => []),
    };
    const resolver = new PaymentCardFieldResolver(loader as unknown as PaymentCardLoader);

    it('delegates proforma, order and refunds to the batched loader by id', async () => {
        await resolver.proformaInvoice(ctx, card());
        await resolver.order(ctx, card());
        await resolver.refunds(ctx, card());
        expect(loader.proforma).toHaveBeenCalledWith(ctx, '3');
        expect(loader.order).toHaveBeenCalledWith(ctx, '9', '5');
        expect(loader.refundsOf).toHaveBeenCalledWith(ctx, '7');
    });

    it('does not call the loader when there is no proforma invoice or order', () => {
        loader.proforma.mockClear();
        loader.order.mockClear();
        expect(resolver.proformaInvoice(ctx, card({ proformaInvoiceId: null }))).toBeNull();
        expect(resolver.order(ctx, { ...card(), orderId: null })).toBeNull();
        expect(loader.proforma).not.toHaveBeenCalled();
        expect(loader.order).not.toHaveBeenCalled();
    });

    it('maps the customer summary and the id as a string', () => {
        expect(resolver.customer(card())).toEqual({ id: '5', shortName: 'Alpha Co', inn: '1111' });
        expect(resolver.id(card())).toBe('7');
    });
});

describe('AdminPaymentCardResolver', () => {
    it('asks the scoped visibility service, never the plain repository', async () => {
        const findVisibleOne = vi.fn(async () => null);
        const resolver = new AdminPaymentCardResolver({
            findVisibleOne,
        } as unknown as PaymentVisibilityService);
        expect(await resolver.payment(ctx, { id: '42' })).toBeNull();
        expect(findVisibleOne).toHaveBeenCalledWith(ctx, '42');
    });
});
