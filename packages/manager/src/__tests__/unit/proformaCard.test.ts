import { describe, expect, it } from 'vitest';
import type { ProformaCardPayment, ProformaCardVersion } from '../../api/proformaInvoiceCard';
import { paymentSummary } from '../../utils/proformaPayments';
import { timelineEntries, versionChange } from '../../utils/proformaVersionDiff';
import { changeSummary, signedMoney } from '../../utils/proformaVersionText';

function line(sku: string, quantity: number, linePriceWithTax: number, discountAmount = 0) {
    return { quantity, linePriceWithTax, discountAmount, productVariant: { name: sku, sku } };
}

function version(v: number, lines: ProformaCardVersion['lines']): ProformaCardVersion {
    return {
        id: String(v),
        number: `100-01-${v}`,
        version: v,
        kind: v === 1 ? 'order-placed' : 'order-changed',
        displayStatus: 'current',
        amount: lines.reduce((s, l) => s + l.linePriceWithTax - l.discountAmount, 0),
        issuedAt: '2026-01-01T00:00:00Z',
        lines,
    };
}

describe('versionChange', () => {
    const v1 = version(1, [line('A', 1, 1000), line('B', 2, 2000)]);

    it('counts added, removed and changed lines and the amount delta', () => {
        const v2 = version(2, [line('A', 3, 3000), line('C', 1, 500)]);
        expect(versionChange(v1, v2)).toEqual({
            amountDelta: 3500 - 3000,
            added: 1,
            removed: 1,
            changed: 1,
        });
    });

    it('a line with the same quantity and net total is unchanged', () => {
        expect(versionChange(v1, version(2, [...v1.lines]))).toMatchObject({
            added: 0,
            removed: 0,
            changed: 0,
            amountDelta: 0,
        });
    });

    it('a discount change alone is a changed line', () => {
        const v2 = version(2, [line('A', 1, 1000, 100), v1.lines[1]]);
        expect(versionChange(v1, v2)).toMatchObject({ changed: 1, amountDelta: -100 });
    });
});

describe('timelineEntries', () => {
    it('compares each version with the older one; the oldest has no change', () => {
        const entries = timelineEntries([
            version(2, [line('A', 2, 2000)]),
            version(1, [line('A', 1, 1000)]),
        ]);
        expect(entries[0].change?.amountDelta).toBe(1000);
        expect(entries[1].change).toBeNull();
    });
});

describe('version texts', () => {
    const money = (minor: number): string => `$${minor / 100}`;

    it('signs the amount delta and names an unchanged amount', () => {
        expect(signedMoney(500, money)).toBe('+$5');
        expect(signedMoney(-500, money)).toBe('−$5');
        expect(signedMoney(0, money)).toBe('Amount unchanged');
    });

    it('lists only the non-zero line changes', () => {
        expect(changeSummary({ amountDelta: 0, added: 1, removed: 0, changed: 2 })).toBe(
            '1 added, 2 changed',
        );
        expect(changeSummary({ amountDelta: 0, added: 0, removed: 0, changed: 0 })).toBe('');
    });
});

describe('paymentSummary', () => {
    const payment = (paymentStatus: string, amount: number): ProformaCardPayment => ({
        id: paymentStatus + amount,
        number: '1',
        createdAt: '2026-01-01T00:00:00Z',
        channel: 'bank-transfer-erp',
        paymentStatus,
        amount,
    });

    it('counts only received payments and never goes below zero remaining', () => {
        expect(paymentSummary(1000, [payment('captured', 400), payment('failed', 600)])).toEqual({
            paid: 400,
            remaining: 600,
        });
        expect(paymentSummary(1000, [payment('captured', 1500)])).toEqual({
            paid: 1500,
            remaining: 0,
        });
    });

    it('no payments leaves the whole amount remaining', () => {
        expect(paymentSummary(1000, [])).toEqual({ paid: 0, remaining: 1000 });
    });
});
