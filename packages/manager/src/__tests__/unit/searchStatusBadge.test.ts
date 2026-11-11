import { describe, expect, it } from 'vitest';
import { searchStatusBadge } from '../../utils/searchStatusBadge';

describe('searchStatusBadge', () => {
    it('colours an order by its state like the orders list', () => {
        expect(searchStatusBadge('order', 'Cancelled')).toEqual({
            label: 'Cancelled',
            variant: 'danger',
        });
        expect(searchStatusBadge('order', 'PaymentSettled')).toEqual({
            label: 'Awaiting shipment',
            variant: 'info',
        });
    });

    it('colours a proforma invoice and a customer like their lists', () => {
        expect(searchStatusBadge('proformaInvoice', 'cancelled').variant).toBe('danger');
        expect(searchStatusBadge('proformaInvoice', 'current').variant).toBe('success');
        expect(searchStatusBadge('counterparty', 'active').variant).toBe('success');
        expect(searchStatusBadge('counterparty', 'inactive').variant).toBe('neutral');
    });

    it('maps pending and rejected discounts and keeps a materialized one neutral', () => {
        expect(searchStatusBadge('discount', 'rejected').variant).toBe('danger');
        expect(searchStatusBadge('discount', 'pending').variant).toBe('info');
        expect(searchStatusBadge('discount', 'materialized').variant).toBe('neutral');
    });

    it('falls back to neutral for unknown kinds and values, not a hash colour', () => {
        expect(searchStatusBadge('order', 'Mystery').variant).toBe('neutral');
        expect(searchStatusBadge('settlementDocument', 'sales').variant).toBe('neutral');
        expect(searchStatusBadge('newKind', 'x').variant).toBe('neutral');
    });
});
