import { describe, expect, it } from 'vitest';
import {
    cardExcess,
    orderedForms,
    placementMetadata,
    proformaTabIds,
} from '../../utils/checkoutPolicy';
import { describeOrderCreated } from '../../utils/orderCreatedText';

describe('checkout policy helpers', () => {
    it('orders known forms and drops unknown ones', () => {
        expect(orderedForms(['cash', 'x', 'card', 'bank-transfer'])).toEqual([
            'bank-transfer',
            'card',
            'cash',
        ]);
    });

    it('computes the card excess in rubles, never negative', () => {
        expect(cardExcess(900, 500)).toBe(400);
        expect(cardExcess(500, 500)).toBe(0);
        expect(cardExcess(100.1 + 200.2, 100.1)).toBe(200.2);
        expect(cardExcess(0, 500)).toBe(0);
    });

    it('sends the acknowledgement flag only when acknowledged', () => {
        expect(placementMetadata(true)).toEqual({ creditLimitAcknowledged: true });
        expect(placementMetadata(false)).toEqual({});
    });

    it('opens one tab per live proforma invoice for bank transfer only', () => {
        const invoices = [
            { id: '1', status: 'issued' },
            { id: '2', status: 'pending' },
            { id: '3', status: 'cancelled' },
        ];
        expect(proformaTabIds('bank-transfer', invoices)).toEqual(['1', '2']);
        expect(proformaTabIds('cash', invoices)).toEqual([]);
        expect(proformaTabIds('card', invoices)).toEqual([]);
        expect(proformaTabIds('bank-transfer', [])).toEqual([]);
    });

    it('shows the waiting-for-cash-confirmation state only for cash', () => {
        expect(describeOrderCreated('1', 'cash').waitingForCashConfirmation).toBe(true);
        expect(describeOrderCreated('1', 'offline-terms').waitingForCashConfirmation).toBe(false);
        expect(describeOrderCreated('1', 'online-stub').waitingForCashConfirmation).toBe(false);
        expect(describeOrderCreated('1', 'cash').status).toMatch(/Waiting for the manager/);
    });
});
