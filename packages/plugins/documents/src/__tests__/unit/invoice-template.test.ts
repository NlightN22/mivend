import { describe, it, expect } from 'vitest';
import { buildInvoiceTemplateData, renderInvoiceHtml } from '../../pdf/invoice-template';
import type { Order } from '@vendure/core';
import type { OrganizationRequisites } from '../../entities/organization-requisites.entity';

function makeOrder(overrides: Partial<Record<string, unknown>> = {}): Order {
    return {
        code: 'ORD-202607-TEST',
        currencyCode: 'RUB',
        orderPlacedAt: new Date('2026-07-01T10:00:00.000Z'),
        createdAt: new Date('2026-07-01T09:00:00.000Z'),
        totalWithTax: 25000,
        lines: [
            {
                quantity: 2,
                unitPriceWithTax: 10000,
                linePriceWithTax: 20000,
                productVariant: { name: 'Motor Oil 5W-30', sku: 'MOT-5W30-1L' },
            },
        ],
        ...overrides,
    } as unknown as Order;
}

function makeRequisites(overrides: Partial<OrganizationRequisites> = {}): OrganizationRequisites {
    return {
        legalName: 'Demo Trading Co.',
        legalAddress: '1 Demo Ave',
        inn: '000000000000',
        kpp: '000000000',
        ogrn: null,
        bankName: 'Demo Bank',
        bankAccount: '000000000',
        bankBik: '000000000',
        ...overrides,
    } as OrganizationRequisites;
}

describe('buildInvoiceTemplateData', () => {
    it('maps order lines, amounts and requisites correctly', () => {
        const data = buildInvoiceTemplateData(makeOrder(), makeRequisites(), 'Buyer LLC');

        expect(data.documentNumber).toBe('ORD-202607-TEST');
        expect(data.issueDate).toBe('2026-07-01');
        expect(data.seller.legalName).toBe('Demo Trading Co.');
        expect(data.seller.taxId).toBe('000000000000');
        expect(data.buyer.legalName).toBe('Buyer LLC');
        expect(data.lines).toHaveLength(1);
        expect(data.lines[0]).toEqual({
            name: 'Motor Oil 5W-30',
            sku: 'MOT-5W30-1L',
            quantity: 2,
            unitPrice: '100.00 RUB',
            lineTotal: '200.00 RUB',
        });
        expect(data.totalAmount).toBe('250.00 RUB');
    });

    it('falls back to ogrn when kpp is null for registrationNumber, and to a dash when both are null', () => {
        const withOgrn = buildInvoiceTemplateData(
            makeOrder(),
            makeRequisites({ kpp: null, ogrn: '1234567890123' }),
            'Buyer LLC',
        );
        expect(withOgrn.seller.registrationNumber).toBe('1234567890123');

        const withNeither = buildInvoiceTemplateData(
            makeOrder(),
            makeRequisites({ kpp: null, ogrn: null }),
            'Buyer LLC',
        );
        expect(withNeither.seller.registrationNumber).toBe('—');
    });

    it('omits bank details when no bank is configured', () => {
        const data = buildInvoiceTemplateData(
            makeOrder(),
            makeRequisites({ bankName: null, bankAccount: null, bankBik: null }),
            'Buyer LLC',
        );
        expect(data.seller.bankDetails).toBeNull();
    });
});

describe('renderInvoiceHtml', () => {
    it('embeds the seller, buyer, line items and total into the HTML output', () => {
        const data = buildInvoiceTemplateData(makeOrder(), makeRequisites(), 'Buyer LLC');
        const html = renderInvoiceHtml(data);

        expect(html).toContain('ORD-202607-TEST');
        expect(html).toContain('Demo Trading Co.');
        expect(html).toContain('Buyer LLC');
        expect(html).toContain('Motor Oil 5W-30');
        expect(html).toContain('250.00 RUB');
    });

    it('renders a generic initial-letter badge when no logo has been set', () => {
        const data = buildInvoiceTemplateData(makeOrder(), makeRequisites(), 'Buyer LLC');
        expect(data.logoDataUri).toBeNull();
        const html = renderInvoiceHtml(data);
        expect(html).toContain('logo--fallback');
        expect(html).toContain('>D<'); // first letter of "Demo Trading Co."
        expect(html).not.toContain('<img');
    });

    it('renders the real logo image when a logo data URI is provided', () => {
        const logoDataUri = 'data:image/png;base64,iVBORw0KGgo=';
        const data = buildInvoiceTemplateData(
            makeOrder(),
            makeRequisites(),
            'Buyer LLC',
            logoDataUri,
        );
        expect(data.logoDataUri).toBe(logoDataUri);
        const html = renderInvoiceHtml(data);
        expect(html).toContain(`<img class="logo" src="${logoDataUri}"`);
        expect(html).not.toContain('class="logo logo--fallback"');
    });
});
