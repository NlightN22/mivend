import { describe, expect, it } from 'vitest';
import enPayments from '../../i18n/en/payments';
import ruPayments from '../../i18n/ru/payments';
import enProforma from '../../i18n/en/proformaInvoices';
import ruProforma from '../../i18n/ru/proformaInvoices';

function keys(value: unknown, prefix = ''): string[] {
    if (typeof value !== 'object' || value === null) return [prefix];
    return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe('payments catalogues', () => {
    it('payments has the same keys in en and ru', () => {
        expect(keys(ruPayments).sort()).toEqual(keys(enPayments).sort());
    });

    it('proformaInvoices has the same keys in en and ru', () => {
        expect(keys(ruProforma).sort()).toEqual(keys(enProforma).sort());
    });
});
