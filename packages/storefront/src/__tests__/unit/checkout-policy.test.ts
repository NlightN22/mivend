import { describe, expect, it } from 'vitest';
import {
    cardExcess,
    cardPaymentMetadata,
    isCardAmountChanged,
    orderedForms,
    placementMetadata,
    proformaPrintRoute,
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

    it('describes a cash order by its real route, not by the payment form', () => {
        const direct = describeOrderCreated('1', 'cash', false);
        expect(direct.status).toBe(
            'Your order 1 has been created. Pay cash on pickup or delivery.',
        );
        expect(direct.steps).not.toContain('The manager confirms the order.');
        const held = describeOrderCreated('1', 'cash', true);
        expect(held.status).toMatch(/A manager will confirm the order/);
        expect(held.steps).toContain('The manager confirms the order.');
    });

    it('tells a held bank transfer and a held default order that a manager confirms first', () => {
        const bank = describeOrderCreated('1', 'offline-terms', true);
        expect(bank.status).toMatch(/A manager will confirm the order first/);
        expect(bank.steps[0]).toBe('The manager confirms the order.');
        expect(bank.steps).toContain('Print the proforma invoices and send them to your bank.');
        expect(describeOrderCreated('1', 'online-stub', true).status).toMatch(
            /A manager will confirm the order/,
        );
    });

    it('keeps the unheld bank and default texts free of the manager step', () => {
        const bank = describeOrderCreated('1', 'offline-terms', false);
        expect(bank.status).toMatch(/Pay each proforma invoice/);
        expect(bank.steps).not.toContain('The manager confirms the order.');
        expect(describeOrderCreated('1', 'online-stub', false).steps).not.toContain(
            'The manager confirms the order.',
        );
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
                document: { status: 'ready', pdfUrl: '/document-pdf/a' },
            },
            { id: '2', status: 'issued', document: { status: 'generating', pdfUrl: null } },
            { id: '3', status: 'issued', document: null },
        ]);
        expect(targets).toEqual([
            { kind: 'pdf', url: '/document-pdf/a' },
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

describe('proformaPrintRoute', () => {
    it('points at the existing proforma invoice detail route with the print flag', () => {
        expect(proformaPrintRoute('42')).toEqual({
            path: '/proforma-invoices/42',
            query: { print: '1' },
        });
    });
});
