import { describe, it, expect } from 'vitest';
import {
    buildProformaInvoiceTemplateData,
    renderProformaInvoiceHtml,
    ProformaInvoiceSource,
} from '../../pdf/proforma-invoice-template';
import { type PartyInput } from '../../pdf/proforma-invoice-data';
import type { CompleteOrganizationRequisites } from '../../entities/organization-requisites.entity';

function makeSource(overrides: Partial<ProformaInvoiceSource> = {}): ProformaInvoiceSource {
    return {
        documentNumber: '1000042-01',
        issueDate: new Date('2026-10-12T10:00:00.000Z'),
        currencyCode: 'RUB',
        totalAmount: 25000,
        version: 1,
        superseded: false,
        lines: [
            {
                quantity: 2,
                unitPriceWithTax: 10000,
                linePriceWithTax: 20000,
                discounts: [],
                taxRate: 20,
                taxCategoryName: 'VAT20',
                taxAmount: 3333,
                unitName: 'шт.',
                productVariant: { name: 'Motor Oil 5W-30', sku: 'MOT-5W30-1L' },
            },
        ],
        ...overrides,
    };
}

function makeRequisites(
    overrides: Partial<CompleteOrganizationRequisites> = {},
): CompleteOrganizationRequisites {
    return {
        legalName: 'Example Supplier LLC',
        legalAddress: '1 Demo Ave',
        inn: '0000000000',
        kpp: '000000000',
        ogrn: null,
        bankName: 'Example Bank',
        bankAccount: '00000000000000000000',
        bankBik: '000000000',
        correspondentAccount: '11111111111111111111',
        signatoryName: null,
        signatoryTitle: null,
        phone: null,
        signatories: null,
        ...overrides,
    } as CompleteOrganizationRequisites;
}

const buyer: PartyInput = { name: 'Buyer LLC', inn: null, kpp: null, address: null, phone: null };

function render(source: ProformaInvoiceSource, requisites: CompleteOrganizationRequisites): string {
    return renderProformaInvoiceHtml(buildProformaInvoiceTemplateData(source, requisites, buyer));
}

describe('proforma payment QR in the print form', () => {
    it('prints the QR inside the labeled box for a valid active version', () => {
        const html = render(makeSource(), makeRequisites());
        expect(html).toMatch(/<div class="qr-box"><svg/);
        expect(html).toContain('Отсканируйте для оплаты');
    });

    it('keeps the box empty and reports the missing field when requisites are incomplete', () => {
        const data = buildProformaInvoiceTemplateData(
            makeSource(),
            makeRequisites({ correspondentAccount: null }),
            buyer,
        );
        expect(data.paymentQr).toEqual({ payload: null, problems: ['correspAcc: missing'] });
        expect(renderProformaInvoiceHtml(data)).toContain('<div class="qr-box"></div>');
    });

    it('prints no QR for a superseded version', () => {
        expect(render(makeSource({ superseded: true }), makeRequisites())).toContain(
            '<div class="qr-box"></div>',
        );
    });

    it('carries the amount of this version in kopecks and the VAT in the purpose', () => {
        const data = buildProformaInvoiceTemplateData(
            makeSource({ totalAmount: 25000 }),
            makeRequisites(),
            buyer,
        );
        expect(data.paymentQr.payload).toContain('|Sum=25000|');
        expect(data.paymentQr.payload).toContain('от 12.10.2026, в т.ч. НДС 33,33|');
    });
});
