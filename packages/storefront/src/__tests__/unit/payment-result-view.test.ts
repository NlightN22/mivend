import { describe, expect, it } from 'vitest';
import { ApiNetworkError } from '../../api/client';
import {
    describePaymentResult,
    isMissingOrderError,
    parseOrderCode,
    parsePaymentResultStatus,
} from '../../utils/paymentResultView';

describe('parsePaymentResultStatus', () => {
    it('keeps pending and fail, treats anything else as success', () => {
        expect(parsePaymentResultStatus('pending')).toBe('pending');
        expect(parsePaymentResultStatus('fail')).toBe('fail');
        expect(parsePaymentResultStatus(undefined)).toBe('success');
        expect(parsePaymentResultStatus(['fail'])).toBe('success');
    });
});

describe('parseOrderCode', () => {
    it('returns null for a missing, empty or repeated query param', () => {
        expect(parseOrderCode(undefined)).toBeNull();
        expect(parseOrderCode('  ')).toBeNull();
        expect(parseOrderCode(['A', 'B'])).toBeNull();
        expect(parseOrderCode('ABC')).toBe('ABC');
    });
});

describe('describePaymentResult', () => {
    const base = { id: '7', code: 'ORD-1', totalWithTax: 50000, customFields: null };

    it('shows the latest payment with its id, amount, method and date', () => {
        const view = describePaymentResult({
            ...base,
            payments: [
                {
                    id: '2',
                    method: 'online-stub',
                    amount: 61000,
                    state: 'Settled',
                    transactionId: 'tx-2',
                    createdAt: '2026-10-20T10:05:00Z',
                },
                {
                    id: '1',
                    method: 'online-stub',
                    amount: 50000,
                    state: 'Declined',
                    transactionId: null,
                    createdAt: '2026-10-20T10:00:00Z',
                },
            ],
        });
        expect(view).toEqual({
            orderId: '7',
            orderNumber: 'ORD-1',
            amountKopecks: 61000,
            method: 'online-stub',
            transactionId: 'tx-2',
            paidAt: '2026-10-20T10:05:00Z',
        });
    });

    it('falls back to the order total and omits payment fields when there is no payment', () => {
        const view = describePaymentResult({ ...base, payments: [] });
        expect(view.amountKopecks).toBe(50000);
        expect(view.method).toBeNull();
        expect(view.transactionId).toBeNull();
        expect(view.paidAt).toBeNull();
    });

    it('uses the ERP number for an external order, like the order list', () => {
        const view = describePaymentResult({
            ...base,
            customFields: { isExternal: true, erpRegistrationDocumentNumber: '000123' },
        });
        expect(view.orderNumber).toBe('000123');
    });
});

describe('isMissingOrderError', () => {
    it('treats a GraphQL error as a missing order', () => {
        expect(isMissingOrderError(new Error('You are not currently authorized'))).toBe(true);
    });

    it('does not treat transport failures as a missing order', () => {
        expect(isMissingOrderError(new ApiNetworkError('timeout'))).toBe(false);
        expect(isMissingOrderError(new Error('Shop API error: 502'))).toBe(false);
    });
});
