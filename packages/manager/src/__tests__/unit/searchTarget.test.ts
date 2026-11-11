import { describe, expect, it } from 'vitest';
import { humanize, searchKindLabel, searchTarget } from '../../utils/searchTarget';

const hit = {
    id: '7',
    number: '100-0001412',
    title: 'x',
    subtitle: null,
    status: null,
    counterpartyId: null,
};

describe('searchTarget', () => {
    it('opens a customer by id and a proforma invoice by id', () => {
        expect(searchTarget('counterparty', hit)).toBe('/customers/7');
        expect(searchTarget('proformaInvoice', hit)).toBe('/proforma-invoices/7');
    });

    it('opens an order by its code', () => {
        expect(searchTarget('order', hit)).toBe('/orders/100-0001412');
    });

    it('opens the list filtered by number for kinds without a card', () => {
        expect(searchTarget('settlementDocument', hit)).toEqual({
            path: '/settlements',
            query: { search: '100-0001412' },
        });
        expect(searchTarget('discount', hit)).toEqual({
            path: '/discounts',
            query: { search: '100-0001412' },
        });
    });

    it('has no target for an unknown kind', () => {
        expect(searchTarget('mystery', hit)).toBeNull();
    });
});

describe('search labels', () => {
    it('humanizes camelCase and snake_case status text', () => {
        expect(humanize('awaitingShipment')).toBe('Awaiting shipment');
        expect(humanize('IN_PROGRESS')).toBe('In progress');
    });

    it('labels known kinds and falls back to the kind text', () => {
        expect(searchKindLabel('proformaInvoice')).toBe('Proforma invoices');
        expect(searchKindLabel('newKind')).toBe('New kind');
    });
});
