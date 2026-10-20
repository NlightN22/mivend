import { describe, expect, it } from 'vitest';

import {
    buildProformaInvoiceTemplateData,
    contractPaymentPurpose,
    type ProformaInvoiceSource,
} from '../../pdf/proforma-invoice-data';
import type { CompleteOrganizationRequisites } from '../../entities/organization-requisites.entity';

const requisites = {
    legalName: 'Example Supplier LLC',
    legalAddress: '1 Demo Ave',
    inn: '0000000000',
    kpp: '000000000',
    bankName: 'Example Bank',
    bankAccount: '00000000000000000000',
    bankBik: '000000000',
    correspondentAccount: '11111111111111111111',
    signatoryName: null,
    signatoryTitle: null,
    phone: null,
    signatories: null,
} as unknown as CompleteOrganizationRequisites;

const source: ProformaInvoiceSource = {
    documentNumber: '1000000007',
    issueDate: new Date('2026-10-20T10:00:00.000Z'),
    currencyCode: 'RUB',
    totalAmount: 6_000_000,
    dueDate: null,
    version: 1,
    kind: 'debt-repayment',
    salesInvoiceNumber: null,
    hasNewerVersion: false,
    paymentPurpose: contractPaymentPurpose('1000000007', 'K-1'),
    lines: [
        {
            quantity: 1,
            unitPriceWithTax: 6_000_000,
            linePriceWithTax: 6_000_000,
            discounts: [],
            unitName: null,
            productVariant: { name: 'Погашение задолженности по договору K-1', sku: '' },
        },
    ],
};

describe('contract payment purpose', () => {
    it('prints the purpose with the number and contract and puts it into the payment QR', () => {
        const data = buildProformaInvoiceTemplateData(source, requisites, {
            name: 'Buyer',
            inn: null,
            kpp: null,
            address: null,
            phone: null,
        });
        expect(data.purposeLine).toBe(
            'Назначение платежа: Оплата по счету № 1000000007 по договору K-1',
        );
        expect(data.paymentQr.payload).toContain(
            'Purpose=Оплата по счету № 1000000007 по договору K-1',
        );
        expect(data.versionLabel).toBeNull();
    });
});
