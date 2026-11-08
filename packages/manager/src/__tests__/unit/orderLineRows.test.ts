import { describe, expect, it } from 'vitest';
import type { OrderDetailLine } from '../../api/orderDetail';
import type { OrderReservation } from '../../api/reservation';
import type { OrderCheckFinding } from '../../utils/orderCheckMessages';
import { buildLineRows, discountPercent } from '../../utils/orderLineRows';

function line(over: Partial<OrderDetailLine> = {}): OrderDetailLine {
    return {
        id: 'l1',
        quantity: 2,
        unitPriceWithTax: 10000,
        discountedUnitPriceWithTax: 10000,
        discountedLinePriceWithTax: 20000,
        productVariant: { id: 'v1', name: 'Oil', sku: 'SKU-1', customFields: {} },
        customFields: { manualUnitPrice: null, manualPriceReason: null },
        ...over,
    } as OrderDetailLine;
}

function finding(checkCode: string, over: Partial<OrderCheckFinding> = {}): OrderCheckFinding {
    return {
        id: checkCode,
        checkCode,
        stage: null,
        lineRef: 'l1',
        severity: 'error',
        messageKey: `${checkCode}.x`,
        facts: {},
        computedAt: '2026-10-16T00:00:00Z',
        stale: false,
        ...over,
    };
}

const active = (quantity: number): OrderReservation =>
    ({ orderLineId: 'l1', status: 'active', quantity }) as OrderReservation;

function rowOf(
    findings: OrderCheckFinding[],
    reservations: OrderReservation[] = [],
    l = line(),
    maxDiscountPercent?: () => number | null,
) {
    return buildLineRows({
        lines: [l],
        findings,
        availability: new Map(),
        reservations,
        requests: [],
        maxDiscountPercent,
    })[0];
}

describe('line reserve', () => {
    it('does not flag the reserve before the order is confirmed', () => {
        const row = rowOf([]);
        expect(row.reserved).toBe(0);
        expect(row.reserveShort).toBe(false);
    });

    it('flags a shortfall when a confirmed order holds less than needed', () => {
        expect(rowOf([], [active(1)]).reserveShort).toBe(true);
    });

    it('flags a price below the floor from its finding', () => {
        expect(rowOf([finding('order.below-floor-price')]).belowFloor).toBe(true);
    });
});

describe('line discount', () => {
    it('derives the percent from list price versus discounted price', () => {
        expect(discountPercent(10000, 8300)).toBe(17);
        expect(discountPercent(10000, 10000)).toBeNull();
        expect(discountPercent(0, 0)).toBeNull();
    });

    it('is neutral when no limit is provided, however large the discount', () => {
        const row = rowOf([], [], line({ discountedUnitPriceWithTax: 5000 }));
        expect(row.discountPercent).toBe(50);
        expect(row.maxDiscountPercent).toBeNull();
        expect(row.discountOverLimit).toBe(false);
    });

    it('warns once a limit is provided and exceeded, not when within it', () => {
        const discounted = line({ discountedUnitPriceWithTax: 8300 });
        expect(rowOf([], [], discounted, () => 10).discountOverLimit).toBe(true);
        expect(rowOf([], [], discounted, () => 20).discountOverLimit).toBe(false);
    });
});
