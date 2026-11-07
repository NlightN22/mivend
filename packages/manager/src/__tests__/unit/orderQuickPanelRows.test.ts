import { describe, expect, it } from 'vitest';
import { customerMetaText, quickPanelRows } from '../../components/orders/orderQuickPanelRows';
import type { OrderListRow } from '../../components/orders/ordersListRows';

const ROW = {
    customer: 'customer-123',
    inn: '7700000000',
    priceTypeCode: 'price-type-wholesale',
    manager: 'Pat Manager',
    branch: 'branch-a',
    total: '$10.00',
    placedBy: 'Ann Buyer',
    reservation: 'Not required',
    attention: '',
} as OrderListRow;
const NAMES = new Map([['price-type-wholesale', 'Wholesale prices']]);
const labels = (row: OrderListRow, names = NAMES): string[] =>
    quickPanelRows(row, names).map(r => r.label);

describe('order quick panel rows', () => {
    it('lists INN and the price type name next to the customer', () => {
        expect(quickPanelRows(ROW, NAMES)).toContainEqual({
            label: 'Price type',
            value: 'Wholesale prices',
        });
        expect(labels(ROW)).toEqual([
            'Customer',
            'INN',
            'Price type',
            'Manager',
            'Branch',
            'Total',
            'Placed by',
            'Reservation',
        ]);
    });

    it('leaves out rows with no data instead of showing a dash', () => {
        const bare = { ...ROW, inn: '', manager: '—', branch: '—' } as OrderListRow;
        expect(labels(bare)).toEqual([
            'Customer',
            'Price type',
            'Total',
            'Placed by',
            'Reservation',
        ]);
    });

    it('hides a price type that is unknown or only repeats its code', () => {
        expect(labels(ROW, new Map())).not.toContain('Price type');
        const sameName = new Map([['price-type-wholesale', 'PRICE-TYPE-WHOLESALE']]);
        expect(labels(ROW, sameName)).not.toContain('Price type');
    });
});

describe('customer cell second line', () => {
    it('shows INN and the price type name, joined', () => {
        expect(customerMetaText(ROW, NAMES)).toBe('INN 7700000000 · Wholesale prices');
    });

    it('drops a name that only repeats the code, and a missing INN', () => {
        const sameName = new Map([['price-type-wholesale', 'price-type-wholesale']]);
        expect(customerMetaText(ROW, sameName)).toBe('INN 7700000000');
        expect(customerMetaText({ ...ROW, inn: '' }, NAMES)).toBe('Wholesale prices');
    });

    it('is empty when there is nothing meaningful, never a dash or a raw code', () => {
        expect(
            customerMetaText({ inn: '', priceTypeCode: 'price-type-wholesale' }, new Map()),
        ).toBe('');
    });
});
