import { describe, expect, it } from 'vitest';
import { customerMetaText } from '../../components/orders/orderCustomerMeta';
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
