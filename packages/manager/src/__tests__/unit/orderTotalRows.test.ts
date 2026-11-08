import { describe, expect, it } from 'vitest';
import type { OrderDetail } from '../../api/orderDetail';
import { orderTotalRows } from '../../utils/orderTotalRows';

const customFields = (weight: number | null) => ({
    unitRatioToBase: weight === null ? null : 1,
    unitWeightKg: weight,
    unitVolumeM3: weight === null ? null : 0.01,
});
const order = (paid: number | null): OrderDetail =>
    ({
        subTotalWithTax: 9000,
        shippingWithTax: 500,
        totalWithTax: 9500,
        customFields: { erpPaidAmount: paid },
        lines: [
            {
                quantity: 2,
                unitPriceWithTax: 5000,
                discountedUnitPriceWithTax: 4500,
                productVariant: { customFields: customFields(1.5) },
            },
            {
                quantity: 1,
                unitPriceWithTax: 1000,
                discountedUnitPriceWithTax: 1000,
                productVariant: { customFields: customFields(null) },
            },
        ],
    }) as unknown as OrderDetail;
const money = (minor: number): string => `$${minor / 100}`;

describe('order totals rows', () => {
    it('shows known weight and volume and counts lines without data', () => {
        const rows = orderTotalRows(order(null), null, money);
        const by = Object.fromEntries(rows.map(r => [r.key, r]));
        expect(by.positions.value).toBe('2');
        expect(by.weight).toMatchObject({ value: '3.0 kg', note: '1 position without data' });
        expect(by.volume).toMatchObject({ value: '0.020 m³', note: '1 position without data' });
        expect(by.discount.value).toBe('$10');
        expect(by.total).toMatchObject({ value: '$95', emphasis: true });
    });

    it('adds the retro bonus and paid rows only when they apply', () => {
        const keys = (retro: number | null, paid: number | null): string[] =>
            orderTotalRows(order(paid), retro, money).map(r => r.key);
        expect(keys(null, null)).not.toContain('retro');
        expect(keys(null, null)).not.toContain('paid');
        expect(keys(1200, 100)).toEqual(expect.arrayContaining(['retro', 'paid']));
    });
});
