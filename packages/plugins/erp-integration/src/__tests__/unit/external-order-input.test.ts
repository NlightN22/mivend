import { describe, expect, it } from 'vitest';

import { buildExternalOrderInput, externalLine } from '../../handlers/external-order-input';
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
        const input = buildExternalOrderInput('e1', { status: '', customerId: 'cp' }, null, []);
        expect(input).toMatchObject({
            erpStatus: null,
            erpOrderStatus: '',
            counterpartyErpId: 'cp',
        });
    });

    it('keeps absent optional fields absent, never false or zero', () => {
        const input = buildExternalOrderInput('e1', {}, null, []);
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

    it('converts paidAmount to minor units, keeping an explicit zero', () => {
        expect(buildExternalOrderInput('e1', { paidAmount: 120.35 }, null, [])).toMatchObject({
            paidAmountMinor: 12035,
        });
        expect(buildExternalOrderInput('e1', { paidAmount: 0 }, null, [])).toMatchObject({
            paidAmountMinor: 0,
        });
    });

    it.each([-5, Number.NaN, Number.POSITIVE_INFINITY, 1e12, 'abc'])(
        'ignores an unusable paidAmount %s',
        paidAmount => {
            expect(buildExternalOrderInput('e1', { paidAmount }, null, [])).toMatchObject({
                paidAmountMinor: null,
            });
        },
    );

    it('reads an explicit zero total and an explicit false includes-VAT flag', () => {
        const input = buildExternalOrderInput(
            'e1',
            { totalAmount: 0, amountIncludesVat: false, orderDate: '2025-01-02T03:04:05Z' },
            'DELIVERED',
            [],
        );
        expect(input).toMatchObject({
            totalWithTaxMinor: 0,
            amountIncludesVat: false,
            erpStatus: 'DELIVERED',
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
