import { describe, expect, it } from 'vitest';

import {
    buildExternalOrderInput,
    externalLine,
    orderAccountingFacts,
    orderStateFacts,
    paidAmountMinor,
} from '../../handlers/external-order-input';
import { decideOrderChangedRoute } from '../../handlers/order-changed-route';

describe('decideOrderChangedRoute', () => {
    it.each([
        [null, null, 'create-external'],
        ['uuid-1', null, 'apply-to-mivend-order'],
        [null, { isExternal: false }, 'apply-to-mivend-order'],
        [null, { isExternal: true }, 'update-external'],
        ['uuid-1', { isExternal: true }, 'update-external'],
    ] as const)('uuid=%s local=%j -> %s', (uuid, local, route) => {
        expect(decideOrderChangedRoute(uuid, local)).toBe(route);
    });
});

describe('buildExternalOrderInput', () => {
    const line = {
        productVariantId: '7',
        ratioToBase: 1,
        raw: { quantity: 2, price: 100, amount: 180 },
    };

    it('keeps a fact-less event status-less (the service decides), with the raw status kept', () => {
        const input = buildExternalOrderInput('e1', { status: '', customerId: 'cp' }, []);
        expect(input).toMatchObject({
            erpStatus: null,
            erpOrderStatus: '',
            counterpartyErpId: 'cp',
        });
    });

    it('keeps absent optional fields absent, never false or zero', () => {
        const input = buildExternalOrderInput('e1', {}, []);
        expect(input).toMatchObject({
            totalWithTaxMinor: null,
            vatTotalMinor: null,
            orderDate: null,
            contractId: null,
            documentNumber: null,
            counterpartyErpId: null,
            amountIncludesVat: true,
            paidAmountMinor: null,
        });
    });

    it('reads an explicit zero total and an explicit false includes-VAT flag', () => {
        const input = buildExternalOrderInput(
            'e1',
            { totalAmount: 0, amountIncludesVat: false, orderDate: '2025-01-02T03:04:05Z' },
            [],
        );
        expect(input).toMatchObject({
            totalWithTaxMinor: 0,
            amountIncludesVat: false,
        });
        expect(input.orderDate?.toISOString()).toBe('2025-01-02T03:04:05.000Z');
    });

    it('prices a line from its discounted amount, falling back to the unit price', () => {
        expect(externalLine(line)).toEqual({
            productVariantId: '7',
            quantity: 2,
            unitPriceMinor: 9000,
        });
        expect(externalLine({ ...line, raw: { quantity: 2, price: 100 } }).unitPriceMinor).toBe(
            10000,
        );
    });

    it('converts quantity and unit price to base units', () => {
        expect(
            externalLine({ ...line, ratioToBase: 4, raw: { quantity: 2, price: 100 } }),
        ).toMatchObject({
            quantity: 8,
            unitPriceMinor: 2500,
        });
    });
});

describe('order-state values', () => {
    it('reads paidAmount in minor units, keeping an explicit zero and never inventing one', () => {
        expect(paidAmountMinor({ paidAmount: 120.35 })).toBe(12035);
        expect(paidAmountMinor({ paidAmount: 0 })).toBe(0);
        expect(paidAmountMinor({})).toBeNull();
    });

    it.each([-5, Number.NaN, Number.POSITIVE_INFINITY, 1e12, 'abc'])(
        'ignores an unusable paidAmount %s',
        paidAmount => {
            expect(paidAmountMinor({ paidAmount })).toBeNull();
        },
    );

    it('is empty when the state carries none of the facts', () => {
        expect(orderStateFacts({ lines: [{ productId: 'p-1', reservedQuantity: 1 }] })).toEqual({});
    });

    it('keeps linked document flags and per-line shipped quantities, explicit zero included', () => {
        const facts = orderStateFacts({
            linkedDocuments: [
                { kind: 'realization', id: 'd-1', accounting: { reflectedInAccounting: true } },
                { kind: 'proforma_invoice', id: 'd-2' },
            ],
            lines: [
                { productId: 'p-1', shippedQuantityInSettlements: 0 },
                { productId: 'p-2' },
                { productId: 'p-3', shippedQuantityInSettlements: 2.5 },
            ],
        });

        expect(JSON.parse(facts.erpLinkedDocuments ?? '')).toEqual([
            { kind: 'realization', id: 'd-1', accounting: { reflectedInAccounting: true } },
        ]);
        expect(JSON.parse(facts.erpShippedInSettlements ?? '')).toEqual([
            { productId: 'p-1', quantity: 0 },
            { productId: 'p-3', quantity: 2.5 },
        ]);
    });
});

describe('orderAccountingFacts', () => {
    it('keeps an explicit false flag of the order document and nothing else', () => {
        const facts = orderAccountingFacts({
            accounting: { reflectedInAccounting: false },
            linkedDocuments: [{ kind: 'realization', id: 'd-1' }],
        });
        expect(facts).toEqual({ erpAccounting: '{"reflectedInAccounting":false}' });
    });

    it('rides on the external order input', () => {
        const input = buildExternalOrderInput(
            'e1',
            { accounting: { reflectedInAccounting: true } },
            [],
        );
        expect(input.erpFacts).toEqual({ erpAccounting: '{"reflectedInAccounting":true}' });
    });
});
