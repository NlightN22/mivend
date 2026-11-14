// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { toFilterColumns } from '@mivend/ui-kit/src/components/MvAdvancedDataTable/advancedDataTableTypes';
import { setLocale } from '../../i18n';
import { buildPaymentsColumns } from '../../components/payments/paymentsColumns';
import { buildProformaInvoicesColumns } from '../../components/proforma-invoices/proformaInvoicesColumns';

afterEach(() => setLocale('en'));

describe('list filter-builder labels', () => {
    it.each([
        ['payments', buildPaymentsColumns],
        ['proforma invoices', buildProformaInvoicesColumns],
    ])('%s labels change with the language when rebuilt', async (_name, build) => {
        await setLocale('en');
        const en = toFilterColumns(build()).map(c => c.label);
        await setLocale('ru');
        const ru = toFilterColumns(build()).map(c => c.label);
        expect(ru).toHaveLength(en.length);
        expect(ru).not.toEqual(en);
    });
});
