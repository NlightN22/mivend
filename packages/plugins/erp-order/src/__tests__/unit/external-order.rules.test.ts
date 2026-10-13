import { describe, expect, it } from 'vitest';
import type { Order, OrderState, RequestContext } from '@vendure/core';

import { externalOrderState } from '../../external-order-state';
import { externalOrderProcess, EXTERNAL_ORDER_READONLY_MESSAGE } from '../../external-order.guard';
import { computeExternalTotals } from '../../external-order.service';
import type { ExternalOrderInput } from '../../external-order.types';
import { ERP_ORDER_STATUSES } from '../../types';

const transition = (isExternal: boolean | undefined): unknown =>
    externalOrderProcess.onTransitionStart!('PaymentAuthorized', 'Cancelled' as OrderState, {
        ctx: {} as RequestContext,
        order: { customFields: { isExternal } } as unknown as Order,
    });

describe('externalOrderState', () => {
    it.each([
        ['CANCELLED', 'Cancelled'],
        ['DELIVERED', 'Delivered'],
        ['SHIPPING', 'Shipped'],
        ['DELIVERING', 'Shipped'],
        ['CONFIRMED', 'PaymentAuthorized'],
        ['APPROVED', 'PaymentAuthorized'],
    ] as const)('%s -> %s', (status, state) => {
        expect(externalOrderState(status)).toBe(state);
    });

    it('maps every ERP status to a state', () => {
        for (const status of ERP_ORDER_STATUSES) expect(externalOrderState(status)).toBeTruthy();
    });
});

describe('externalOrderProcess', () => {
    it('rejects every transition of an external order', () => {
        expect(transition(true)).toBe(EXTERNAL_ORDER_READONLY_MESSAGE);
    });

    it.each([false, undefined])('lets a mivend order through (isExternal=%s)', value => {
        expect(transition(value)).toBeUndefined();
    });
});

describe('computeExternalTotals', () => {
    const base = {
        lines: [{ productVariantId: '1', quantity: 2, unitPriceMinor: 1000 }],
    } as unknown as ExternalOrderInput;

    it('splits VAT out of an inclusive total', () => {
        expect(
            computeExternalTotals({
                ...base,
                totalWithTaxMinor: 12000,
                vatTotalMinor: 2000,
                amountIncludesVat: true,
            }),
        ).toEqual({ subTotal: 10000, subTotalWithTax: 12000 });
    });

    it('adds VAT on top of an exclusive total', () => {
        expect(
            computeExternalTotals({
                ...base,
                totalWithTaxMinor: 10000,
                vatTotalMinor: 2000,
                amountIncludesVat: false,
            }),
        ).toEqual({ subTotal: 10000, subTotalWithTax: 12000 });
    });

    it('falls back to the lines when the total is absent, zero stays zero', () => {
        const absent = {
            ...base,
            totalWithTaxMinor: null,
            vatTotalMinor: null,
            amountIncludesVat: true,
        };
        expect(computeExternalTotals(absent).subTotalWithTax).toBe(2000);
        expect(computeExternalTotals({ ...absent, totalWithTaxMinor: 0 }).subTotalWithTax).toBe(0);
    });
});
