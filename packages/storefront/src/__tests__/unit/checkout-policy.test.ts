import { describe, expect, it } from 'vitest';
import {
    cardExcess,
    cardPaymentMetadata,
    isCardAmountChanged,
    orderedForms,
    placementMetadata,
    proformaPrintTargets,
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
        const proformas = [
            { id: '1', status: 'issued' },
            { id: '2', status: 'pending' },
            { id: '3', status: 'cancelled' },
        ];
        expect(proformaPrintTargets('bank-transfer', proformas)).toEqual([
            { kind: 'page', id: '1' },
            { kind: 'page', id: '2' },
        ]);
        expect(proformaPrintTargets('cash', proformas)).toEqual([]);
        expect(proformaPrintTargets('card', proformas)).toEqual([]);
        expect(proformaPrintTargets('bank-transfer', [])).toEqual([]);
    });

    it('shows the waiting-for-cash-confirmation state only for cash', () => {
        expect(describeOrderCreated('1', 'cash').waitingForCashConfirmation).toBe(true);
        expect(describeOrderCreated('1', 'offline-terms').waitingForCashConfirmation).toBe(false);
        expect(describeOrderCreated('1', 'online-stub').waitingForCashConfirmation).toBe(false);
        expect(describeOrderCreated('1', 'cash').status).toMatch(/Waiting for the manager/);
    });

    it('adds the confirmed card amount in kopecks only when a preview exists', () => {
        expect(cardPaymentMetadata('success', 100.1)).toEqual({
            status: 'success',
            expectedAmountKopecks: 10010,
        });
        expect(cardPaymentMetadata('fail', null)).toEqual({ status: 'fail' });
    });

    it('recognises the amount-changed decline by its code', () => {
        expect(isCardAmountChanged('CARD_AMOUNT_CHANGED: again')).toBe(true);
        expect(isCardAmountChanged('declined')).toBe(false);
        expect(isCardAmountChanged(undefined)).toBe(false);
    });
});

describe('proformaPrintTargets documents and versions', () => {
    it('opens the PDF when the document is ready and the page otherwise', () => {
        const targets = proformaPrintTargets('bank-transfer', [
            {
                id: '1',
                status: 'issued',
                document: { status: 'ready', asset: { source: 'http://x/a.pdf' } },
            },
            { id: '2', status: 'issued', document: { status: 'generating', asset: null } },
            { id: '3', status: 'issued', document: null },
        ]);
        expect(targets).toEqual([
            { kind: 'pdf', url: 'http://x/a.pdf' },
            { kind: 'page', id: '2' },
            { kind: 'page', id: '3' },
        ]);
    });

    it('skips cancelled and superseded snapshots', () => {
        const targets = proformaPrintTargets('bank-transfer', [
            { id: '1', status: 'superseded' },
            { id: '2', status: 'cancelled' },
            { id: '3', status: 'issued' },
        ]);
        expect(targets).toEqual([{ kind: 'page', id: '3' }]);
    });
});
